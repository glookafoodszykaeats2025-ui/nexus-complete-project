const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const { query } = require('../db/pool');
const sign = (id) => jwt.sign({ sub: id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

exports.register = async (req, res) => {
  const { name, email, password, role = 'viewer' } = req.body;
  if ((await query('SELECT id FROM users WHERE email=$1', [email])).rows.length) return res.status(409).json({ error: 'Email already registered' });
  const hash = await bcrypt.hash(password, 12);
  const { rows } = await query('INSERT INTO users(id,name,email,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING id,name,email,role', [uuid(), name, email, hash, role]);
  res.status(201).json({ user: rows[0], token: sign(rows[0].id) });
};

exports.login = async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await query('SELECT id,name,email,password_hash,role,is_active FROM users WHERE email=$1', [email]);
  const u = rows[0];
  if (!u || !u.is_active || !(await bcrypt.compare(password, u.password_hash))) return res.status(401).json({ error: 'Invalid credentials' });
  await query('UPDATE users SET last_login_at=NOW() WHERE id=$1', [u.id]);
  const rt = uuid();
  await query('INSERT INTO refresh_tokens(id,user_id,token,expires_at) VALUES($1,$2,$3,$4)', [uuid(), u.id, rt, new Date(Date.now() + 30*86400000)]);
  res.json({ user: { id: u.id, name: u.name, email: u.email, role: u.role }, token: sign(u.id), refreshToken: rt });
};

exports.refresh = async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'refreshToken required' });
  const { rows } = await query('SELECT * FROM refresh_tokens WHERE token=$1 AND expires_at>NOW()', [refreshToken]);
  if (!rows.length) return res.status(401).json({ error: 'Invalid or expired refresh token' });
  await query('DELETE FROM refresh_tokens WHERE token=$1', [refreshToken]);
  const nrt = uuid();
  await query('INSERT INTO refresh_tokens(id,user_id,token,expires_at) VALUES($1,$2,$3,$4)', [uuid(), rows[0].user_id, nrt, new Date(Date.now() + 30*86400000)]);
  res.json({ token: sign(rows[0].user_id), refreshToken: nrt });
};

exports.me = (req, res) => res.json({ user: req.user });

exports.logout = async (req, res) => {
  if (req.body.refreshToken) await query('DELETE FROM refresh_tokens WHERE token=$1', [req.body.refreshToken]);
  res.json({ message: 'Logged out' });
};
