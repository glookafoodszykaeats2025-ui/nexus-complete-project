require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { pool } = require('../src/db/pool');

const schema = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(120) NOT NULL,
  email VARCHAR(200) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','manager','operator','viewer')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warehouses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  city VARCHAR(80), state VARCHAR(80), pincode VARCHAR(10),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS skus (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku_code VARCHAR(60) NOT NULL UNIQUE,
  product_name VARCHAR(200) NOT NULL,
  category VARCHAR(80), brand VARCHAR(80),
  mrp NUMERIC(12,2), cost NUMERIC(12,2), weight_grams INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  reorder_level INTEGER NOT NULL DEFAULT 10,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(sku_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number VARCHAR(30) NOT NULL UNIQUE,
  channel VARCHAR(50) NOT NULL,
  channel_order_id VARCHAR(80),
  customer_name VARCHAR(120) NOT NULL,
  customer_email VARCHAR(200), customer_phone VARCHAR(20),
  status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','packed','shipped','delivered','cancelled','returned','rto','breach')),
  payment_status VARCHAR(20) NOT NULL DEFAULT 'paid' CHECK (payment_status IN ('pending','paid','failed','refunded')),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  shipping_fee NUMERIC(12,2) NOT NULL DEFAULT 49,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  warehouse_id UUID REFERENCES warehouses(id),
  courier VARCHAR(80), awb_number VARCHAR(80),
  sla_deadline TIMESTAMPTZ, sla_breached BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT, shipping_addr JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sku_id UUID NOT NULL REFERENCES skus(id),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_type VARCHAR(60) NOT NULL,
  description TEXT,
  actor_id UUID REFERENCES users(id),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS warehouse_zones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(80), zone_type VARCHAR(30) DEFAULT 'picking',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(warehouse_id, code)
);

CREATE TABLE IF NOT EXISTS operators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(120) NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  zone_id UUID REFERENCES warehouse_zones(id),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','break','offline','packing')),
  picks_today INTEGER NOT NULL DEFAULT 0,
  shift_start TIME,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courier_manifests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  courier_name VARCHAR(80) NOT NULL,
  bag_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','scanning','ready','dispatched')),
  manifest_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_channel    ON orders(channel);
CREATE INDEX IF NOT EXISTS idx_orders_created    ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_sla        ON orders(sla_breached) WHERE sla_breached = TRUE;
CREATE INDEX IF NOT EXISTS idx_inventory_sku     ON inventory(sku_id);
CREATE INDEX IF NOT EXISTS idx_inventory_wh      ON inventory(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_evts_order  ON order_events(order_id);

CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DO $$ DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','skus','inventory','orders','operators','courier_manifests'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_upd ON %I; CREATE TRIGGER trg_%I_upd BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at();', t,t,t,t);
  END LOOP;
END $$;
`;

async function run() {
  console.log('🔄 Running migrations…');
  try { await pool.query(schema); console.log('✅ Migrations complete.'); }
  catch (e) { console.error('❌ Migration failed:', e.message); process.exit(1); }
  finally { await pool.end(); }
}
run();
