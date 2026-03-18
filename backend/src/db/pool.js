const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'nexus_commerce',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  max: 20, idleTimeoutMillis: 30000, connectionTimeoutMillis: 2000,
});
pool.on('error', (err) => { console.error('DB pool error:', err); process.exit(-1); });
const query = (text, params) => pool.query(text, params);
const withTransaction = async (fn) => {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const r = await fn(client); await client.query('COMMIT'); return r; }
  catch (e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
};
module.exports = { pool, query, withTransaction };
