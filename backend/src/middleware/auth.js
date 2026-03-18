const jwt = require('jsonwebtoken');
const { query } = require('../db/pool');
const authenticate = async (req, res, next) => {
  try {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing Authorization header' });
    const payload = jwt.verify(h.slice(7), process.env.JWT_SECRET);
    const { rows } = await query('SELECT id,name,email,role,is_active FROM users WHERE id=$1', [payload.sub]);
    if (!rows.length || !rows[0].is_active) return res.status(401).json({ error: 'User not found' });
    req.user = rows[0]; next();
  } catch (e) { res.status(401).json({ error: e.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token' }); }
};
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: `Requires: ${roles.join(', ')}` });
  next();
};
module.exports = { authenticate, authorize };
