const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  displayName: { type: String, required: true },
  rollNumber: { type: String, default: '' },
  section: { type: String, default: '' },
  course: { type: String, default: '' },
  socketId: { type: String, default: null },
}, { _id: false });

const sessionSchema = new mongoose.Schema({
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
  roomCode: { type: String, required: true, unique: true },
  state: { type: String, enum: ['waiting', 'active', 'completed'], default: 'waiting' },
  currentQuestionIndex: { type: Number, default: 0 },
  participants: { type: [participantSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.model('Session', sessionSchema);
