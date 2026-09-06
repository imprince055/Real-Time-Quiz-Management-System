const mongoose = require('mongoose');

/**
 * QuizAttempt — one record per student per session.
 *
 * Identity model:
 *   studentId  — authoritative identity: ObjectId reference to the User document.
 *                Set for registered students who join with a valid studentToken.
 *                Null only for fully anonymous (guest) participants who have no account.
 *
 *   displayName — human-readable name for leaderboard display only.
 *                 Never used as the unique identity key.
 *
 * Unique constraint:
 *   PRIMARY  : { sessionId, studentId }  — used when studentId is available (registered students)
 *   FALLBACK : { sessionId, displayName } with a partial filter where studentId is null
 *              — covers the rare case of a guest join (no account).
 *
 * timeTaken    : seconds from session.startedAt to the student's last answer.
 *                Calculated by the backend; never trusted from the frontend.
 *
 * rankAtSubmission : rank at the moment this attempt was last scored.
 *                    Recalculated every time getLeaderboard() is called.
 */
const quizAttemptSchema = new mongoose.Schema({
  sessionId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
  quizId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz',    required: true },

  studentId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',    default: null },

  displayName:  { type: String, required: true },

  correctAnswers:   { type: Number, required: true },
  incorrectAnswers: { type: Number, required: true },
  totalQuestions:   { type: Number, required: true },
  score:            { type: Number, required: true },    
  percentage:       { type: Number, required: true },    

  timeTaken:    { type: Number, required: true },         
  submittedAt:  { type: Date,   default: Date.now },

  rankAtSubmission: { type: Number, default: null },

  rollNumber: { type: String, default: '' },
  section:    { type: String, default: '' },
  course:     { type: String, default: '' },
}, { timestamps: true });

quizAttemptSchema.index(
  { sessionId: 1, studentId: 1 },
  {
    unique: true,
    sparse: true,
    name: 'unique_session_student',
  }
);

quizAttemptSchema.index(
  { sessionId: 1, displayName: 1 },
  {
    unique: true,
    partialFilterExpression: { studentId: null },
    name: 'unique_session_displayname_guest',
  }
);

quizAttemptSchema.index({ studentId: 1, submittedAt: -1 }, { name: 'history_by_student' });

quizAttemptSchema.index({ sessionId: 1 }, { name: 'leaderboard_by_session' });

module.exports = mongoose.model('QuizAttempt', quizAttemptSchema);
