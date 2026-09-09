const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  options: {
    type: [String],
    validate: { validator: (v) => v.length >= 2, message: 'At least 2 options required' },
  },
  correctAnswer: { type: String, required: true },
});

const quizSchema = new mongoose.Schema({
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  questions: {
    type: [questionSchema],
    validate: { validator: (v) => v.length >= 1, message: 'At least 1 question required' },
  },
  /**
   * durationMinutes — teacher-defined quiz duration.
   * Any positive whole number of minutes (1–180) is allowed.
   * The old fixed enum [null, 1, 2, 5, 10] has been removed.
   * Existing quizzes without this field default to null; the teacher will be
   * prompted to pick a duration when starting the session.
   * Backward compatible: null means "ask at start time".
   */
  durationMinutes: {
    type:    Number,
    default: null,
    min:     [1,   'Duration must be at least 1 minute'],
    max:     [180, 'Duration must be at most 180 minutes'],
    validate: {
      validator: (v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 180),
      message: 'durationMinutes must be a whole number between 1 and 180',
    },
  },
}, { timestamps: true });

module.exports = mongoose.model('Quiz', quizSchema);
