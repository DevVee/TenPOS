-- ─────────────────────────────────────────────────────────────────────────────
-- 006_override_pin.sql
-- Adds manager override PIN for cashier-initiated voids.
--
-- Run this in Supabase SQL Editor (Project → SQL Editor → New query).
-- ─────────────────────────────────────────────────────────────────────────────

-- pgcrypto is needed for bcrypt hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add the hashed PIN column to staff
ALTER TABLE staff ADD COLUMN IF NOT EXISTS override_pin_hash TEXT;

-- ─── RPC: Manager sets their own override PIN ────────────────────────────────
CREATE OR REPLACE FUNCTION set_override_pin(p_pin TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only managers and admins can set an override PIN
  IF get_my_role() NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'FORBIDDEN: only managers and admins can set an override PIN';
  END IF;

  -- PIN must be 4–8 digits
  IF p_pin !~ '^\d{4,8}$' THEN
    RAISE EXCEPTION 'INVALID: PIN must be 4 to 8 digits';
  END IF;

  -- Store bcrypt hash (never plain text)
  UPDATE staff
  SET override_pin_hash = crypt(p_pin, gen_salt('bf', 10))
  WHERE auth_id = auth.uid();
END;
$$;

-- ─── RPC: Manager clears their override PIN ──────────────────────────────────
CREATE OR REPLACE FUNCTION clear_override_pin()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF get_my_role() NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  UPDATE staff SET override_pin_hash = NULL WHERE auth_id = auth.uid();
END;
$$;

-- ─── RPC: Void a transaction using a manager override PIN ────────────────────
-- Called by cashiers. The PIN is compared against all active managers.
-- If a match is found, the void is authorized and fully audited.
CREATE OR REPLACE FUNCTION void_with_pin(
  p_transaction_id UUID,
  p_reason         TEXT,
  p_pin            TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cashier_id UUID;
  v_manager    RECORD;
  v_tx         RECORD;
BEGIN
  -- 1. Verify caller is an active staff member
  SELECT id INTO v_cashier_id
  FROM staff
  WHERE auth_id = auth.uid() AND status = 'active';

  IF v_cashier_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  -- 2. Validate inputs
  IF length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'INVALID: reason is too short';
  END IF;

  IF p_pin !~ '^\d{4,8}$' THEN
    RAISE EXCEPTION 'INVALID_PIN: PIN must be 4 to 8 digits';
  END IF;

  -- 3. Find an active manager whose PIN matches
  SELECT id, name INTO v_manager
  FROM staff
  WHERE status = 'active'
    AND role IN ('manager', 'admin')
    AND override_pin_hash IS NOT NULL
    AND override_pin_hash = crypt(p_pin, override_pin_hash)
  LIMIT 1;

  IF v_manager.id IS NULL THEN
    RAISE EXCEPTION 'INVALID_PIN: incorrect PIN';
  END IF;

  -- 4. Validate the transaction
  SELECT * INTO v_tx FROM transactions WHERE id = p_transaction_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: transaction does not exist';
  END IF;

  IF v_tx.status != 'completed' THEN
    RAISE EXCEPTION 'INVALID: only completed transactions can be voided';
  END IF;

  -- 5. Void the transaction
  UPDATE transactions
  SET
    status      = 'voided',
    void_reason = p_reason,
    voided_at   = NOW()
  WHERE id = p_transaction_id;

  -- 6. Restore stock levels
  UPDATE stock_levels sl
  SET stock = sl.stock + ti.quantity
  FROM transaction_items ti
  WHERE ti.transaction_id = p_transaction_id
    AND sl.product_id = ti.product_id
    AND sl.branch_id  = v_tx.branch_id;

  -- 7. Audit log — records both the cashier who performed it
  --    and the manager who authorized via PIN
  INSERT INTO audit_log (branch_id, staff_id, action, details, severity)
  VALUES (
    v_tx.branch_id,
    v_cashier_id,
    'TRANSACTION_VOIDED_PIN_OVERRIDE',
    format(
      'Receipt: %s | Authorized by: %s (PIN) | Reason: %s',
      v_tx.receipt_no,
      v_manager.name,
      p_reason
    ),
    'warning'
  );
END;
$$;
