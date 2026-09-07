const express = require('express');
const crypto  = require('crypto');
const Session = require('../models/Session');
const Quiz    = require('../models/Quiz');
const authMiddleware = require('../middleware/auth');
const { getLeaderboard } = require('../services/scoreService');

const router = express.Router();

function generateRoomCode() {
  return crypto.randomBytes(4).toString('hex');
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sessions
// Create a new session (teacher starts a quiz room).
//
// Session lifecycle rules:
//   waiting   → room created, quiz not yet started (teacher is on waiting screen)
//   active    → start_quiz fired, quiz is live
//   completed → quiz fully submitted
//   cancelled → teacher left before starting; treated as no-session for status
//
// A WAITING session means the teacher opened the room but has NOT started the
// quiz. This is NOT considered "live" from the dashboard's perspective.
// If a waiting session already exists, return it so the teacher can re-enter
// the same room rather than getting a confusing error.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { quizId } = req.body;
    const quiz = await Quiz.findOne({ _id: quizId, teacherId: req.teacher.id });
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    // ── Already ACTIVE (quiz running) → return existing session ──────────────
    const activeSession = await Session.findOne({ quizId, state: 'active' });
    if (activeSession) {
      // Let the teacher rejoin the live session instead of creating a duplicate
      return res.status(200).json({
        session:  activeSession,
        joinUrl:  `${process.env.CLIENT_URL || 'http://localhost:3000'}/join/${activeSession.roomCode}`,
        rejoined: true,
      });
    }

    // ── Already WAITING (room open, quiz not started) → return existing ───────
    const waitingSession = await Session.findOne({ quizId, state: 'waiting' });
    if (waitingSession) {
      // Teacher can re-enter the same waiting room
      return res.status(200).json({
        session:  waitingSession,
        joinUrl:  `${process.env.CLIENT_URL || 'http://localhost:3000'}/join/${waitingSession.roomCode}`,
        rejoined: true,
      });
    }

    // ── COMPLETED → block re-start ────────────────────────────────────────────
    const completedSession = await Session.findOne({ quizId, state: 'completed' });
    if (completedSession) {
      return res.status(409).json({
        error:   'quiz_already_completed',
        message: 'Quiz is already completed.',
      });
    }

    // ── Create fresh session ──────────────────────────────────────────────────
    const roomCode = generateRoomCode();
    const session  = await Session.create({
      quizId, roomCode, state: 'waiting', currentQuestionIndex: 0,
    });
    const joinUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/join/${roomCode}`;
    res.status(201).json({ session, joinUrl });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/sessions/:sessionId/cancel
// Teacher cancels an UNSTARTED (waiting) session.
//
// Only allowed when state === 'waiting'.
// Marks session as 'cancelled' (soft-delete — preserves audit trail).
// Returns 403 if the teacher doesn't own this quiz.
// Returns 400 if the session has already started or completed.
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:sessionId/cancel', authMiddleware, async (req, res) => {
  try {
    const session = await Session.findById(req.params.sessionId).populate('quizId');
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Verify ownership
    if (session.quizId.teacherId.toString() !== req.teacher.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (session.state === 'active') {
      return res.status(400).json({
        error:   'session_already_started',
        message: 'The quiz has already started and cannot be cancelled.',
      });
    }
    if (session.state === 'completed') {
      return res.status(400).json({
        error:   'quiz_already_completed',
        message: 'The quiz is already completed.',
      });
    }
    if (session.state === 'cancelled') {
      // Idempotent — already cancelled, treat as success
      return res.status(200).json({ message: 'Session already cancelled.' });
    }

    // Mark as cancelled (soft delete — do not use findByIdAndDelete)
    session.state = 'cancelled';
    await session.save();

    res.status(200).json({ message: 'Session cancelled.' });
  } catch (err) {
    console.error('cancel session error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sessions/quiz/:quizId/status
//
// Returns the authoritative status the dashboard should display.
//
// Status mapping:
//   'none'      → no session, or only cancelled sessions → show Start button
//   'waiting'   → room open but quiz NOT started         → show Start button
//                 (teacher may re-enter the waiting room)
//   'active'    → quiz is LIVE right now                 → show 🔴 Live button
//   'completed' → quiz finished                          → show ✓ Completed
//
// NOTE: 'waiting' maps to 'none' for the purpose of the dashboard button label
//       because the quiz has not actually started yet. The dashboard uses this
//       to decide the button; the roomCode is returned so the teacher can
//       re-enter the waiting room if they go back.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/quiz/:quizId/status', authMiddleware, async (req, res) => {
  try {
    // Active (truly live) session — show 🔴 Live
    const active = await Session.findOne(
      { quizId: req.params.quizId, state: 'active' },
      { state: 1, roomCode: 1, _id: 1 }
    ).lean();
    if (active) {
      return res.json({ status: 'active', roomCode: active.roomCode, sessionId: active._id });
    }

    // Waiting session — quiz NOT started yet → dashboard shows Start, not Live.
    // We still return the roomCode so the teacher can re-enter.
    const waiting = await Session.findOne(
      { quizId: req.params.quizId, state: 'waiting' },
      { state: 1, roomCode: 1, _id: 1 }
    ).lean();
    if (waiting) {
      return res.json({
        status: 'waiting',      // dashboard treats this as "re-enter waiting room"
        roomCode: waiting.roomCode,
        sessionId: waiting._id,
      });
    }

    // Completed session
    const done = await Session.findOne(
      { quizId: req.params.quizId, state: 'completed' },
      { state: 1, roomCode: 1, _id: 1 }
    ).sort({ createdAt: -1 }).lean();
    if (done) {
      return res.json({ status: 'completed', roomCode: done.roomCode, sessionId: done._id });
    }

    // No actionable session
    res.json({ status: 'none' });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sessions/quiz/:quizId/all
// ─────────────────────────────────────────────────────────────────────────────
router.get('/quiz/:quizId/all', authMiddleware, async (req, res) => {
  try {
    const sessions = await Session.find({ quizId: req.params.quizId, state: 'completed' })
      .sort({ createdAt: -1 });
    res.json(sessions);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sessions/:roomCode
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:roomCode', authMiddleware, async (req, res) => {
  try {
    const session = await Session.findOne({ roomCode: req.params.roomCode });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sessions/:roomCode/results
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:roomCode/results', authMiddleware, async (req, res) => {
  try {
    const Score   = require('../models/Score');
    const session = await Session.findOne({ roomCode: req.params.roomCode }).populate('quizId');
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const scores  = await Score.find({ sessionId: session._id }).sort({ score: -1 });
    res.json({ session, scores, quiz: session.quizId });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sessions/:sessionId/leaderboard
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:sessionId/leaderboard', authMiddleware, async (req, res) => {
  try {
    const session = await Session.findById(req.params.sessionId).populate('quizId');
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (session.quizId.teacherId.toString() !== req.teacher.id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const leaderboard = await getLeaderboard(req.params.sessionId);
    res.json(leaderboard);
  } catch (err) {
    console.error('leaderboard error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
