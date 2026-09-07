const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4000';

// ─────────────────────────────────────────────────────────────────────────────
// Shared helper: find or create a User, always ensuring the intended role.
//
// Multi-role behaviour:
//   - If the email already exists with ANY role combination → find that user
//     and ADD the intendedRole if it isn't already present (no conflict).
//   - If the email does not exist → create a new User with that role.
//   - Never reject based on role mismatch — just add the new role.
//   - Never create duplicate User documents for the same email.
//
// Returns { user, isNew }
//   user  — the User document (already saved with updated roles)
//   isNew — true if the User document was just created (no previous record)
// ─────────────────────────────────────────────────────────────────────────────
async function findOrCreateGoogleUser(profile, intendedRole) {
  const email      = profile.emails[0].value.toLowerCase();
  const googleName = profile.displayName || email.split('@')[0];
  const photoUrl   = profile.photos?.[0]?.value || null;

  let user = await User.findOne({ email });

  if (user) {
    // Update Google metadata on every login
    user.photoUrl = photoUrl;
    if (!user.googleId) user.googleId = profile.id;

    // For teachers, always refresh displayName from Google
    if (intendedRole === 'teacher') user.displayName = googleName;
    // For students, update displayName from Google only if blank
    if (intendedRole === 'student' && !user.displayName) user.displayName = googleName;

    // Add the intended role if not already present (multi-role support)
    const effective = user.getRoles();
    if (!effective.includes(intendedRole)) {
      user.roles = [...new Set([...effective, intendedRole])];
      user.role  = user.roles[0]; // keep legacy field in sync
    }

    await user.save();
    return { user, isNew: false };
  }

  // New user — create with the intended role
  user = await User.create({
    email,
    displayName:  googleName,
    googleId:     profile.id,
    passwordHash: 'google-oauth',
    roles:        [intendedRole],
    role:         intendedRole,   // legacy compat
    photoUrl,
    rollNumber: '',
    section:    '',
    course:     '',
  });
  return { user, isNew: true };
}

// ── Strategy 1: Teacher Google Login ─────────────────────────────────────────
passport.use('google-teacher', new GoogleStrategy(
  {
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  process.env.GOOGLE_CALLBACK_URL || `${BACKEND_URL}/api/auth/google/callback`,
  },
  async (_access, _refresh, profile, done) => {
    try {
      const { user } = await findOrCreateGoogleUser(profile, 'teacher');
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }
));

// ── Strategy 2: Student Google Login ─────────────────────────────────────────
passport.use('google-student', new GoogleStrategy(
  {
    clientID:     process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL:  process.env.GOOGLE_STUDENT_CALLBACK_URL || `${BACKEND_URL}/api/auth/google/student/callback`,
  },
  async (_access, _refresh, profile, done) => {
    try {
      const { user, isNew } = await findOrCreateGoogleUser(profile, 'student');
      // Attach isNew so the callback route knows whether to trigger profile-setup
      user._isNewGoogleStudent = isNew;
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }
));

module.exports = passport;
