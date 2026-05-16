-- TenPOS Database Schema
-- Ten Foundation Philippines Inc.

-- ─────────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────────

CREATE TYPE user_role AS ENUM ('admin', 'manager', 'cashier', 'viewer');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended');
CREATE TYPE transaction_status AS ENUM ('completed', 'voided', 'returned');
CREATE TYPE sync_status AS ENUM ('synced', 'pending', 'conflict');
CREATE TYPE payment_method AS ENUM ('cash', 'gcash', 'paymaya', 'card');
CREATE TYPE adjustment_type AS ENUM ('in', 'out', 'correction', 'damage', 'return');
CREATE TYPE discount_type AS ENUM ('percentage', 'fixed');
CREATE TYPE audit_severity AS ENUM ('low', 'medium', 'high', 'critical');

-- ─────────────────────────────────────────────
-- BRANCHES
-- ─────────────────────────────────────────────

CREATE TABLE branches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  address       TEXT,
  manager_name  VARCHAR(255),
  active        BOOLEAN NOT NULL DEFAULT true,
  terminal_count INT NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────────

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  pin_hash      VARCHAR(255),
  role          user_role NOT NULL DEFAULT 'cashier',
  branch_id     UUID REFERENCES branches(id) ON DELETE SET NULL,
  status        user_status NOT NULL DEFAULT 'active',
  last_login    TIMESTAMPTZ,
  sales_count   INT NOT NULL DEFAULT 0,
  failed_logins INT NOT NULL DEFAULT 0,
  locked_until  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_branch ON users(branch_id);

-- ─────────────────────────────────────────────
-- REFRESH TOKENS
-- ─────────────────────────────────────────────

CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(255) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- ─────────────────────────────────────────────
-- CATEGORIES
-- ─────────────────────────────────────────────

CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- PRODUCTS
-- ─────────────────────────────────────────────

CREATE TABLE products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku         VARCHAR(100) UNIQUE NOT NULL,
  barcode     VARCHAR(100) UNIQUE,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  price       NUMERIC(12, 2) NOT NULL,
  cost        NUMERIC(12, 2),
  image_url   TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_active ON products(active);

-- ─────────────────────────────────────────────
-- PRODUCT VARIANTS
-- ─────────────────────────────────────────────

CREATE TABLE product_variants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label             VARCHAR(100) NOT NULL,
  value             VARCHAR(255) NOT NULL,
  price_adjustment  NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_variants_product ON product_variants(product_id);

-- ─────────────────────────────────────────────
-- INVENTORY
-- ─────────────────────────────────────────────

CREATE TABLE inventory (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id    UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  branch_id     UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  stock         INT NOT NULL DEFAULT 0,
  reorder_point INT NOT NULL DEFAULT 5,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_inventory_unique ON inventory(product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::UUID), branch_id);
CREATE INDEX idx_inventory_product ON inventory(product_id);
CREATE INDEX idx_inventory_branch ON inventory(branch_id);
CREATE INDEX idx_inventory_low_stock ON inventory(stock, reorder_point);

-- ─────────────────────────────────────────────
-- TRANSACTIONS
-- ─────────────────────────────────────────────

CREATE TABLE transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_no  VARCHAR(50) UNIQUE NOT NULL,
  cashier_id  UUID NOT NULL REFERENCES users(id),
  branch_id   UUID NOT NULL REFERENCES branches(id),
  subtotal    NUMERIC(12, 2) NOT NULL,
  discount    NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total       NUMERIC(12, 2) NOT NULL,
  status      transaction_status NOT NULL DEFAULT 'completed',
  sync_status sync_status NOT NULL DEFAULT 'synced',
  hash        VARCHAR(64),
  void_reason TEXT,
  voided_by   UUID REFERENCES users(id),
  voided_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_cashier ON transactions(cashier_id);
