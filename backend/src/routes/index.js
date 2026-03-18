// ─── auth.js ───────────────────────────────────────────────────────
const authRouter = require('express').Router();
const { body } = require('express-validator');
const authCtrl = require('../controllers/authController');
const { validate } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
authRouter.post('/register', [body('name').trim().notEmpty(), body('email').isEmail().normalizeEmail(), body('password').isLength({min:6})], validate, authCtrl.register);
authRouter.post('/login', [body('email').isEmail().normalizeEmail(), body('password').isLength({min:1})], validate, authCtrl.login);
authRouter.post('/refresh', authCtrl.refresh);
authRouter.get('/me', authenticate, authCtrl.me);
authRouter.post('/logout', authenticate, authCtrl.logout);

// ─── orders.js ─────────────────────────────────────────────────────
const ordersRouter = require('express').Router();
const { authenticate: auth2, authorize } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const ordCtrl = require('../controllers/ordersController');
ordersRouter.use(auth2);
ordersRouter.get('/', asyncHandler(ordCtrl.list));
ordersRouter.get('/stats', asyncHandler(ordCtrl.stats));
ordersRouter.get('/:id', asyncHandler(ordCtrl.get));
ordersRouter.post('/', authorize('admin','manager','operator'), asyncHandler(ordCtrl.create));
ordersRouter.patch('/:id/status', authorize('admin','manager','operator'), asyncHandler(ordCtrl.updateStatus));
ordersRouter.delete('/:id', authorize('admin','manager'), asyncHandler(ordCtrl.cancel));

// ─── inventory.js ──────────────────────────────────────────────────
const invRouter = require('express').Router();
const invCtrl = require('../controllers/inventoryController');
invRouter.use(auth2);
invRouter.get('/', asyncHandler(invCtrl.list));
invRouter.get('/alerts', asyncHandler(invCtrl.alerts));
invRouter.get('/summary', asyncHandler(invCtrl.summary));
invRouter.get('/:skuCode', asyncHandler(invCtrl.getBySku));
invRouter.post('/adjust', authorize('admin','manager','operator'), asyncHandler(invCtrl.adjust));

// ─── warehouse.js ──────────────────────────────────────────────────
const whRouter = require('express').Router();
const whCtrl = require('../controllers/warehouseController');
whRouter.use(auth2);
whRouter.get('/', asyncHandler(whCtrl.list));
whRouter.get('/:id', asyncHandler(whCtrl.get));
whRouter.get('/:id/stats', asyncHandler(whCtrl.stats));
whRouter.patch('/operators/:id', authorize('admin','manager'), asyncHandler(whCtrl.updateOperator));
whRouter.patch('/manifests/:id', authorize('admin','manager','operator'), asyncHandler(whCtrl.updateManifest));

// ─── analytics.js + ai.js ──────────────────────────────────────────
const analyticsRouter = require('express').Router();
const aiRouter = require('express').Router();
const rateLimit = require('express-rate-limit');
const anCtrl = require('../controllers/analyticsController');
const aiCtrl = require('../controllers/aiController');
analyticsRouter.use(auth2);
analyticsRouter.get('/overview',   asyncHandler(anCtrl.overview));
analyticsRouter.get('/top-skus',   asyncHandler(anCtrl.topSkus));
analyticsRouter.get('/fulfilment', asyncHandler(anCtrl.fulfilment));
aiRouter.use(auth2);
aiRouter.use(rateLimit({ windowMs: 60000, max: 20, message: { error: 'Too many AI requests.' } }));
aiRouter.post('/insights',        asyncHandler(aiCtrl.insights));
aiRouter.post('/insights/stream', asyncHandler(aiCtrl.stream));

module.exports = { authRouter, ordersRouter, invRouter, whRouter, analyticsRouter, aiRouter };
