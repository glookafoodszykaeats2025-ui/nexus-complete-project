require('dotenv').config();
const express   = require('express');
const helmet    = require('helmet');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');
const path      = require('path');

const { authRouter, ordersRouter, invRouter, whRouter, analyticsRouter, aiRouter } = require('./routes/index');
const { errorHandler } = require('./middleware/errorHandler');

const app  = express();
const PORT = process.env.PORT || 4000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:4000').split(','),
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(rateLimit({ windowMs: 15*60*1000, max: 500, standardHeaders: true, legacyHeaders: false }));

if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => { console.log(`${req.method} ${req.path}`); next(); });
}

// Serve frontend
const frontendPath = path.join(__dirname, '../../frontend');
app.use(express.static(frontendPath));

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// API routes
app.use('/api/auth',       authRouter);
app.use('/api/orders',     ordersRouter);
app.use('/api/inventory',  invRouter);
app.use('/api/warehouses', whRouter);
app.use('/api/analytics',  analyticsRouter);
app.use('/api/ai',         aiRouter);

// SPA fallback
app.get('*', (_req, res) => {
  const idx = path.join(frontendPath, 'index.html');
  res.sendFile(idx, (err) => { if (err) res.status(404).json({ error: 'Not found' }); });
});

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`\n🚀 Nexus Commerce → http://localhost:${PORT}`);
  console.log(`   Mode: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   DB:   ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}\n`);
});

module.exports = app;