CREATE INDEX idx_transactions_branch ON transactions(branch_id);
CREATE INDEX idx_transactions_date ON transactions(created_at);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_receipt ON transactions(receipt_no);

-- ─────────────────────────────────────────────
-- TRANSACTION ITEMS
-- ─────────────────────────────────────────────

CREATE TABLE transaction_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  product_id      UUID NOT NULL REFERENCES products(id),
  variant_id      UUID REFERENCES product_variants(id),
  product_name    VARCHAR(255) NOT NULL,
  product_sku     VARCHAR(100) NOT NULL,
  quantity        INT NOT NULL CHECK (quantity > 0),
  unit_price      NUMERIC(12, 2) NOT NULL,
  discount        NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total           NUMERIC(12, 2) NOT NULL,
  note            TEXT
);

CREATE INDEX idx_items_transaction ON transaction_items(transaction_id);
CREATE INDEX idx_items_product ON transaction_items(product_id);

-- ─────────────────────────────────────────────
-- PAYMENTS
-- ─────────────────────────────────────────────

CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  method          payment_method NOT NULL,
  amount          NUMERIC(12, 2) NOT NULL,
  reference       VARCHAR(255)
);

CREATE INDEX idx_payments_transaction ON payments(transaction_id);

-- ─────────────────────────────────────────────
-- STOCK ADJUSTMENTS
-- ─────────────────────────────────────────────

CREATE TABLE stock_adjustments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(id),
  variant_id  UUID REFERENCES product_variants(id),
  branch_id   UUID NOT NULL REFERENCES branches(id),
  type        adjustment_type NOT NULL,
  quantity    INT NOT NULL,
  reason      TEXT,
  user_id     UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_adjustments_product ON stock_adjustments(product_id);
CREATE INDEX idx_adjustments_branch ON stock_adjustments(branch_id);
CREATE INDEX idx_adjustments_date ON stock_adjustments(created_at);

-- ─────────────────────────────────────────────
-- VOUCHERS
-- ─────────────────────────────────────────────

CREATE TABLE vouchers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            VARCHAR(50) UNIQUE NOT NULL,
  discount_type   discount_type NOT NULL DEFAULT 'percentage',
  discount_value  NUMERIC(12, 2) NOT NULL,
  min_order       NUMERIC(12, 2) NOT NULL DEFAULT 0,
  max_uses        INT,
  uses_count      INT NOT NULL DEFAULT 0,
  expiry          TIMESTAMPTZ,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vouchers_code ON vouchers(code);
CREATE INDEX idx_vouchers_active ON vouchers(active);

-- ─────────────────────────────────────────────
-- VOUCHER USES
-- ─────────────────────────────────────────────

CREATE TABLE voucher_uses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id      UUID NOT NULL REFERENCES vouchers(id),
  transaction_id  UUID NOT NULL REFERENCES transactions(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  used_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────
-- AUDIT LOG (append-only)
-- ─────────────────────────────────────────────

CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action      VARCHAR(255) NOT NULL,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  user_name   VARCHAR(255),
  user_role   VARCHAR(50),
  details     JSONB,
  ip          VARCHAR(50),
  severity    audit_severity NOT NULL DEFAULT 'low',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_date ON audit_log(created_at);
CREATE INDEX idx_audit_severity ON audit_log(severity);

-- Prevent updates/deletes on audit_log (immutable)
CREATE RULE audit_no_update AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
CREATE RULE audit_no_delete AS ON DELETE TO audit_log DO INSTEAD NOTHING;

-- ─────────────────────────────────────────────
-- UPDATED_AT trigger function
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_branches_updated_at   BEFORE UPDATE ON branches   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_users_updated_at      BEFORE UPDATE ON users      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_products_updated_at   BEFORE UPDATE ON products   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_inventory_updated_at  BEFORE UPDATE ON inventory  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_vouchers_updated_at   BEFORE UPDATE ON vouchers   FOR EACH ROW EXECUTE FUNCTION update_updated_at();
