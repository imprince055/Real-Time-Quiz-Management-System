const express = require('express');
const Quiz    = require('../models/Quiz');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// POST /api/quizzes — create a new quiz
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { title, questions, durationMinutes } = req.body;

    // ── Validate questions ────────────────────────────────────────────────────
    if (!questions || questions.length < 1) {
      return res.status(400).json({ error: 'At least 1 question required' });
    }
    for (const q of questions) {
      if (!q.text)
        return res.status(400).json({ error: 'Each question must have text', field: 'text' });
      if (!q.options || q.options.length < 2)
        return res.status(400).json({ error: 'Each question must have at least 2 options', field: 'options' });
      if (!q.correctAnswer)
        return res.status(400).json({ error: 'Each question must have a correct answer', field: 'correctAnswer' });
      if (!q.options.includes(q.correctAnswer))
        return res.status(400).json({ error: 'correctAnswer must be one of the options', field: 'correctAnswer' });
    }

    // ── Validate durationMinutes ──────────────────────────────────────────────
    // Allow any whole number in [1, 180], or null/undefined (pick at start time).
    let cleanDuration = null;
    if (durationMinutes !== null && durationMinutes !== undefined && durationMinutes !== '') {
      const num = Number(durationMinutes);
      if (!Number.isFinite(num) || !Number.isInteger(num) || num < 1 || num > 180) {
        return res.status(400).json({
          error: 'Quiz duration must be a whole number between 1 and 180 minutes',
          field: 'durationMinutes',
        });
      }
      cleanDuration = num;
    }

    const quiz = await Quiz.create({
      teacherId:       req.teacher.id,
      title,
      questions,
      durationMinutes: cleanDuration,
    });

    res.status(201).json(quiz);
  } catch (err) {
    // Surface Mongoose validation errors with a useful message instead of
    // the generic "Server error" that was hiding the root cause.
    if (err.name === 'ValidationError') {
      const firstMsg = Object.values(err.errors)[0]?.message || 'Validation failed';
      return res.status(400).json({ error: firstMsg });
    }
    console.error('[POST /api/quizzes] error:', err.message, err.stack);
    res.status(500).json({ error: 'Failed to create quiz. Please try again.' });
  }
});

// GET /api/quizzes/:id
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const quiz = await Quiz.findOne({ _id: req.params.id, teacherId: req.teacher.id });
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
    res.json(quiz);
  } catch (err) {
    console.error('[GET /api/quizzes/:id] error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/quizzes  (list teacher's quizzes)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const quizzes = await Quiz.find({ teacherId: req.teacher.id }).select('-questions.correctAnswer');
    res.json(quizzes);
  } catch (err) {
    console.error('[GET /api/quizzes] error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
