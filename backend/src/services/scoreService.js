const mongoose = require('mongoose');
const Answer = require('../models/Answer');
const Score = require('../models/Score');
const Session = require('../models/Session');
const QuizAttempt = require('../models/QuizAttempt');

/**
 * calculateScores(sessionId)
 *
 * 1. Fetches all Answer records for the session.
 * 2. Grades each student's answers against the quiz's correct answers.
 * 3. Computes timeTaken from session.startedAt → student's last answer (backend clock).
 * 4. Upserts a Score record (kept for backward compatibility).
 * 5. Upserts a QuizAttempt record using studentId as the authoritative key
 *    (falls back to displayName-only for anonymous/guest participants).
 * 6. Calls getLeaderboard() to assign live ranks and persist rankAtSubmission.
 * 7. Returns the full ranked leaderboard.
 */
async function calculateScores(sessionId) {
  const session = await Session.findById(sessionId).populate('quizId');
  const quiz = session.quizId;
  const total = quiz.questions.length;
  const now = new Date();

  // Reference time: when the quiz started (authoritative backend clock)
  const refTime = session.startedAt || session.createdAt;

  // Build correctAnswer map  { questionId (string) → correctAnswer }
  const correctMap = {};
  for (const q of quiz.questions) {
    correctMap[q._id.toString()] = q.correctAnswer;
  }

  // Build participant metadata map  { displayName → { studentId, rollNumber, section, course } }
  // studentId is a string (MongoDB ObjectId as string) or null for guests.
  const participantMap = {};
  for (const p of session.participants) {
    participantMap[p.displayName] = {
      studentId:  p.studentId ? p.studentId.toString() : null,
      rollNumber: p.rollNumber || '',
      section:    p.section    || '',
      course:     p.course     || '',
    };
  }

  const answers = await Answer.find({ sessionId });

  // Group answers by displayName (Answer model keys on displayName — unchanged)
  const byStudent = {};
  for (const ans of answers) {
    if (!byStudent[ans.displayName]) byStudent[ans.displayName] = [];
    byStudent[ans.displayName].push(ans);
  }

  // Grade each student and upsert Score + QuizAttempt
  for (const [displayName, studentAnswers] of Object.entries(byStudent)) {
    const correctAnswers = studentAnswers.filter(
      (a) => correctMap[a.questionId.toString()] === a.selectedOption
    ).length;
    const incorrectAnswers = total - correctAnswers;
    const percentage = total > 0 ? Math.round((correctAnswers / total) * 1000) / 10 : 0;

    // Per-student end time = latest answer.submittedAt (server-side timestamp)
    const latestAnswer = studentAnswers.reduce(
      (latest, a) => (a.submittedAt > latest.submittedAt ? a : latest),
      studentAnswers[0]
    );
    const studentEndTime = latestAnswer?.submittedAt || now;
    const timeTaken = Math.max(0, Math.round((studentEndTime - refTime) / 1000));

    const meta = participantMap[displayName] || { studentId: null, rollNumber: '', section: '', course: '' };
    const studentId = meta.studentId
      ? new mongoose.Types.ObjectId(meta.studentId)
      : null;

    // ── Keep existing Score record for backward compatibility ──
    await Score.findOneAndUpdate(
      { sessionId, displayName },
      { sessionId, displayName, score: correctAnswers, total, calculatedAt: now },
      { upsert: true, new: true }
    );

    // ── Upsert QuizAttempt ────────────────────────────────────────────────────
    //
    // Filter key logic:
    //   - Registered student (studentId != null):
    //       filter = { sessionId, studentId }
    //       This is covered by the sparse unique index on (sessionId, studentId).
    //       Using studentId as the key means two students with the same displayName
    //       will produce separate documents and never collide.
    //
    //   - Guest (studentId == null):
    //       filter = { sessionId, displayName, studentId: null }
    //       Covered by the partial unique index on (sessionId, displayName)
    //       where studentId is null.
    //
    const upsertFilter = studentId
      ? { sessionId, studentId }
      : { sessionId, displayName, studentId: null };

    await QuizAttempt.findOneAndUpdate(
      upsertFilter,
      {
        sessionId,
        quizId:           quiz._id,
        studentId,        // null for guests
        displayName,      // always set for leaderboard display
        correctAnswers,
        incorrectAnswers,
        totalQuestions:   total,
        score:            correctAnswers,
        percentage,
        timeTaken,
        submittedAt:      studentEndTime,
        rollNumber:       meta.rollNumber,
        section:          meta.section,
        course:           meta.course,
      },
      { upsert: true, new: true }
    );
  }

  // Build and return the ranked leaderboard (also persists rankAtSubmission)
  return getLeaderboard(sessionId);
}

/**
 * getLeaderboard(sessionId)
 *
 * Retrieves all QuizAttempt records for the session, sorts them by the canonical
 * ranking rules, assigns 1-based ranks, persists rankAtSubmission back to each
 * document via bulkWrite, and returns the ranked array.
 *
 * Sorting rules (priority order):
 *   1. correctAnswers DESC  — more correct answers → higher rank
 *   2. timeTaken ASC        — faster completion → higher rank on tie
 *   3. submittedAt ASC      — earlier submission → higher rank on further tie (deterministic)
 *
 * This is the single authoritative implementation used by BOTH the teacher and
 * student API endpoints, guaranteeing they always return identical rankings.
 */
async function getLeaderboard(sessionId) {
  const attempts = await QuizAttempt.find({ sessionId }).lean();

  // Canonical sort
  attempts.sort((a, b) => {
    if (b.correctAnswers !== a.correctAnswers) return b.correctAnswers - a.correctAnswers; // DESC
    if (a.timeTaken !== b.timeTaken)           return a.timeTaken - b.timeTaken;           // ASC
    return new Date(a.submittedAt) - new Date(b.submittedAt);                               // ASC tie-break
  });

  // Assign ranks and persist
  const bulkOps = [];
  const ranked = attempts.map((attempt, index) => {
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
    await QuizAttempt.bulkWrite(bulkOps);
  }

  return ranked;
}

module.exports = { calculateScores, getLeaderboard };
