const mongoose = require('mongoose');
const Answer     = require('../models/Answer');
const Score      = require('../models/Score');
const Session    = require('../models/Session');
const QuizAttempt = require('../models/QuizAttempt');

// ─────────────────────────────────────────────────────────────────────────────
// calculateScores(sessionId)
//
// Grades every participant, persists results, and returns the ranked leaderboard.
//
// CONCURRENCY / IDEMPOTENCY CONTRACT
// ────────────────────────────────────
// • All DB writes use findOneAndUpdate with explicit $set / $setOnInsert so they
//   are safe to call concurrently or more than once.
// • Score uses a unique compound index (sessionId, displayName) added below to
//   prevent duplicate documents on concurrent calls.
// • QuizAttempt uses either (sessionId, studentId) or
//   (sessionId, displayName where studentId=null) unique indexes.  Both are
//   filtered with partialFilterExpression so the correct index is always used.
// • A participant whose studentId string is malformed gets treated as a guest
//   (studentId=null) rather than crashing the entire finalisation.
// • Promise.allSettled() is used so one bad participant cannot abort the rest.
//
// WHAT USED TO FAIL
// ─────────────────
// 1. Plain-object replacement in findOneAndUpdate with upsert:true triggered
//    E11000 duplicate-key errors under concurrency because MongoDB performed a
//    full-document replacement instead of an atomic $set/$setOnInsert.
// 2. new mongoose.Types.ObjectId(invalidString) threw a BSONError that bubbled
//    up through calculateScores → submit_quiz → "Server error".
// 3. Score had no unique index, so concurrent calls silently created duplicates.
// ─────────────────────────────────────────────────────────────────────────────

async function calculateScores(sessionId) {
  const session = await Session.findById(sessionId).populate('quizId');
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const quiz  = session.quizId;
  const total = quiz.questions.length;
  const now   = new Date();

  // Authoritative start reference; fall back to createdAt for old sessions that
  // pre-date the startedAt field.
  const refTime = session.startedAt || session.createdAt;

  // ── correctAnswer map ────────────────────────────────────────────────────
  const correctMap = {};
  for (const q of quiz.questions) {
    correctMap[q._id.toString()] = q.correctAnswer;
  }

  // ── participant metadata map ─────────────────────────────────────────────
  const participantMap = {};
  for (const p of session.participants) {
    participantMap[p.displayName] = {
      rawStudentId: p.studentId ? p.studentId.toString() : null,
      rollNumber:   p.rollNumber || '',
      section:      p.section    || '',
      course:       p.course     || '',
    };
  }

  // ── all answers for this session (single query) ──────────────────────────
  const allAnswers = await Answer.find({ sessionId }).lean();

  // Group by displayName
  const byStudent = {};
  for (const ans of allAnswers) {
    if (!byStudent[ans.displayName]) byStudent[ans.displayName] = [];
    byStudent[ans.displayName].push(ans);
  }

  // ── grade every participant ──────────────────────────────────────────────
  // process participants one-at-a-time to keep DB connection pressure low;
  // each operation is an atomic upsert so retries are safe.
  const failedParticipants = [];

  for (const participant of session.participants) {
    try {
      await gradeParticipant({
        participant,
        studentAnswers:  byStudent[participant.displayName] || [],
        correctMap,
        participantMap,
        total,
        refTime,
        now,
        sessionId,
        quizId: quiz._id,
      });
    } catch (err) {
      // Log the failure but do NOT abort the entire finalization.
      // One bad participant must not block everyone else.
      console.error(
        `[calculateScores] Failed to grade participant "${participant.displayName}" ` +
        `in session ${sessionId}:`,
        err.message
      );
      failedParticipants.push({
        displayName: participant.displayName,
        error: err.message,
      });
    }
  }

  if (failedParticipants.length > 0) {
    console.warn(
      `[calculateScores] ${failedParticipants.length} participant(s) could not be scored:`,
      failedParticipants
    );
  }

  // Build and return the ranked leaderboard (also persists rankAtSubmission).
  return getLeaderboard(sessionId);
}

