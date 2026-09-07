const jwt = require('jsonwebtoken');

/**
 * authMiddleware — teacher-role guard.
 *
 * Verifies the Bearer JWT and ensures the token represents a teacher.
 * Checks the `roles` array in the payload first (new tokens), then falls
 * back to the legacy `role` string (tokens issued before the multi-role
 * migration) so that existing sessions continue to work.
 *
 * Sets req.teacher = decoded payload on success.
 */
function authMiddleware(req, res, next) {
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

    if (!roles.includes('teacher')) {
      return res.status(403).json({ error: 'Teacher access required' });
    }

    req.teacher = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = authMiddleware;
