/**
 * handlers.js — Socket.IO event handlers for the live quiz system.
 *
 * TIMED QUIZ MODEL
 * ─────────────────
 * • The teacher sets a durationMinutes when creating the quiz.
 * • start_quiz records session.startedAt and session.endsAt on the server.
 * • One global Node.js setTimeout per room auto-finalizes the session when
 *   endsAt is reached.
 * • Students navigate questions INDEPENDENTLY via student_next_question.
 * • The teacher sees a live countdown and live ranking; there is NO
 *   "next question" button for the teacher.
 * • The teacher can end early via end_quiz (same finalization path).
 * • submit_answer accepts the student's current questionIndex and validates
 *   both the deadline and that the index matches their progress record.
 *
 * CONCURRENCY / IDEMPOTENCY
 * ──────────────────────────
 * All previous fixes from scoreService.js and the ACTIVE→FINISHING atomic
 * claim are preserved exactly. See scoreService.js for details.
 */

'use strict';
const jwt     = require('jsonwebtoken');
const Session = require('../models/Session');
const Quiz    = require('../models/Quiz');
const Answer  = require('../models/Answer');
const { calculateScores } = require('../services/scoreService');

// ── In-memory maps ────────────────────────────────────────────────────────────

/** roomCode → teacher's socket.id (for targeted teacher pushes) */
const teacherSockets = {};

/** roomCode → NodeJS Timeout handle (auto-finalize on timer expiry) */
const quizTimers = {};

// ── Helpers ───────────────────────────────────────────────────────────────────

function verifyToken(token) {
  try { return jwt.verify(token, process.env.JWT_SECRET || 'secret'); }
  catch { return null; }
}

/** Strip correctAnswer before sending a question to a student. */
function safeQuestion(question, index, total) {
  return { questionId: question._id, text: question.text, options: question.options, index, total };
}

function fmt(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;
}

/** Cancel any pending auto-finalize timer for this room. */
function clearQuizTimer(roomCode) {
  if (quizTimers[roomCode]) {
    clearTimeout(quizTimers[roomCode]);
    delete quizTimers[roomCode];
  }
}

/**
 * buildLiveRanking(sessionId)
 *
 * Reads all Answer records for the session in memory and returns a lightweight
 * ranking array. Used for the teacher's live leaderboard view.
 * Does NOT write to the database — this is read-only and fast.
 *
 * Ranking order (mirrors final scoreService rules):
 *   1. correctAnswers DESC
 *   2. latestAnswerTime ASC  (proxy for timeTaken while quiz is running)
 *   3. displayName ASC       (stable tie-breaker)
 */
