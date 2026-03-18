# Nexus Commerce — Full-Stack Project

Complete unified commerce OS with 6-page marketing website + admin dashboard, wired to a production-grade Node.js + Express + PostgreSQL backend.

---

## Project structure

```
nexus-project/
├── backend/                    ← Node.js + Express + PostgreSQL API
│   ├── src/
│   │   ├── index.js            ← Express server (serves frontend too)
│   │   ├── db/pool.js          ← PostgreSQL connection pool
│   │   ├── middleware/
│   │   │   ├── auth.js         ← JWT verify + role guard
│   │   │   └── errorHandler.js ← Async wrapper + global error handler
│   │   ├── controllers/
│   │   │   ├── authController.js
│   │   │   ├── ordersController.js
│   │   │   ├── inventoryController.js
│   │   │   ├── warehouseController.js
│   │   │   ├── analyticsController.js
│   │   │   └── aiController.js
│   │   └── routes/
│   │       ├── auth.js
│   │       ├── orders.js
│   │       ├── inventory.js
│   │       ├── warehouse.js
│   │       └── analytics.js    ← includes AI routes
│   ├── scripts/
│   │   ├── migrate.js          ← Full PostgreSQL schema
│   │   └── seed.js             ← 60 orders, 10 SKUs, 3 warehouses
│   ├── package.json
│   └── .env.example
└── frontend/
    └── index.html              ← Complete 6-page website + dashboard
```

---

## Quick start

### 1. PostgreSQL setup

```bash
psql -U postgres -c "CREATE DATABASE nexus_commerce;"
```

### 2. Backend setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env — add DB credentials + JWT_SECRET + ANTHROPIC_API_KEY
npm run db:migrate
npm run db:seed
npm run dev
```

Server starts at **http://localhost:4000**

The backend automatically serves the frontend from `../frontend/index.html`.
So just open **http://localhost:4000** in your browser — that's the full app.

### 3. (Optional) Open frontend directly

If you want to run frontend standalone without the backend:
- Open `frontend/index.html` directly in your browser
- The dashboard will show errors since there's no API, but all 6 marketing pages work fine

---

## Demo credentials

| Email | Password | Role |
|---|---|---|
| admin@nexus.com | password123 | admin |
| manager@nexus.com | password123 | manager |
| operator@nexus.com | password123 | operator |

---

## What's built

### Frontend (frontend/index.html)
Single HTML file, zero dependencies, zero build step.

- **Home** — Hero with live dashboard preview, logos, stats, 6 feature cards, 2 module deep-dives, testimonials, integrations strip, CTA
- **Features** — Sticky sidebar nav + 6 detailed feature blocks (Analytics, Orders, Inventory, Warehouse, AI, Returns)
- **Pricing** — Annual/monthly toggle with live price switching, 3-tier cards, FAQ accordion
- **About** — Dark hero, mission, numbers grid, investor strip, values, team
- **Blog** — Featured article layout + 6-article grid with category filters
- **Contact** — Dark hero, 4 contact channels, full demo request form, 3 offices
- **Dashboard** — Full admin dashboard with real API calls:
  - Overview: live KPIs from `/api/orders/stats`, channel breakdown
  - Orders: filterable table, click-to-open detail modal with timeline, CSV export, create new order
  - Inventory: filterable by health, live available stock
  - Warehouse: operators with progress bars, courier manifests
  - Analytics: 7-day KPIs + top SKUs from API
  - AI Insights: powered by `/api/ai/insights` (Claude)

### Backend API (25+ endpoints)

| Module | Endpoints |
|---|---|
| Auth | POST /register, POST /login, POST /refresh, GET /me, POST /logout |
| Orders | GET / (filterable+paginated), GET /stats, GET /:id, POST /, PATCH /:id/status, DELETE /:id |
| Inventory | GET / , GET /alerts, GET /summary, GET /:skuCode, POST /adjust |
| Warehouses | GET /, GET /:id, GET /:id/stats, PATCH /operators/:id, PATCH /manifests/:id |
| Analytics | GET /overview, GET /top-skus, GET /fulfilment |
| AI | POST /insights, POST /insights/stream (SSE) |

### Database schema (PostgreSQL)
- `users` + `refresh_tokens` — auth with bcrypt + JWT
- `warehouses` + `warehouse_zones` + `operators` — multi-warehouse ops
- `skus` + `inventory` — multi-location stock tracking
- `orders` + `order_items` + `order_events` — full order lifecycle with audit trail
- `courier_manifests` — daily courier dispatch tracking
- Full indexes, updated_at triggers, check constraints

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| PORT | No | API port (default 4000) |
| NODE_ENV | No | development / production |
| DB_HOST | Yes | PostgreSQL host |
| DB_PORT | No | PostgreSQL port (default 5432) |
| DB_NAME | Yes | Database name |
| DB_USER | Yes | DB user |
| DB_PASSWORD | Yes | DB password |
| JWT_SECRET | Yes | Min 32 chars, keep secret |
| JWT_EXPIRES_IN | No | Token TTL (default 7d) |
| ANTHROPIC_API_KEY | Yes | For AI insights endpoint |
| ALLOWED_ORIGINS | No | Comma-separated CORS origins |

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Plain HTML/CSS/JS — no framework, no build step |
| Fonts | Plus Jakarta Sans + Instrument Serif (Google Fonts) |
| Backend | Node.js 18+ + Express 4 |
| Database | PostgreSQL 14+ |
| Auth | JWT (access) + UUID refresh tokens + bcrypt |
| AI | Anthropic Claude (claude-sonnet-4) |
| Security | Helmet, CORS, express-rate-limit |
