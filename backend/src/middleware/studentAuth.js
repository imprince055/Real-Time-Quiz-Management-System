const jwt = require('jsonwebtoken');

/**
 * studentAuth — student-role guard.
 *
 * Verifies the Bearer JWT and ensures the token represents a student.
 * Checks `roles[]` first (new tokens), then falls back to legacy `role`
 * string so existing student sessions continue to work.
 *
 * Sets req.student = decoded payload on success.
 */
function studentAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'secret');

    // Normalise roles — support both new `roles[]` and legacy `role` string
    const roles = Array.isArray(payload.roles) && payload.roles.length
      ? payload.roles
      : payload.role ? [payload.role] : [];

    if (!roles.includes('student')) {
      return res.status(403).json({ error: 'Student access required' });
    }

    req.student = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = studentAuth;
