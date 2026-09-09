const mongoose = require('mongoose');

const scoreSchema = new mongoose.Schema({
  sessionId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
  displayName:  { type: String, required: true },
  score:        { type: Number, required: true },
  total:        { type: Number, required: true },
  calculatedAt: { type: Date, default: Date.now },
});

// Unique index prevents duplicate Score documents for the same participant
// in the same session when calculateScores is called concurrently or retried.
scoreSchema.index(
  { sessionId: 1, displayName: 1 },
  { unique: true, name: 'unique_score_session_participant' }
);

module.exports = mongoose.model('Score', scoreSchema);
