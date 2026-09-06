const jwt = require('jsonwebtoken');


function studentAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    if (payload.role !== 'student') {
      return res.status(403).json({ error: 'Student access required' });
    }
    req.student = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = studentAuth;
