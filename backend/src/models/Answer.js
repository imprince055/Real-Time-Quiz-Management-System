const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  displayName: { type: String, required: true },
  selectedOption: { type: String, required: true },
  submittedAt: { type: Date, default: Date.now },
});

answerSchema.index({ sessionId: 1, questionId: 1, displayName: 1 }, { unique: true });

module.exports = mongoose.model('Answer', answerSchema);
