const express = require('express');
const mongoose = require('mongoose');
const studentAuth = require('../middleware/studentAuth');
const QuizAttempt = require('../models/QuizAttempt');
const { getLeaderboard } = require('../services/scoreService');

const router = express.Router();

router.get('/me/history', studentAuth, async (req, res) => {
  try {
    const studentId = new mongoose.Types.ObjectId(req.student.id);

    const attempts = await QuizAttempt.find({ studentId })
      .populate('quizId',   'title')      
      .populate('sessionId', 'roomCode')  
      .sort({ submittedAt: -1 })          
      .lean();

    const history = attempts.map((a) => ({
      attemptId:        a._id,
      quizTitle:        a.quizId?.title  || 'Unknown Quiz',
      quizId:           a.quizId?._id,
      sessionId:        a.sessionId?._id,
      roomCode:         a.sessionId?.roomCode,
      correctAnswers:   a.correctAnswers,
      incorrectAnswers: a.incorrectAnswers,
      totalQuestions:   a.totalQuestions,
      score:            a.score,
      percentage:       a.percentage,
      timeTaken:        a.timeTaken,
      submittedAt:      a.submittedAt,
      rank:             a.rankAtSubmission,
    }));

    res.json(history);
  } catch (err) {
    console.error('history error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/session/:sessionId/leaderboard', studentAuth, async (req, res) => {
  try {
    const leaderboard = await getLeaderboard(req.params.sessionId);
    res.json(leaderboard);
  } catch (err) {
    console.error('student leaderboard error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
