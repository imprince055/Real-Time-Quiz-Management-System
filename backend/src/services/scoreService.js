const Answer = require('../models/Answer');
const Score = require('../models/Score');
const Quiz = require('../models/Quiz');
const Session = require('../models/Session');


async function calculateScores(sessionId) {
  const session = await Session.findById(sessionId).populate('quizId');
  const quiz = session.quizId;
  const total = quiz.questions.length;

  const correctMap = {};
  for (const q of quiz.questions) {
    correctMap[q._id.toString()] = q.correctAnswer;
  }

  const answers = await Answer.find({ sessionId });

  const byStudent = {};
  for (const ans of answers) {
    if (!byStudent[ans.displayName]) byStudent[ans.displayName] = [];
    byStudent[ans.displayName].push(ans);
  }

  const results = [];
  for (const [displayName, studentAnswers] of Object.entries(byStudent)) {
    const score = studentAnswers.filter(
      (a) => correctMap[a.questionId.toString()] === a.selectedOption
    ).length;

    await Score.findOneAndUpdate(
      { sessionId, displayName },
      { sessionId, displayName, score, total, calculatedAt: new Date() },
      { upsert: true, new: true }
    );

    results.push({ displayName, score, total });
  }

  return results;
}

module.exports = { calculateScores };
