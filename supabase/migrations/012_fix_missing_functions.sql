-- ─────────────────────────────────────────────────────────────────────────────
-- 012_fix_missing_functions.sql
--
-- Fixes three production issues:
--   1. void_transaction RPC — was in migration 008 but not applied
--   2. returns table missing columns (void_reason, voided_at on transactions;
--      notes on returns for mobile compatibility)
--   3. transactions table missing void_reason / voided_at columns
--
-- Safe to re-run — uses IF NOT EXISTS / OR REPLACE throughout.
-- Run in Supabase Dashboard → SQL Editor → New query → Run
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Add missing columns to transactions table ────────────────────────────
-- void_transaction RPC updates these — they must exist first.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS void_reason TEXT,
  ADD COLUMN IF NOT EXISTS voided_at   TIMESTAMPTZ;

-- ─── 2. Add notes column to returns table ────────────────────────────────────
-- Mobile app uses 'notes' field when inserting returns.

ALTER TABLE returns
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- ─── 3. Helper functions (safe to re-run) ────────────────────────────────────
-- These are needed by void_transaction. If migration 008 was already applied,
-- these OR REPLACE calls are safe no-ops.

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM staff
  WHERE auth_id = auth.uid() AND status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_my_branch()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT branch_id FROM staff
  WHERE auth_id = auth.uid() AND status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION has_role(allowed_roles TEXT[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT get_my_role() = ANY(allowed_roles);
$$;

-- ─── 4. void_transaction RPC ─────────────────────────────────────────────────
-- Called by: apiVoidTransaction(id, reason) in web and mobile api.ts
-- Requires: manager or admin role (enforced in PostgreSQL)
-- Atomically: validates → voids → restores stock → writes audit log

CREATE OR REPLACE FUNCTION void_transaction(
  p_transaction_id UUID,
  p_reason         TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_staff_id UUID;
  v_tx       RECORD;
BEGIN
  -- 1. Require manager or admin role
  IF NOT has_role(ARRAY['admin', 'manager']) THEN
    RAISE EXCEPTION 'FORBIDDEN: only managers and admins can void transactions';
  END IF;

  -- 2. Reason must be meaningful
  IF length(trim(COALESCE(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'INVALID: void reason must be at least 5 characters';
  END IF;

  -- 3. Load and validate transaction
  SELECT id, status, branch_id INTO v_tx
  FROM transactions WHERE id = p_transaction_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: transaction %', p_transaction_id;
  END IF;

  -- 4. Enforce branch isolation (admin can override)
  IF NOT has_role(ARRAY['admin']) AND v_tx.branch_id IS DISTINCT FROM get_my_branch() THEN
    RAISE EXCEPTION 'FORBIDDEN: transaction belongs to a different branch';
  END IF;

  IF v_tx.status != 'completed' THEN
    RAISE EXCEPTION 'INVALID: only completed transactions can be voided (current status: %)', v_tx.status;
  END IF;

  -- 5. Void the transaction
  UPDATE transactions
  SET status      = 'voided',
      void_reason = p_reason,
      voided_at   = NOW()
  WHERE id = p_transaction_id;

  -- 6. Restore stock for each item atomically
  UPDATE stock_levels sl
  SET    stock = sl.stock + ti.quantity
  FROM   transaction_items ti
  WHERE  ti.transaction_id = p_transaction_id
    AND  sl.product_id     = ti.product_id
    AND  sl.branch_id      = v_tx.branch_id;

  -- 7. Write audit entry
  SELECT id INTO v_staff_id FROM staff WHERE auth_id = auth.uid() LIMIT 1;

  INSERT INTO audit_log (branch_id, staff_id, action, details, severity)
  VALUES (
    v_tx.branch_id,
    v_staff_id,
    'TRANSACTION_VOIDED',
    'TX: ' || p_transaction_id || ' | Reason: ' || p_reason,
    'warning'
  );
END;
$$;

REVOKE ALL ON FUNCTION void_transaction FROM PUBLIC;
GRANT EXECUTE ON FUNCTION void_transaction TO authenticated;

-- ─── 5. Reload PostgREST schema cache ────────────────────────────────────────
-- Forces PostgREST to pick up the new function and column definitions immediately.
-- Without this you'd have to wait up to 60 seconds for auto-reload.
NOTIFY pgrst, 'reload schema';

-- ─── DONE ─────────────────────────────────────────────────────────────────────
-- What this migration fixes:
--   ✅ transactions.void_reason + voided_at columns added
--   ✅ returns.notes column added
--   ✅ get_my_role() / get_my_branch() / has_role() helper functions
--   ✅ void_transaction(p_transaction_id, p_reason) RPC — manager/admin only
--   ✅ PostgREST schema cache reloaded
