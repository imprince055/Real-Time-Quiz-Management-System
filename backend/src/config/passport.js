const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

// ── Shared helper ────────────────────────────────────────────────────────────
// Finds or creates a User by Google profile.
// `intendedRole` is set by the server — never trusted from the client.
async function findOrCreateGoogleUser(profile, intendedRole) {
  const email      = profile.emails[0].value.toLowerCase();
  const googleName = profile.displayName || email.split('@')[0];
  const photoUrl   = profile.photos?.[0]?.value || null;

  let user = await User.findOne({ email });

  if (user) {
    // Security: if the account belongs to the OTHER role, refuse silently
    // (caller will handle the error via the `conflict` flag).
    if (user.role !== intendedRole) {
      return { user: null, isNew: false, conflict: true };
    }
    // Refresh Google data on every login
    user.photoUrl = photoUrl;
    if (!user.googleId) user.googleId = profile.id;
    // For students, update displayName from Google only if it was blank
    if (intendedRole === 'student' && !user.displayName) user.displayName = googleName;
    // For teachers, always refresh displayName from Google
    if (intendedRole === 'teacher') user.displayName = googleName;
    await user.save();
    return { user, isNew: false, conflict: false };
  }

  // New account
  user = await User.create({
    email,
    displayName:  googleName,
    googleId:     profile.id,
    passwordHash: 'google-oauth',
    role:         intendedRole,
    photoUrl,
    // Student-specific fields start blank; filled via profile-setup page
    rollNumber: '',
    section:    '',
    course:     '',
  });
  return { user, isNew: true, conflict: false };
}

// ── Strategy 1: Teacher Google Login (existing — unchanged behaviour) ─────────
passport.use('google-teacher', new GoogleStrategy(
  {
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  process.env.GOOGLE_CALLBACK_URL || `${BACKEND_URL}/api/auth/google/callback`,
  },
  async (_access, _refresh, profile, done) => {
    try {
      const { user, conflict } = await findOrCreateGoogleUser(profile, 'teacher');
      if (conflict) {
        // Email belongs to a student account — send to error page
        return done(null, false, { message: 'account_is_student' });
      }
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }
));

// ── Strategy 2: Student Google Login (new) ────────────────────────────────────
passport.use('google-student', new GoogleStrategy(
  {
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  process.env.GOOGLE_STUDENT_CALLBACK_URL || `${BACKEND_URL}/api/auth/google/student/callback`,
  },
  async (_access, _refresh, profile, done) => {
    try {
      const { user, isNew, conflict } = await findOrCreateGoogleUser(profile, 'student');
      if (conflict) {
        // Email belongs to a teacher account
        return done(null, false, { message: 'account_is_teacher' });
      }
      // Attach isNew so the callback route knows whether to run profile-setup
      user._isNewGoogleStudent = isNew;
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }
));

module.exports = passport;
