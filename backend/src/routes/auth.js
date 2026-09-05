const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const passport = require('../config/passport');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

function makeToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: '8h' }
  );
}

router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, passwordHash, role: 'teacher' });
    res.status(201).json({ id: user._id, email: user.email, role: user.role });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Email already registered' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/student/register', async (req, res) => {
  try {
    const { email, password, displayName, rollNumber, section, course } = req.body;
    if (!email || !password || !displayName) {
      return res.status(400).json({ error: 'email, password and name required' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email, passwordHash, displayName,
      rollNumber: rollNumber || '',
      section: section || '',
      course: course || '',
      role: 'student',
    });
    res.status(201).json({ id: user._id, email: user.email, role: user.role });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'Email already registered' });
    res.status(500).json({ error: 'Server error' });
  }
});

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

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.teacher.id).select('-passwordHash -googleId');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      _id: user._id,
      email: user.email,
      displayName: user.displayName || user.email.split('@')[0],
      role: user.role || 'teacher',
      photoUrl: user.photoUrl || null,
      rollNumber: user.rollNumber,
      section: user.section,
      course: user.course,
    });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));

router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${process.env.CLIENT_URL}/login?error=google_failed` }),
  (req, res) => {
    const token = makeToken(req.user);
    res.redirect(`${process.env.CLIENT_URL}/auth/callback?token=${token}&role=${req.user.role}`);
  }
);

module.exports = router;