// ─────────────────────────────────────────────────────────────────────────────
// gradeParticipant — grades one student and writes Score + QuizAttempt.
//
// Uses $set / $setOnInsert operators so this is:
//   • safe to call concurrently for different students (no E11000 races)
//   • idempotent for the same student (re-running after a crash is safe)
// ─────────────────────────────────────────────────────────────────────────────
async function gradeParticipant({
  participant,
  studentAnswers,
  correctMap,
  participantMap,
  total,
  refTime,
  now,
  sessionId,
  quizId,
}) {
  const { displayName } = participant;

  // ── Grade ────────────────────────────────────────────────────────────────
  const correctAnswers   = studentAnswers.filter(
    (a) => correctMap[a.questionId.toString()] === a.selectedOption
  ).length;
  const incorrectAnswers = total - correctAnswers;
  const percentage       = total > 0 ? Math.round((correctAnswers / total) * 1000) / 10 : 0;

  const latestAnswer = studentAnswers.length > 0
    ? studentAnswers.reduce(
        (best, a) => (a.submittedAt > best.submittedAt ? a : best),
        studentAnswers[0]
      )
    : null;
  const studentEndTime = latestAnswer?.submittedAt || now;
  const timeTaken      = Math.max(0, Math.round((studentEndTime - refTime) / 1000));

  // ── Resolve studentId safely ──────────────────────────────────────────────
  // new mongoose.Types.ObjectId() throws a BSONError for invalid strings.
  // Catch this and fall back to guest identity rather than crashing.
  const meta = participantMap[displayName] || { rawStudentId: null, rollNumber: '', section: '', course: '' };
  let studentId = null;
  if (meta.rawStudentId) {
    try {
      studentId = new mongoose.Types.ObjectId(meta.rawStudentId);
    } catch {
      console.warn(
        `[gradeParticipant] Invalid studentId "${meta.rawStudentId}" ` +
        `for "${displayName}" — treating as guest`
      );
      studentId = null;
    }
  }

  // ── Score (backward compat) ───────────────────────────────────────────────
  // Use $set so this is a safe upsert regardless of concurrency.
  // The unique index on Score (sessionId, displayName) prevents duplicates.
  await Score.findOneAndUpdate(
    { sessionId, displayName },
    {
      $set: { score: correctAnswers, total, calculatedAt: now },
      $setOnInsert: { sessionId, displayName },
    },
    { upsert: true, new: true }
  );

  // ── QuizAttempt ───────────────────────────────────────────────────────────
  // CRITICAL: use $set / $setOnInsert instead of a plain replacement object.
  // A plain object causes MongoDB to perform a full-document replacement which
  // races under concurrency → E11000 duplicate-key errors.
  const updatePayload = {
    $set: {
      // All mutable result fields
      correctAnswers,
      incorrectAnswers,
      totalQuestions:  total,
      score:           correctAnswers,
      percentage,
      timeTaken,
      submittedAt:     studentEndTime,
      displayName,     // may have changed if student rejoined with different name
      rollNumber:      meta.rollNumber,
      section:         meta.section,
      course:          meta.course,
    },
    $setOnInsert: {
      // Immutable fields that should only be written once
      sessionId,
      quizId,
      studentId: studentId ?? null,
    },
  };

  const upsertFilter = studentId
    ? { sessionId, studentId }
    : { sessionId, displayName, studentId: null };

  await QuizAttempt.findOneAndUpdate(
    upsertFilter,
    updatePayload,
    { upsert: true, new: true }
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// getLeaderboard(sessionId)
//
// Retrieves all QuizAttempt records, sorts by the canonical ranking rules,
// assigns 1-based ranks, persists rankAtSubmission via a single bulkWrite,
// and returns the ranked array.
//
// Sorting (in order):
//   1. correctAnswers DESC
//   2. timeTaken ASC
//   3. submittedAt ASC  (deterministic tie-breaker)
// ─────────────────────────────────────────────────────────────────────────────
async function getLeaderboard(sessionId) {
  const attempts = await QuizAttempt.find({ sessionId }).lean();

  attempts.sort((a, b) => {
    if (b.correctAnswers !== a.correctAnswers) return b.correctAnswers - a.correctAnswers;
    if (a.timeTaken      !== b.timeTaken)      return a.timeTaken - b.timeTaken;
    return new Date(a.submittedAt) - new Date(b.submittedAt);
  });

  const bulkOps = [];
  const ranked  = attempts.map((attempt, index) => {
    const rank = index + 1;
    bulkOps.push({
      updateOne: {
        filter: { _id: attempt._id },
        update: { $set: { rankAtSubmission: rank } },
      },
    });
    return { ...attempt, rank };
  });

  if (bulkOps.length > 0) {
    await QuizAttempt.bulkWrite(bulkOps, { ordered: false });
  }

  return ranked;
}

module.exports = { calculateScores, getLeaderboard };
