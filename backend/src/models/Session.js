const mongoose = require('mongoose');

const participantSchema = new mongoose.Schema({
  displayName: { type: String, required: true },
  rollNumber:  { type: String, default: '' },
  section:     { type: String, default: '' },
  course:      { type: String, default: '' },
  socketId:    { type: String, default: null },
  studentId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { _id: false });

/**
 * studentProgress — one entry per participant, updated as they navigate
 * questions and eventually submit/finish.
 *
 * currentQuestionIndex  — which question this student is currently viewing
 *                         (0-based, starts at 0 when quiz starts)
 * doneAt                — set when this student explicitly finishes (optional
 *                         early-submit). null while still playing.
 */
const studentProgressSchema = new mongoose.Schema({
  displayName:          { type: String, required: true },
  currentQuestionIndex: { type: Number, default: 0 },
  doneAt:               { type: Date,   default: null },
}, { _id: false });

const sessionSchema = new mongoose.Schema({
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
  roomCode: { type: String, required: true, unique: true },
  state: {
    type: String,
    // waiting   — room open, quiz not yet started
    // active    — quiz is live (timer running)
    // finishing — being finalized right now (prevents double-finalize)
    // completed — quiz fully done, results calculated
    // cancelled — teacher left before starting
    enum: ['waiting', 'active', 'finishing', 'completed', 'cancelled'],
    default: 'waiting',
  },

  // ── Global question index (legacy — kept so teacher re-entry still works) ──
  // NOT used for per-student navigation in the timed model.
  currentQuestionIndex: { type: Number, default: 0 },

  participants:    { type: [participantSchema],    default: [] },
  studentProgress: { type: [studentProgressSchema], default: [] },

  // Authoritative server-side timestamps
  startedAt: { type: Date, default: null },

  /**
   * endsAt — the absolute UTC time at which the quiz automatically closes.
   * Set by start_quiz as:  startedAt + durationMinutes * 60_000 ms
   * The backend uses this to:
   *   1. Reject answers submitted after this point.
   *   2. Trigger automatic finalization via a server-side setTimeout.
   * The frontend uses this to display a live countdown:
   *   remaining = Math.max(0, endsAt - Date.now())
   * Never trust the frontend to enforce this deadline.
   */
  endsAt: { type: Date, default: null },

  // Duration that was chosen for this session (mirrors quiz.durationMinutes
  // at the time of starting, so it survives future quiz edits).
  durationMinutes: { type: Number, default: null },

}, { timestamps: true });

module.exports = mongoose.model('Session', sessionSchema);
