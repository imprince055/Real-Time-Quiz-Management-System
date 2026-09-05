const express = require('express');
const Quiz = require('../models/Quiz');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, questions } = req.body;
    if (!questions || questions.length < 1) {
      return res.status(400).json({ error: 'At least 1 question required' });
    }
    for (const q of questions) {
      if (!q.text) return res.status(400).json({ error: 'Each question must have text', field: 'text' });
      if (!q.options || q.options.length < 2) {
        return res.status(400).json({ error: 'Each question must have at least 2 options', field: 'options' });
      }
      if (!q.correctAnswer) {
        return res.status(400).json({ error: 'Each question must have a correct answer', field: 'correctAnswer' });
      }
      if (!q.options.includes(q.correctAnswer)) {
        return res.status(400).json({ error: 'correctAnswer must be one of the options', field: 'correctAnswer' });
      }
    }
    const quiz = await Quiz.create({ teacherId: req.teacher.id, title, questions });
    res.status(201).json(quiz);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/quizzes/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const quiz = await Quiz.findOne({ _id: req.params.id, teacherId: req.teacher.id });
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
    res.json(quiz);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/quizzes  (list teacher's quizzes)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const quizzes = await Quiz.find({ teacherId: req.teacher.id }).select('-questions.correctAnswer');
    res.json(quizzes);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