async function buildLiveRanking(session) {
  const quiz    = session.quizId;   // already populated
  const answers = await Answer.find({ sessionId: session._id }).lean();

  // Build correctAnswer map
  const correctMap = {};
  for (const q of quiz.questions) correctMap[q._id.toString()] = q.correctAnswer;

  // Group by displayName
  const byStudent = {};
  for (const ans of answers) {
    if (!byStudent[ans.displayName]) byStudent[ans.displayName] = [];
    byStudent[ans.displayName].push(ans);
  }

  // Build per-student progress map from session
  const progressMap = {};
  for (const sp of (session.studentProgress || [])) {
    progressMap[sp.displayName] = sp.currentQuestionIndex;
  }

  const rows = session.participants.map(p => {
    const studentAnswers = byStudent[p.displayName] || [];
    const correct = studentAnswers.filter(
      a => correctMap[a.questionId.toString()] === a.selectedOption
    ).length;
    const latestMs = studentAnswers.length
      ? Math.max(...studentAnswers.map(a => new Date(a.submittedAt).getTime()))
      : 0;
    const questionsDone = progressMap[p.displayName] ?? 0;
    return { displayName: p.displayName, correct, latestMs, questionsDone };
  });

  rows.sort((a, b) => {
    if (b.correct !== a.correct) return b.correct - a.correct;
    if (a.latestMs !== b.latestMs) return a.latestMs - b.latestMs;
    return a.displayName.localeCompare(b.displayName);
  });

  const refTime = session.startedAt ? new Date(session.startedAt).getTime() : 0;
  return rows.map((r, i) => ({
    rank:          i + 1,
    displayName:   r.displayName,
    correct:       r.correct,
    timeTakenMs:   r.latestMs > 0 ? r.latestMs - refTime : null,
    questionsDone: r.questionsDone,
    total:         quiz.questions.length,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Core finalization — reused by timer-expiry AND teacher end_quiz
// ─────────────────────────────────────────────────────────────────────────────

/**
 * finalizeSession(io, roomCode, trigger)
 *
 * Atomically claims ACTIVE → FINISHING, then calculates scores and marks
 * COMPLETED. Safe to call concurrently from timer and teacher button
 * because the findOneAndUpdate atomic claim ensures only one call proceeds.
 *
 * trigger: 'timer' | 'teacher'  (for logging only)
 */
async function finalizeSession(io, roomCode, trigger) {
  let claimedSession = null;
  try {
    clearQuizTimer(roomCode);

    // ── Atomic claim: only one caller can change ACTIVE → FINISHING ──────────
    const session = await Session.findOneAndUpdate(
      { roomCode, state: 'active' },
      { $set: { state: 'finishing' } },
      { new: true }
    ).populate('quizId');

    if (!session) {
      // Already finishing or completed — silently ignore
      const existing = await Session.findOne({ roomCode }).select('state');
      console.log(
        `[finalizeSession] Skipped — room ${roomCode} already in state ` +
        `${existing?.state ?? 'not found'} (trigger: ${trigger})`
      );
      return null;
    }

    claimedSession = session;

    console.log(
      `[finalizeSession] Starting — room ${roomCode} | session ${session._id} | ` +
      `trigger: ${trigger} | participants: ${session.participants.length}`
    );

    // ── Calculate scores (idempotent upserts — see scoreService.js) ──────────
    const rankedLeaderboard = await calculateScores(session._id);

    // ── Mark completed atomically ─────────────────────────────────────────────
    await Session.findByIdAndUpdate(session._id, { $set: { state: 'completed' } });

    const totalParticipants = rankedLeaderboard.length;

    // ── Deliver per-student results ───────────────────────────────────────────
    const allSockets = await io.in(roomCode).fetchSockets();
    for (const s of allSockets) {
      if (s.data.role !== 'student') continue;
      const entry = s.data.studentId
        ? rankedLeaderboard.find(r => r.studentId?.toString() === s.data.studentId?.toString())
        : rankedLeaderboard.find(r => r.displayName === s.data.displayName);
      if (entry) {
        s.emit('quiz_results', {
          score:            entry.correctAnswers,
          total:            entry.totalQuestions,
          quizTitle:        session.quizId.title,
          sessionId:        session._id.toString(),
          correctAnswers:   entry.correctAnswers,
          incorrectAnswers: entry.incorrectAnswers,
          totalQuestions:   entry.totalQuestions,
          percentage:       entry.percentage,
          timeTaken:        entry.timeTaken,
          rank:             entry.rank,
          totalParticipants,
        });
      }
    }

    // ── Deliver final leaderboard to teacher ──────────────────────────────────
    const teacherSocketId = teacherSockets[roomCode];
    if (teacherSocketId) {
      io.to(teacherSocketId).emit('all_results', { results: rankedLeaderboard });
      delete teacherSockets[roomCode];
    }

    console.log(`[finalizeSession] Complete — room ${roomCode} | ${totalParticipants} students`);
    return rankedLeaderboard;

  } catch (err) {
    console.error(`[finalizeSession] ERROR — room ${roomCode}:`, err.message, err.stack);

    // Revert to active so teacher can retry
    if (claimedSession) {
      await Session.updateOne(
        { _id: claimedSession._id, state: 'finishing' },
        { $set: { state: 'active' } }
      ).catch(e => console.error('[finalizeSession] Revert failed:', e.message));
    }

    // Notify teacher of the real error
    const teacherSocketId = teacherSockets[roomCode];
    if (teacherSocketId) {
      io.to(teacherSocketId).emit('error', {
        message: `Quiz finalization failed: ${err.message}`,
        code: 'FINALIZATION_ERROR',
      });
    }
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Register all socket event handlers
// ─────────────────────────────────────────────────────────────────────────────

module.exports = function registerHandlers(io) {
  io.on('connection', (socket) => {

    // ─────────────────────────────────────────────
    // JOIN ROOM
    // ─────────────────────────────────────────────
    socket.on('join_room', async ({
      roomCode,
      token,        // teacher JWT
      studentToken, // student JWT (optional)
      displayName,
      rollNumber,
      section,
      course,
    }) => {
      try {
        const session = await Session.findOne({ roomCode }).populate('quizId');
        if (!session) {
          return socket.emit('error', { message: 'Session not found', code: 'SESSION_NOT_FOUND' });
        }

        // ── Teacher join ──────────────────────────────────────────────────────
        if (token) {
          const teacher = verifyToken(token);
          if (!teacher) return socket.emit('error', { message: 'Unauthorized', code: 'UNAUTHORIZED' });
          if (session.quizId.teacherId.toString() !== teacher.id)
            return socket.emit('error', { message: 'Unauthorized', code: 'UNAUTHORIZED' });

          socket.join(roomCode);
          socket.data.role     = 'teacher';
          socket.data.roomCode = roomCode;
          teacherSockets[roomCode] = socket.id;

          // Send current state (includes endsAt for countdown)
          socket.emit('session_state', {
            state:                session.state,
            currentQuestionIndex: session.currentQuestionIndex,
            participants:         session.participants,
            studentProgress:      session.studentProgress,
            startedAt:            session.startedAt,
            endsAt:               session.endsAt,
            // Use session.durationMinutes if the quiz has already been started
            // (it is copied from the quiz at start_quiz time).
            // Fall back to session.quizId.durationMinutes for the waiting state,
            // where session.durationMinutes is still null because start_quiz
            // has not run yet.  This is the value the teacher sees in the
            // waiting room and what the Start button checks.
            durationMinutes:      session.durationMinutes ?? session.quizId.durationMinutes ?? null,
            quizTitle:            session.quizId.title,
            totalQuestions:       session.quizId.questions.length,
          });

          // If quiz is already active, send live ranking immediately
          if (session.state === 'active') {
            const liveRanking = await buildLiveRanking(session);
            socket.emit('live_ranking', { ranking: liveRanking, endsAt: session.endsAt });
          }
          return;
        }

        // ── Student join ──────────────────────────────────────────────────────
        if (!displayName) return socket.emit('error', { message: 'displayName required', code: 'INVALID_REQUEST' });
        if (session.state === 'completed')
          return socket.emit('error', { message: 'Session already ended', code: 'SESSION_COMPLETED' });
        if (session.state === 'cancelled')
          return socket.emit('error', { message: 'Session was cancelled', code: 'SESSION_CANCELLED' });

        // Resolve studentId from token (server-side — never trust frontend)
        let studentId = null;
        if (studentToken) {
          const sp = verifyToken(studentToken);
          if (sp && sp.role === 'student') studentId = sp.id;
        }

        socket.join(roomCode);
        socket.data.role        = 'student';
        socket.data.roomCode    = roomCode;
        socket.data.displayName = displayName;
        socket.data.studentId   = studentId;
        socket.data.sessionId   = session._id.toString();

        // Upsert participant record
        const existing = session.participants.find(p => p.displayName === displayName);
        if (existing) {
          existing.socketId = socket.id;
          if (studentId) existing.studentId = studentId;
        } else {
          session.participants.push({
            displayName, rollNumber: rollNumber || '',
            section: section || '', course: course || '',
            socketId: socket.id, studentId,
          });
        }

        // Upsert studentProgress (preserve existing progress on reconnect)
        if (!session.studentProgress.find(p => p.displayName === displayName)) {
          session.studentProgress.push({ displayName, currentQuestionIndex: 0, doneAt: null });
        }

        await session.save();

        // Notify teacher
        const teacherSocketId = teacherSockets[roomCode];
        if (teacherSocketId) {
          io.to(teacherSocketId).emit('student_joined', {
            displayName,
            participantCount: session.participants.length,
          });
        }

        if (session.state === 'active') {
          // Send the student their current question (reconnect-safe)
          const progress = session.studentProgress.find(p => p.displayName === displayName);
          const qIdx  = progress?.currentQuestionIndex ?? 0;
          const total = session.quizId.questions.length;
          // Cap in case total changed
          const safeIdx = Math.min(qIdx, total - 1);
          socket.emit('question_display', {
            ...safeQuestion(session.quizId.questions[safeIdx], safeIdx, total),
            endsAt: session.endsAt,
          });
          // Restore previous selection for this question if any
          const prevAnswer = await Answer.findOne({
            sessionId: session._id,
            questionId: session.quizId.questions[safeIdx]._id,
            displayName,
          }).select('selectedOption').lean();
          if (prevAnswer) {
            socket.emit('answer_restored', { selectedOption: prevAnswer.selectedOption });
          }
        } else {
          socket.emit('waiting');
        }
      } catch (err) {
        console.error('[join_room] error:', err.message);
        socket.emit('error', { message: 'Server error', code: 'SERVER_ERROR' });
      }
    });

    // ─────────────────────────────────────────────
    // START QUIZ
    // Sets startedAt, endsAt, initialises studentProgress,
    // schedules auto-finalize timer.
    // ─────────────────────────────────────────────
    socket.on('start_quiz', async ({ roomCode }) => {
      // NOTE: durationMinutes is intentionally NOT accepted from the client.
      // The server always reads it from Quiz.durationMinutes (stored at creation time).
      // This prevents any client-side manipulation of the quiz duration.
      try {
        if (socket.data.role !== 'teacher' || socket.data.roomCode !== roomCode)
          return socket.emit('error', { message: 'Unauthorized', code: 'UNAUTHORIZED' });

        const session = await Session.findOne({ roomCode }).populate('quizId');
        if (!session) return socket.emit('error', { message: 'Session not found', code: 'SESSION_NOT_FOUND' });
        if (session.state !== 'waiting')
          return socket.emit('error', { message: 'Quiz already started', code: 'SESSION_WRONG_STATE' });

        // Always use the duration stored in the Quiz document — never trust the client.
        const storedDuration = session.quizId.durationMinutes;
        const parsedDur      = Number(storedDuration);
        if (!storedDuration || !Number.isFinite(parsedDur) || parsedDur < 1 || parsedDur > 180) {
          return socket.emit('error', {
            message: 'This quiz has no valid duration set. Please edit the quiz and set a time limit (1–180 minutes) before starting.',
            code: 'INVALID_DURATION',
          });
        }
        const durationMinutes = Math.round(parsedDur);
        const now    = new Date();
        const endsAt = new Date(now.getTime() + durationMinutes * 60_000);

        // Initialise one progress record per already-joined participant
        session.studentProgress = session.participants.map(p => ({
          displayName: p.displayName,
          currentQuestionIndex: 0,
          doneAt: null,
        }));

        session.state                = 'active';
        session.currentQuestionIndex = 0;   // legacy field
        session.startedAt            = now;
        session.endsAt               = endsAt;
        session.durationMinutes      = durationMinutes;
        await session.save();

        const total = session.quizId.questions.length;
        const firstQ = session.quizId.questions[0];

        // Send question 0 to every student + include endsAt for countdown
        const payload = { ...safeQuestion(firstQ, 0, total), endsAt };
        io.to(roomCode).emit('question_display', payload);

        // Send quiz_started to teacher with endsAt and full timing info
        socket.emit('quiz_started', {
          startedAt:      now,
          endsAt,
          durationMinutes,
          totalQuestions: total,
        });

        // Schedule server-side auto-finalize
        clearQuizTimer(roomCode);
        const msUntilEnd = endsAt.getTime() - Date.now();
        quizTimers[roomCode] = setTimeout(async () => {
          console.log(`[timer] Quiz room ${roomCode} expired — auto-finalizing`);
          await finalizeSession(io, roomCode, 'timer');
        }, Math.max(0, msUntilEnd));

        console.log(
          `[start_quiz] Room ${roomCode} started | duration ${durationMinutes}m | ` +
          `endsAt ${endsAt.toISOString()} | ${session.participants.length} students`
        );
      } catch (err) {
        console.error('[start_quiz] error:', err.message);
        socket.emit('error', { message: 'Server error', code: 'SERVER_ERROR' });
      }
    });

    // ─────────────────────────────────────────────
    // STUDENT NEXT QUESTION
    // Students advance their OWN question independently.
    // Teacher has no next_question control in the timed model.
    // ─────────────────────────────────────────────
    socket.on('student_next_question', async ({ roomCode }) => {
      try {
        if (socket.data.role !== 'student')
          return socket.emit('error', { message: 'Unauthorized', code: 'UNAUTHORIZED' });

        const { displayName } = socket.data;
        const session = await Session.findOne({ roomCode }).populate('quizId');
        if (!session) return socket.emit('error', { message: 'Session not found', code: 'SESSION_NOT_FOUND' });
        if (session.state !== 'active')
          return socket.emit('error', { message: 'Quiz not active', code: 'SESSION_WRONG_STATE' });

        // Check global deadline
        if (session.endsAt && new Date() >= session.endsAt)
          return socket.emit('error', { message: 'Quiz time has expired', code: 'QUIZ_EXPIRED' });

        const total    = session.quizId.questions.length;
        const progress = session.studentProgress.find(p => p.displayName === displayName);
        if (!progress) return socket.emit('error', { message: 'Progress not found', code: 'SERVER_ERROR' });

        if (progress.currentQuestionIndex >= total - 1) {
          // Already on last question — mark as done and notify teacher
          if (!progress.doneAt) {
            progress.doneAt = new Date();
            await session.save();
            // Notify teacher that this student submitted
            const teacherSocketId = teacherSockets[roomCode];
            if (teacherSocketId) {
              io.to(teacherSocketId).emit('student_submitted', {
                displayName,
                submittedAt: progress.doneAt.toISOString(),
              });
            }
          }
          return socket.emit('quiz_done_early', { message: 'You have completed all questions!' });
        }

        const newIndex = progress.currentQuestionIndex + 1;
        progress.currentQuestionIndex = newIndex;
        await session.save();

        const q = session.quizId.questions[newIndex];
        socket.emit('question_display', {
          ...safeQuestion(q, newIndex, total),
          endsAt: session.endsAt,
        });

        // Restore any previously saved answer for this question
        const prevAnswer = await Answer.findOne({
          sessionId: session._id,
          questionId: q._id,
          displayName,
        }).select('selectedOption').lean();
        if (prevAnswer) socket.emit('answer_restored', { selectedOption: prevAnswer.selectedOption });

        // Update teacher's live ranking
        const teacherSocketId = teacherSockets[roomCode];
        if (teacherSocketId) {
          const liveRanking = await buildLiveRanking(session);
          io.to(teacherSocketId).emit('live_ranking', { ranking: liveRanking, endsAt: session.endsAt });
        }
      } catch (err) {
        console.error('[student_next_question] error:', err.message);
        socket.emit('error', { message: 'Server error', code: 'SERVER_ERROR' });
      }
    });

    // ─────────────────────────────────────────────
    // SUBMIT ANSWER
    // Student submits (or CHANGES) their answer for a question.
    // Uses upsert — the latest answer always wins (idempotent).
    // Validates: session active, within deadline, correct question index.
    // ─────────────────────────────────────────────
    socket.on('submit_answer', async ({ roomCode, questionId, selectedOption, questionIndex }) => {
      try {
        if (socket.data.role !== 'student')
          return socket.emit('error', { message: 'Unauthorized', code: 'UNAUTHORIZED' });

        const { displayName } = socket.data;
        const session = await Session.findOne({ roomCode }).populate('quizId');
        if (!session || session.state !== 'active')
          return socket.emit('error', { message: 'Session not active', code: 'SESSION_WRONG_STATE' });

        // ── Server-side deadline enforcement ──────────────────────────────────
        if (session.endsAt && new Date() > session.endsAt) {
          return socket.emit('error', { message: 'Quiz time has expired', code: 'QUIZ_EXPIRED' });
        }

        // ── Block answer changes after student has marked as done ────────────
        const progress = session.studentProgress.find(p => p.displayName === displayName);
        if (progress?.doneAt) {
          return socket.emit('error', { message: 'You have already submitted', code: 'ALREADY_SUBMITTED' });
        }

        // ── Verify the student is actually on this question ───────────────────
        const expectedIndex = progress?.currentQuestionIndex ?? 0;
        if (questionIndex !== undefined && questionIndex !== expectedIndex) {
          return socket.emit('error', {
            message: 'Answer is for a different question than your current one',
            code: 'WRONG_QUESTION',
          });
        }

        // Verify questionId matches the question at the expected index
        const expectedQ = session.quizId.questions[expectedIndex];
        if (expectedQ._id.toString() !== questionId) {
          return socket.emit('error', { message: 'Invalid questionId', code: 'INVALID_QUESTION' });
        }

        // ── Upsert answer (idempotent — latest answer wins) ───────────────────
        await Answer.findOneAndUpdate(
          { sessionId: session._id, questionId, displayName },
          {
            sessionId: session._id, questionId, displayName,
            selectedOption, submittedAt: new Date(),
          },
          { upsert: true, new: true }
        );

        socket.emit('answer_received', { selectedOption });

        // ── Push updated live ranking to teacher ──────────────────────────────
        const teacherSocketId = teacherSockets[roomCode];
        if (teacherSocketId) {
          const liveRanking = await buildLiveRanking(session);
          io.to(teacherSocketId).emit('live_ranking', { ranking: liveRanking, endsAt: session.endsAt });
        }
      } catch (err) {
        console.error('[submit_answer] error:', err.message);
        socket.emit('error', { message: 'Server error', code: 'SERVER_ERROR' });
      }
    });

    // ─────────────────────────────────────────────
    // TERMINATE SESSION (Problem 4: stale live session recovery)
    //
    // Allows the teacher to terminate an existing ACTIVE or WAITING session
    // from the dashboard, even without being in the teacher room.
    // Uses the same atomic finalization path as end_quiz.
    // ─────────────────────────────────────────────
    socket.on('terminate_session', async ({ roomCode }) => {
      try {
        const teacher = socket.data.role === 'teacher'
          ? { id: socket.data.teacherId }
          : null;

        // Verify token since this may come from dashboard (no join_room yet)
        // The socket.data might not have role set if called before join_room.
        // Re-verify from the auth token passed in the socket auth.
        const authToken = socket.handshake?.auth?.token;
        const decoded   = authToken ? verifyToken(authToken) : null;
        if (!decoded) {
          return socket.emit('error', { message: 'Unauthorized', code: 'UNAUTHORIZED' });
        }

        // Verify the teacher owns this session
        const session = await Session.findOne({ roomCode }).populate('quizId', 'teacherId');
        if (!session) {
          return socket.emit('error', { message: 'Session not found', code: 'SESSION_NOT_FOUND' });
        }
        if (session.quizId.teacherId.toString() !== decoded.id) {
          return socket.emit('error', { message: 'Unauthorized', code: 'UNAUTHORIZED' });
        }

        if (session.state === 'completed' || session.state === 'cancelled') {
          return socket.emit('session_terminated', { state: session.state });
        }

        if (session.state === 'waiting') {
          // Just cancel — no finalization needed
          await Session.findByIdAndUpdate(session._id, { $set: { state: 'cancelled' } });
          clearQuizTimer(roomCode);
          io.to(roomCode).emit('error', { message: 'Session was cancelled', code: 'SESSION_CANCELLED' });
          return socket.emit('session_terminated', { state: 'cancelled' });
        }

        // active or finishing → finalize
        console.log(`[terminate_session] Teacher terminating stale room ${roomCode}`);
        const result = await finalizeSession(io, roomCode, 'teacher');
        socket.emit('session_terminated', {
          state: 'completed',
          hadResults: result !== null && result.length > 0,
        });
      } catch (err) {
        console.error('[terminate_session] error:', err.message);
        socket.emit('error', { message: `Could not terminate session: ${err.message}`, code: 'SERVER_ERROR' });
      }
    });

    // ─────────────────────────────────────────────
    // END QUIZ (teacher manually ends early)
    // Uses the same finalizeSession path as timer expiry.
    // ─────────────────────────────────────────────
    socket.on('end_quiz', async ({ roomCode }) => {
      try {
        if (socket.data.role !== 'teacher' || socket.data.roomCode !== roomCode)
          return socket.emit('error', { message: 'Unauthorized', code: 'UNAUTHORIZED' });

        console.log(`[end_quiz] Teacher ending quiz — room ${roomCode}`);
        const result = await finalizeSession(io, roomCode, 'teacher');
        if (result === null) {
          // Session was already finishing or completed — tell teacher it's done
          const existing = await Session.findOne({ roomCode }).select('state');
          if (existing?.state === 'completed') {
            socket.emit('quiz_already_completed');
          }
        }
      } catch (err) {
        console.error('[end_quiz] error:', err.message);
        socket.emit('error', { message: `Could not end quiz: ${err.message}`, code: 'SERVER_ERROR' });
      }
    });

    // ─────────────────────────────────────────────
    // APPLY PENALTY (unchanged)
    // ─────────────────────────────────────────────
    socket.on('apply_penalty', ({ roomCode, targetDisplayName, seconds }) => {
      try {
        if (socket.data.role !== 'teacher' || socket.data.roomCode !== roomCode) return;
        const sockets = Array.from(io.sockets.sockets.values());
        const target  = sockets.find(
          s => s.data.roomCode === roomCode &&
               s.data.displayName === targetDisplayName &&
               s.data.role === 'student'
        );
        if (target) target.emit('penalty_applied', { seconds, by: 'teacher' });
      } catch { /* silent */ }
    });

    // ─────────────────────────────────────────────
    // TAB SWITCH (unchanged)
    // ─────────────────────────────────────────────
    socket.on('tab_switch', async ({ roomCode, switchCount }) => {
      try {
        const { displayName } = socket.data;
        if (!displayName || socket.data.role !== 'student') return;
        const teacherSocketId = teacherSockets[roomCode];
        if (teacherSocketId) {
          io.to(teacherSocketId).emit('student_tab_switch', {
            displayName, switchCount, time: new Date().toISOString(),
          });
        }
      } catch { /* silent */ }
    });

    // ─────────────────────────────────────────────
    // DISCONNECT
    // ─────────────────────────────────────────────
    socket.on('disconnect', async () => {
      try {
        const { role, roomCode, displayName } = socket.data;
        if (!roomCode) return;
        if (role === 'teacher') {
          delete teacherSockets[roomCode];
          socket.to(roomCode).emit('teacher_disconnected');
        } else if (role === 'student') {
          await Session.updateOne(
            { roomCode, 'participants.displayName': displayName },
            { $set: { 'participants.$.socketId': null } }
          );
        }
      } catch { /* silent */ }
    });

  }); // end io.on('connection')
};
