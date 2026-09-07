const express = require('express');
const crypto = require('crypto');
const Session = require('../models/Session');
const Quiz = require('../models/Quiz');
const authMiddleware = require('../middleware/auth');
const { getLeaderboard } = require('../services/scoreService');

const router = express.Router();

function generateRoomCode() {
  return crypto.randomBytes(4).toString('hex');
}

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { quizId } = req.body;
    const quiz = await Quiz.findOne({ _id: quizId, teacherId: req.teacher.id });
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    // Check for an ACTIVE session (waiting or in-progress) — cannot start another
    const activeSession = await Session.findOne({ quizId, state: { $in: ['waiting', 'active'] } });
    if (activeSession) {
      return res.status(409).json({ error: 'An active session is already in progress for this quiz' });
    }

    // Check for a COMPLETED session — prevent re-starting a finished quiz
    const completedSession = await Session.findOne({ quizId, state: 'completed' });
    if (completedSession) {
      return res.status(409).json({
        error: 'quiz_already_completed',
        message: 'Quiz is already completed.',
      });
    }

    const roomCode = generateRoomCode();
    const session  = await Session.create({ quizId, roomCode, state: 'waiting', currentQuestionIndex: 0 });
    const joinUrl  = `${process.env.CLIENT_URL || 'http://localhost:3000'}/join/${roomCode}`;
    res.status(201).json({ session, joinUrl });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:roomCode', authMiddleware, async (req, res) => {
  try {
    const session = await Session.findOne({ roomCode: req.params.roomCode });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:roomCode/results', authMiddleware, async (req, res) => {
  try {
    const Score = require('../models/Score');
    const session = await Session.findOne({ roomCode: req.params.roomCode }).populate('quizId');
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const scores = await Score.find({ sessionId: session._id }).sort({ score: -1 });
    res.json({ session, scores, quiz: session.quizId });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/sessions/quiz/:quizId/status
 *
 * Returns the current session status for a quiz:
 *   { status: 'none' | 'waiting' | 'active' | 'completed', roomCode? }
 *
 * Used by the Teacher Dashboard to decide whether to show Start / ✓ Completed.
 * Cheap query — only returns the most recent / relevant session document.
 */
router.get('/quiz/:quizId/status', authMiddleware, async (req, res) => {
  try {
    // Active/waiting session takes priority
    const live = await Session.findOne(
      { quizId: req.params.quizId, state: { $in: ['waiting', 'active'] } },
      { state: 1, roomCode: 1 }
    ).lean();
    if (live) return res.json({ status: live.state, roomCode: live.roomCode });

    // Most recent completed session
    const done = await Session.findOne(
      { quizId: req.params.quizId, state: 'completed' },
      { state: 1, roomCode: 1 }
    ).sort({ createdAt: -1 }).lean();
    if (done) return res.json({ status: 'completed', roomCode: done.roomCode });

    res.json({ status: 'none' });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/quiz/:quizId/all', authMiddleware, async (req, res) => {
  try {
    const sessions = await Session.find({ quizId: req.params.quizId, state: 'completed' }).sort({ createdAt: -1 });
    res.json(sessions);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

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
