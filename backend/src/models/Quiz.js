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
}, { timestamps: true });

module.exports = mongoose.model('Quiz', quizSchema);
