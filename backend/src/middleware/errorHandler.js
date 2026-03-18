const { validationResult } = require('express-validator');
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const validate = (req, res, next) => {
  const e = validationResult(req);
  if (!e.isEmpty()) return res.status(422).json({ error: 'Validation failed', details: e.array().map(x => ({ field: x.path, message: x.msg })) });
  next();
};
const errorHandler = (err, req, res, _next) => {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path} — ${err.message}`);
  if (err.code === '23505') return res.status(409).json({ error: 'Duplicate record' });
  if (err.code === '23503') return res.status(422).json({ error: 'Referenced record not found' });
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
};
module.exports = { asyncHandler, validate, errorHandler };
