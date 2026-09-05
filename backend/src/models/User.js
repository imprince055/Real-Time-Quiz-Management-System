const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  displayName: { type: String, default: '' },
  role: { type: String, enum: ['teacher', 'student'], default: 'teacher' },
 
  rollNumber: { type: String, default: '' },
  section: { type: String, default: '' },
  course: { type: String, default: '' },

  googleId: { type: String, default: null },
  photoUrl: { type: String, default: null },
  passwordHash: { type: String, default: null },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
