const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  displayName: { type: String, required: true },
  rollNumber: { type: String, default: '' },
  section: { type: String, default: '' },
  course: { type: String, default: '' },
  socketId: { type: String, default: null },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { _id: false });

const sessionSchema = new mongoose.Schema({
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
  roomCode: { type: String, required: true, unique: true },
  state: {
    type: String,
    // 'waiting'   — room created, quiz not yet started
    // 'active'    — start_quiz fired, quiz is live
    // 'finishing' — results are being calculated; prevents a second submit
    // 'completed' — submit_quiz fired, results calculated
    // 'cancelled' — teacher left before starting; session is void
    enum: ['waiting', 'active', 'finishing', 'completed', 'cancelled'],
    default: 'waiting',
  },
  currentQuestionIndex: { type: Number, default: 0 },
  participants: { type: [participantSchema], default: [] },
  startedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Session', sessionSchema);
