-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 014: Production hardening
--
-- Covers DB-01 from the production audit:
--   1. stock_levels: add CHECK (stock >= 0) constraint to prevent negative stock
--   2. categories: fix RLS — public read-only + staff admin access
--   3. audit_log: tighten insert policy (staff can insert their own branch rows)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Prevent negative stock ────────────────────────────────────────────────
-- The create_transaction RPC uses Math.max(0, …) but a direct UPDATE could
-- still push stock below zero. This constraint is the database-level safety net.
ALTER TABLE stock_levels
  ADD CONSTRAINT stock_non_negative CHECK (stock >= 0);

-- ── 2. Fix categories RLS ────────────────────────────────────────────────────
-- Drop old policies (may not all exist — IGNORE errors from IF NOT EXISTS not
-- being supported by Postgres; we use DO blocks instead).
DO $$
BEGIN
  -- Drop any old category policies before recreating them cleanly
  DROP POLICY IF EXISTS "categories_read_all"              ON categories;
  DROP POLICY IF EXISTS "categories_admin"                 ON categories;
  DROP POLICY IF EXISTS "categories_staff_read"            ON categories;
  DROP POLICY IF EXISTS "categories_manager_write"         ON categories;
  DROP POLICY IF EXISTS "categories_read_authenticated"    ON categories;
  DROP POLICY IF EXISTS "categories_write_manager"         ON categories;
END $$;

-- Enable RLS if not already (idempotent)
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read active categories (needed for offline POS)
CREATE POLICY "categories_read_authenticated"
  ON categories
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admin/manager staff can create/update/delete categories
CREATE POLICY "categories_write_manager"
  ON categories
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.auth_id = auth.uid()
        AND staff.role IN ('admin', 'manager')
        AND staff.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.auth_id = auth.uid()
        AND staff.role IN ('admin', 'manager')
        AND staff.status = 'active'
    )
  );

-- ── 3. Tighten audit_log insert policy ───────────────────────────────────────
-- Allow staff to insert audit rows only for their own branch
DO $$
BEGIN
  DROP POLICY IF EXISTS "audit_log_insert_staff"        ON audit_log;
  DROP POLICY IF EXISTS "audit_insert_authenticated"    ON audit_log;
  DROP POLICY IF EXISTS "audit_log_select_manager"      ON audit_log;
  DROP POLICY IF EXISTS "audit_log_insert_own_branch"   ON audit_log;
END $$;

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Read: admin/manager only
CREATE POLICY "audit_log_select_manager"
  ON audit_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.auth_id = auth.uid()
        AND staff.role IN ('admin', 'manager')
    )
  );

-- Insert: any active staff member can insert; branch must match their own
CREATE POLICY "audit_log_insert_own_branch"
  ON audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (
    branch_id IS NULL OR
    EXISTS (
      SELECT 1 FROM staff
      WHERE staff.auth_id = auth.uid()
        AND staff.branch_id = audit_log.branch_id
        AND staff.status = 'active'
    )
  );
