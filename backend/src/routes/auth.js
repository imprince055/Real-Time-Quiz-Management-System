const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const passport = require('../config/passport');
const User     = require('../models/User');

const router = express.Router();

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const JWT_SECRET = process.env.JWT_SECRET  || 'secret';

// ─────────────────────────────────────────────────────────────────────────────
// Token factories
// ─────────────────────────────────────────────────────────────────────────────

/**
 * makeToken(user, activeRole)
 *
 * Issues a JWT that:
 *  - identifies the user (id, email)
 *  - encodes the specific role being used in this token (activeRole)
 *  - encodes the full roles[] array so middleware can do roles.includes(x)
 *
 * Backward-compat: `role` string field is also included so old middleware
 * and old tokens continue to work without changes.
 */
function makeToken(user, activeRole) {
  const effectiveRoles = User.normalizeRoles(user);
  return jwt.sign(
    {
      id:     user._id,
      email:  user.email,
      role:   activeRole,          // legacy single-role claim
      roles:  effectiveRoles,      // new multi-role claim
    },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

/**
 * makeSetupToken — short-lived token used ONLY during student profile-
 * completion. Role is 'student-setup' so it cannot access protected routes.
 */
function makeSetupToken(userId) {
  return jwt.sign(
    { id: userId, role: 'student-setup', roles: ['student-setup'] },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
}

// ── Helper ────────────────────────────────────────────────────────────────────
function isStudentProfileComplete(user) {
  return !!(user.displayName && user.displayName.trim() &&
            user.rollNumber  && user.rollNumber.trim());
}

// ─────────────────────────────────────────────────────────────────────────────
// TEACHER REGISTRATION
// POST /api/auth/register
//
// Multi-role: if the email already exists, add "teacher" role rather than
// returning a duplicate-email error.  If the email is new, create the user.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      // Account already exists — add teacher role if missing
      const effective = existing.getRoles();
      if (effective.includes('teacher')) {
        // Already a teacher — treat as duplicate registration, guide to login
        return res.status(409).json({ error: 'Email already registered as a teacher. Please sign in.' });
      }
      // Add teacher role to existing account (e.g. student adding teacher role)
      await existing.ensureRole('teacher');
      return res.status(200).json({
        id: existing._id, email: existing.email,
        roles: existing.getRoles(),
        message: 'Teacher role added to your existing account.',
      });
    }

    // New user
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email: email.toLowerCase(), passwordHash,
      roles: ['teacher'], role: 'teacher',
    });
    res.status(201).json({ id: user._id, email: user.email, roles: user.roles });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Email already registered' });
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT REGISTRATION
// POST /api/auth/student/register
//
// Multi-role: if the email already exists, add "student" role rather than
// returning a duplicate-email error.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/student/register', async (req, res) => {
  try {
    const { email, password, displayName, rollNumber, section, course } = req.body;
    if (!email || !password || !displayName) {
      return res.status(400).json({ error: 'email, password and name required' });
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      const effective = existing.getRoles();
      if (effective.includes('student')) {
        return res.status(409).json({ error: 'Email already registered as a student. Please sign in.' });
      }
      // Add student role + profile fields to existing teacher account
      existing.displayName = existing.displayName || displayName;
      existing.rollNumber  = rollNumber || existing.rollNumber || '';
      existing.section     = section    || existing.section    || '';
      existing.course      = course     || existing.course     || '';
      await existing.ensureRole('student');   // saves the document
      return res.status(200).json({
        id: existing._id, email: existing.email,
        roles: existing.getRoles(),
        message: 'Student role added to your existing account.',
      });
    }

    // New user
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email: email.toLowerCase(), passwordHash, displayName,
      rollNumber: rollNumber || '', section: section || '', course: course || '',
      roles: ['student'], role: 'student',
    });
    res.status(201).json({ id: user._id, email: user.email, roles: user.roles });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Email already registered' });
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// UNIFIED LOGIN
// POST /api/auth/login
//
// The `role` body param tells the backend which portal the user is logging in
// through.  The backend verifies the user actually HAS that role before
// issuing the corresponding token.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password, role: requestedRole } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.passwordHash || user.passwordHash === 'google-oauth') {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const effective = user.getRoles();

    // Determine which role to issue token for
    // If the frontend sent a role, respect it (and verify); otherwise fall back
    // to backward-compat behaviour (first role in the array).
    const activeRole = requestedRole || effective[0];

    if (!effective.includes(activeRole)) {
      return res.status(403).json({
        error: `This account does not have the ${activeRole} role.`,
        roles: effective,
      });
    }

    res.json({ token: makeToken(user, activeRole), role: activeRole, roles: effective });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// /api/auth/me  — works for any valid token (teacher or student)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/me', async (req, res) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    const user    = await User.findById(payload.id).select('-passwordHash -googleId');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const effectiveRoles = user.getRoles();
    res.json({
      _id:         user._id,
      email:       user.email,
      displayName: user.displayName || user.email.split('@')[0],
      // New field: full roles array
      roles:       effectiveRoles,
      // Legacy field: the role used in the current token (for compat)
      role:        payload.role || effectiveRoles[0] || null,
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
// STUDENT PROFILE SETUP (Google OAuth onboarding)
// POST /api/auth/student/complete-profile
// ─────────────────────────────────────────────────────────────────────────────
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
    if (!user) return res.status(404).json({ error: 'Account not found' });

    // Ensure student role (may have been teacher-only previously)
    const effective = user.getRoles();
    if (!effective.includes('student')) {
      user.roles = [...new Set([...effective, 'student'])];
      user.role  = user.roles[0];
    }

    user.displayName = displayName.trim();
    user.rollNumber  = (rollNumber || '').trim();
    user.section     = (section    || '').trim();
    user.course      = (course     || '').trim();
    await user.save();

    res.json({ token: makeToken(user, 'student'), role: 'student', roles: user.getRoles() });
  } catch (err) {
    console.error('complete-profile error', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TEACHER GOOGLE OAUTH
// ─────────────────────────────────────────────────────────────────────────────
router.get('/google',
  passport.authenticate('google-teacher', { scope: ['profile', 'email'], session: false })
);

router.get('/google/callback',
  passport.authenticate('google-teacher', {
    session: false,
    failureRedirect: `${CLIENT_URL}/login?error=google_failed`,
  }),
  (req, res) => {
    if (!req.user) return res.redirect(`${CLIENT_URL}/login?error=google_failed`);
    const token = makeToken(req.user, 'teacher');
    res.redirect(`${CLIENT_URL}/auth/callback?token=${token}&role=teacher`);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// STUDENT GOOGLE OAUTH
// ─────────────────────────────────────────────────────────────────────────────
router.get('/google/student',
  passport.authenticate('google-student', { scope: ['profile', 'email'], session: false })
);

router.get('/google/student/callback',
  passport.authenticate('google-student', {
    session: false,
    failureRedirect: `${CLIENT_URL}/student/login?error=google_failed`,
  }),
  (req, res) => {
    if (!req.user) return res.redirect(`${CLIENT_URL}/student/login?error=google_failed`);

    const user = req.user;

    // Profile complete → full student token → dashboard
    if (isStudentProfileComplete(user)) {
      const token = makeToken(user, 'student');
      return res.redirect(`${CLIENT_URL}/auth/callback?token=${token}&role=student`);
    }

    // Profile incomplete → setup token → profile-setup page
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
