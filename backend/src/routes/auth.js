const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const passport = require('../config/passport');
const User     = require('../models/User');
const authMiddleware    = require('../middleware/auth');
const studentAuth       = require('../middleware/studentAuth');

const router = express.Router();

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const JWT_SECRET = process.env.JWT_SECRET  || 'secret';

// ── Token factory ─────────────────────────────────────────────────────────────
function makeToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

/**
 * makeSetupToken — a short-lived token used ONLY during the student profile-
 * completion step. It carries the user id so the setup endpoint can securely
 * update the correct User document without requiring a password.
 * It is NOT a full authentication token (role is 'student-setup', not 'student').
 */
function makeSetupToken(userId) {
  return jwt.sign(
    { id: userId, role: 'student-setup' },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
}

// ── Helper: is student profile complete? ─────────────────────────────────────
function isStudentProfileComplete(user) {
  return !!(user.displayName && user.displayName.trim() &&
            user.rollNumber  && user.rollNumber.trim());
}

// ─────────────────────────────────────────────────────────────────────────────
// TEACHER AUTH
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/auth/register  (teacher)
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email: email.toLowerCase(), passwordHash, role: 'teacher' });
    res.status(201).json({ id: user._id, email: user.email, role: user.role });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Email already registered' });
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT AUTH
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/auth/student/register
router.post('/student/register', async (req, res) => {
  try {
    const { email, password, displayName, rollNumber, section, course } = req.body;
    if (!email || !password || !displayName) {
      return res.status(400).json({ error: 'email, password and name required' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email: email.toLowerCase(), passwordHash, displayName,
      rollNumber: rollNumber || '', section: section || '', course: course || '',
      role: 'student',
    });
    res.status(201).json({ id: user._id, email: user.email, role: user.role });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Email already registered' });
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// UNIFIED LOGIN  (teacher or student — role determined by DB record)
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.passwordHash || user.passwordHash === 'google-oauth') {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ token: makeToken(user), role: user.role });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE ENDPOINTS
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/auth/me  — works for both teachers (authMiddleware) and students (studentAuth)
// We use a combined approach: try teacher first, then student.
router.get('/me', async (req, res) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    const user = await User.findById(payload.id).select('-passwordHash -googleId');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      _id:         user._id,
      email:       user.email,
      displayName: user.displayName || user.email.split('@')[0],
      role:        user.role,
      photoUrl:    user.photoUrl || null,
      rollNumber:  user.rollNumber,
      section:     user.section,
      course:      user.course,
    });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT PROFILE SETUP  (called after Google OAuth for incomplete profiles)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/auth/student/complete-profile
 *
 * Body: { setupToken, displayName, rollNumber, section, course }
 *
 * The `setupToken` is the short-lived token issued by the Google student callback
 * when the account profile is incomplete. It identifies the user without granting
 * full student access. After validation the user record is updated and a full
 * studentToken is returned.
 */
router.post('/student/complete-profile', async (req, res) => {
  try {
    const { setupToken, displayName, rollNumber, section, course } = req.body;
    if (!setupToken) return res.status(400).json({ error: 'setupToken required' });
    if (!displayName || !displayName.trim()) {
      return res.status(400).json({ error: 'displayName is required' });
    }

    let payload;
    try {
      payload = jwt.verify(setupToken, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Setup token expired or invalid. Please sign in with Google again.' });
    }
    if (payload.role !== 'student-setup') {
      return res.status(403).json({ error: 'Invalid setup token' });
    }

    const user = await User.findById(payload.id);
    if (!user || user.role !== 'student') {
      return res.status(404).json({ error: 'Student account not found' });
    }

    user.displayName = displayName.trim();
    user.rollNumber  = (rollNumber || '').trim();
    user.section     = (section    || '').trim();
    user.course      = (course     || '').trim();
    await user.save();

    // Issue full student token now that profile is complete
    res.json({ token: makeToken(user), role: 'student' });
  } catch (err) {
    console.error('complete-profile error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TEACHER GOOGLE OAUTH  (existing — unchanged)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/auth/google
router.get('/google',
  passport.authenticate('google-teacher', { scope: ['profile', 'email'], session: false })
);

// GET /api/auth/google/callback
router.get('/google/callback',
  passport.authenticate('google-teacher', {
    session: false,
    failureRedirect: `${CLIENT_URL}/login?error=google_failed`,
  }),
  (req, res) => {
    if (!req.user) {
      return res.redirect(`${CLIENT_URL}/login?error=account_is_student`);
    }
    const token = makeToken(req.user);
    res.redirect(`${CLIENT_URL}/auth/callback?token=${token}&role=teacher`);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT GOOGLE OAUTH  (new)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/auth/google/student
router.get('/google/student',
  passport.authenticate('google-student', { scope: ['profile', 'email'], session: false })
);

// GET /api/auth/google/student/callback
router.get('/google/student/callback',
  passport.authenticate('google-student', {
    session: false,
    failureRedirect: `${CLIENT_URL}/student/login?error=google_failed`,
  }),
  (req, res) => {
    if (!req.user) {
      // Conflict: email belongs to a teacher account
      return res.redirect(`${CLIENT_URL}/student/login?error=account_is_teacher`);
    }

    const user = req.user;

    // Case 1: Profile is complete — issue full studentToken and go to dashboard
    if (isStudentProfileComplete(user)) {
      const token = makeToken(user);
      return res.redirect(`${CLIENT_URL}/auth/callback?token=${token}&role=student`);
    }

    // Case 2: Profile incomplete — issue setup token and send to profile-setup page
    // The setup token carries enough identity to complete the profile; it is NOT
    // a full auth token and cannot access student-protected API routes.
    const setupToken = makeSetupToken(user._id);
    const params = new URLSearchParams({
      setupToken,
      email:       user.email,
      displayName: user.displayName || '',
      photoUrl:    user.photoUrl    || '',
    });
    return res.redirect(`${CLIENT_URL}/student/profile-setup?${params.toString()}`);
  }
);

module.exports = router;
