const mongoose = require('mongoose');

const scoreSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
  displayName: { type: String, required: true },
  score: { type: Number, required: true },
  total: { type: Number, required: true },
  calculatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Score', scoreSchema);
