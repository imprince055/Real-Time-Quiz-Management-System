const express = require('express');
const crypto = require('crypto');
const Session = require('../models/Session');
const Quiz = require('../models/Quiz');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

function generateRoomCode() {
  return crypto.randomBytes(4).toString('hex');
}

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { quizId } = req.body;
    const quiz = await Quiz.findOne({ _id: quizId, teacherId: req.teacher.id });
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });

    const existing = await Session.findOne({ quizId, state: { $in: ['waiting', 'active'] } });
    if (existing) return res.status(409).json({ error: 'An active session already exists for this quiz' });

    const roomCode = generateRoomCode();
    const session = await Session.create({ quizId, roomCode, state: 'waiting', currentQuestionIndex: 0 });

    const joinUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/join/${roomCode}`;
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

router.get('/quiz/:quizId/all', authMiddleware, async (req, res) => {
  try {
    const sessions = await Session.find({ quizId: req.params.quizId, state: 'completed' }).sort({ createdAt: -1 });
    res.json(sessions);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
