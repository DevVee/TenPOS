-- ============================================================
-- TenPOS — Migration 013: Production Security & Reliability Fixes
--
-- Run in Supabase → SQL Editor → New query → Run
-- All statements are idempotent — safe to re-run.
-- ============================================================

-- Required extension (already enabled by migration 006)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. DEVICE PIN: add bcrypt-hashed device_pin_hash column to staff
--    Used by verify_staff_pin RPC for web PinLock re-auth.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE staff ADD COLUMN IF NOT EXISTS device_pin_hash TEXT;

-- ─── RPC: verify_staff_pin ────────────────────────────────────────────────────
-- Called by the web POS lock screen.  Returns TRUE when the PIN matches
-- the staff member's stored bcrypt hash, or TRUE if no PIN is set yet
-- (first-use pass-through — caller should prompt to set a PIN).
CREATE OR REPLACE FUNCTION verify_staff_pin(p_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hash TEXT;
BEGIN
  IF p_pin !~ '^\d{4,8}$' THEN
    RETURN FALSE;
  END IF;

  SELECT device_pin_hash INTO v_hash
  FROM   staff
  WHERE  auth_id = auth.uid() AND status = 'active'
  LIMIT  1;

  -- No PIN set yet → allow through (caller must prompt setup)
  IF v_hash IS NULL THEN
    RETURN TRUE;
  END IF;

  RETURN v_hash = crypt(p_pin, v_hash);
END;
$$;

REVOKE ALL ON FUNCTION verify_staff_pin FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION verify_staff_pin TO authenticated;

-- ─── RPC: set_device_pin ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_device_pin(p_pin TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_pin !~ '^\d{4,8}$' THEN
    RAISE EXCEPTION 'INVALID: PIN must be 4 to 8 digits';
  END IF;

  UPDATE staff
  SET    device_pin_hash = crypt(p_pin, gen_salt('bf', 10))
  WHERE  auth_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION set_device_pin FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION set_device_pin TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. FIX stock_write RLS: cashiers must NOT directly write stock_levels.
--    The create_transaction / void_transaction RPCs use SECURITY DEFINER and
--    bypass RLS — they are the only write paths for cashier-initiated changes.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "stock_write" ON stock_levels;

CREATE POLICY "stock_write" ON stock_levels
  FOR ALL
  USING (
    auth_role() IN ('admin', 'manager')
    AND (branch_id = auth_branch_id() OR auth_role() = 'admin')
  )
  WITH CHECK (
    auth_role() IN ('admin', 'manager')
    AND (branch_id = auth_branch_id() OR auth_role() = 'admin')
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. IDEMPOTENCY KEY on transactions
--    Prevents duplicate submissions when the mobile app retries an offline txn.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Partial unique index: only enforces uniqueness on non-NULL keys
CREATE UNIQUE INDEX IF NOT EXISTS transactions_idempotency_key_idx
  ON transactions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RECEIPT COUNTERS: collision-free, atomic receipt number generation.
--    Replaces the COUNT(*)+1 approach which has a race condition under load.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS receipt_counters (
  txn_date     DATE    PRIMARY KEY DEFAULT CURRENT_DATE,
  last_counter INTEGER NOT NULL     DEFAULT 0
);

ALTER TABLE receipt_counters ENABLE ROW LEVEL SECURITY;

-- Only allow reads for authenticated staff (writes happen via SECURITY DEFINER)
DROP POLICY IF EXISTS "receipt_counters_select" ON receipt_counters;
CREATE POLICY "receipt_counters_select" ON receipt_counters
  FOR SELECT USING (auth_role() IN ('admin', 'manager', 'cashier'));


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. UPDATED create_transaction RPC
--    Changes vs migration 011:
--      • Uses receipt_counters for race-condition-free numbering
--      • Accepts optional p_idempotency_key — returns existing result on retry
--      • tax explicitly = 0 (VAT removed)
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the old 5-parameter overload from migration 011 so there is no ambiguity
-- between that signature and the new 6-parameter version below.
DROP FUNCTION IF EXISTS create_transaction(UUID, JSONB, JSONB, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION create_transaction(
  p_branch_id       UUID,
  p_items           JSONB,    -- [{product_id, variant_id?, quantity, discount?, note?}]
  p_payments        JSONB,    -- [{method, amount, reference?}]
  p_discount        NUMERIC   DEFAULT 0,
  p_voucher_code    TEXT      DEFAULT NULL,
  p_idempotency_key TEXT      DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staff_id      UUID;
  v_staff_branch  UUID;
  v_subtotal      NUMERIC := 0;
  v_total         NUMERIC := 0;
  v_total_paid    NUMERIC := 0;
  v_tx_id         UUID;
  v_receipt_no    TEXT;
  v_item          JSONB;
  v_product       RECORD;
  v_price         NUMERIC;
  v_qty           INT;
  v_item_discount NUMERIC;
  v_counter       INTEGER;
  v_existing_id   UUID;
  v_existing_rec  TEXT;
  v_existing_tot  NUMERIC;
BEGIN
  -- 0. Idempotency: return existing result if we have seen this key before
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id, receipt_no, total
    INTO   v_existing_id, v_existing_rec, v_existing_tot
    FROM   transactions
    WHERE  idempotency_key = p_idempotency_key
    LIMIT  1;

    IF v_existing_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'id',         v_existing_id,
        'receipt_no', v_existing_rec,
        'total',      v_existing_tot
      );
    END IF;
  END IF;

  -- 1. Verify active staff
  SELECT id, branch_id INTO v_staff_id, v_staff_branch
  FROM   staff
  WHERE  auth_id = auth.uid() AND status = 'active'
  LIMIT  1;

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: no active staff session';
  END IF;

  -- 2. Enforce branch
  IF v_staff_branch IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'FORBIDDEN: branch mismatch (staff: %, requested: %)',
      v_staff_branch, p_branch_id;
  END IF;

  -- 3. Cart not empty
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'INVALID: cart is empty';
  END IF;

  -- 4. Validate items (DB price, active, stock)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty           := COALESCE((v_item->>'quantity')::INT, 0);
    v_item_discount := COALESCE((v_item->>'discount')::NUMERIC, 0);

    IF v_qty <= 0 OR v_qty > 9999 THEN
      RAISE EXCEPTION 'INVALID: quantity out of range for product %', v_item->>'product_id';
    END IF;
    IF v_item_discount < 0 THEN
      RAISE EXCEPTION 'INVALID: negative item discount';
    END IF;

    SELECT price, active INTO v_product
    FROM   products
    WHERE  id = (v_item->>'product_id')::UUID;

    IF NOT FOUND    THEN RAISE EXCEPTION 'INVALID: product % not found',    v_item->>'product_id'; END IF;
    IF NOT v_product.active THEN RAISE EXCEPTION 'INVALID: product % is inactive', v_item->>'product_id'; END IF;

    v_price := v_product.price;  -- DB price; frontend price is ignored

    PERFORM 1 FROM stock_levels
    WHERE product_id = (v_item->>'product_id')::UUID
      AND branch_id  = p_branch_id
      AND stock      >= v_qty;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK: product %', v_item->>'product_id';
    END IF;

    v_subtotal := v_subtotal + (v_price * v_qty) - v_item_discount;
  END LOOP;

  -- 5. Order-level discount
  IF p_discount < 0 OR p_discount > v_subtotal THEN
    RAISE EXCEPTION 'INVALID: order discount out of range (discount=%, subtotal=%)',
      p_discount, v_subtotal;
  END IF;

  -- 6. Voucher validation
  IF p_voucher_code IS NOT NULL THEN
    PERFORM 1 FROM vouchers
    WHERE  upper(code)    = upper(p_voucher_code)
      AND  active         = true
      AND  (expires_at IS NULL OR expires_at > NOW())
      AND  (max_uses   IS NULL OR used_count < max_uses)
      AND  min_purchase   <= v_subtotal;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID_VOUCHER: %', p_voucher_code;
    END IF;
  END IF;

  -- 7. Payment total
  SELECT COALESCE(SUM((p->>'amount')::NUMERIC), 0) INTO v_total_paid
  FROM   jsonb_array_elements(p_payments) AS p;

  v_total := GREATEST(ROUND(v_subtotal - p_discount, 2), 0);

  IF v_total_paid < v_total THEN
    RAISE EXCEPTION 'UNDERPAID: tendered=% required=%', v_total_paid, v_total;
  END IF;

  -- 8. Atomic receipt counter (INSERT ... ON CONFLICT ... RETURNING eliminates races)
  INSERT INTO receipt_counters (txn_date, last_counter)
  VALUES (CURRENT_DATE, 1)
  ON CONFLICT (txn_date) DO UPDATE
    SET last_counter = receipt_counters.last_counter + 1
  RETURNING last_counter INTO v_counter;

  v_receipt_no := 'TEN-'
    || TO_CHAR(NOW() AT TIME ZONE 'Asia/Manila', 'YYYYMMDD')
    || '-' || LPAD(v_counter::TEXT, 4, '0');

  -- 9. Insert transaction (tax = 0 — VAT removed)
  INSERT INTO transactions (
    branch_id, staff_id, receipt_no,
    subtotal, discount, tax, total,
    amount_tendered, change_given,
    payment_method, voucher_code, status,
    idempotency_key
  ) VALUES (
    p_branch_id, v_staff_id, v_receipt_no,
    v_subtotal, p_discount, 0, v_total,
    v_total_paid, GREATEST(v_total_paid - v_total, 0),
    (p_payments->0->>'method'), p_voucher_code, 'completed',
    p_idempotency_key
  )
  RETURNING id INTO v_tx_id;

  -- 10. Line items + stock deduction
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty           := (v_item->>'quantity')::INT;
    v_item_discount := COALESCE((v_item->>'discount')::NUMERIC, 0);

    SELECT price INTO v_price
    FROM   products
    WHERE  id = (v_item->>'product_id')::UUID;

    INSERT INTO transaction_items (
      transaction_id, product_id, variant_id,
      product_name, sku,
      unit_price, quantity, discount, subtotal,
      note
    )
    SELECT
      v_tx_id,
      (v_item->>'product_id')::UUID,
      NULLIF(v_item->>'variant_id', '')::UUID,
      p.name, p.sku,
      v_price, v_qty, v_item_discount,
      v_price * v_qty - v_item_discount,
      NULLIF(v_item->>'note', '')
    FROM products p
    WHERE p.id = (v_item->>'product_id')::UUID;

    -- Atomic stock decrement
    UPDATE stock_levels
    SET    stock = stock - v_qty
    WHERE  product_id = (v_item->>'product_id')::UUID
      AND  branch_id  = p_branch_id;
  END LOOP;

  -- 11. Payment rows
  INSERT INTO transaction_payments (transaction_id, method, amount, reference)
  SELECT v_tx_id, p->>'method', (p->>'amount')::NUMERIC, NULLIF(p->>'reference', '')
  FROM   jsonb_array_elements(p_payments) AS p;

  -- 12. Increment voucher usage
  IF p_voucher_code IS NOT NULL THEN
    UPDATE vouchers
    SET    used_count = used_count + 1
    WHERE  upper(code) = upper(p_voucher_code);
  END IF;

  -- 13. Audit
  INSERT INTO audit_log (branch_id, staff_id, action, details, severity)
  VALUES (p_branch_id, v_staff_id,
    'TRANSACTION_CREATED',
    'Receipt: ' || v_receipt_no || ' · Total: ₱' || v_total,
    'info');

  RETURN jsonb_build_object(
    'id',         v_tx_id,
    'receipt_no', v_receipt_no,
    'total',      v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION create_transaction(UUID, JSONB, JSONB, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION create_transaction(UUID, JSONB, JSONB, NUMERIC, TEXT, TEXT) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. process_return RPC — atomic, manager-only return processing
--    Replaces the non-atomic multi-step approach in api.ts.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION process_return(
  p_transaction_id  UUID,
  p_items           JSONB,   -- [{item_id UUID, quantity INT}]
  p_reason          TEXT     DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staff_id   UUID;
  v_tx         RECORD;
  v_item       JSONB;
  v_tx_item    RECORD;
  v_ret_id     UUID;
  v_refund     NUMERIC := 0;
  v_qty        INT;
  v_item_amt   NUMERIC;
BEGIN
  -- 1. Only managers / admins
  SELECT id INTO v_staff_id
  FROM   staff
  WHERE  auth_id = auth.uid()
    AND  status  = 'active'
    AND  role    IN ('admin', 'manager');

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: only managers and admins can process returns';
  END IF;

  -- 2. Load transaction
  SELECT * INTO v_tx FROM transactions WHERE id = p_transaction_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: transaction does not exist';
  END IF;
  IF v_tx.status != 'completed' THEN
    RAISE EXCEPTION 'INVALID: only completed transactions can be returned (status=%)', v_tx.status;
  END IF;

  -- 3. Validate items + compute refund
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'INVALID: no items specified for return';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := COALESCE((v_item->>'quantity')::INT, 0);
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'INVALID: return quantity must be positive for item %', v_item->>'item_id';
    END IF;

    SELECT * INTO v_tx_item
    FROM   transaction_items
    WHERE  id = (v_item->>'item_id')::UUID
      AND  transaction_id = p_transaction_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID: item % not in transaction', v_item->>'item_id';
    END IF;
    IF v_qty > v_tx_item.quantity THEN
      RAISE EXCEPTION 'INVALID: return qty % exceeds original qty % for item %',
        v_qty, v_tx_item.quantity, v_item->>'item_id';
    END IF;

    v_refund := v_refund + (v_tx_item.unit_price * v_qty);
  END LOOP;

  -- 4. Create return header
  INSERT INTO returns (transaction_id, staff_id, branch_id, reason, total_refund)
  VALUES (p_transaction_id, v_staff_id, v_tx.branch_id, NULLIF(trim(p_reason), ''), v_refund)
  RETURNING id INTO v_ret_id;

  -- 5. Insert return items + atomically restore stock
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty := (v_item->>'quantity')::INT;

    SELECT * INTO v_tx_item
    FROM   transaction_items
    WHERE  id = (v_item->>'item_id')::UUID;

    v_item_amt := v_tx_item.unit_price * v_qty;

    INSERT INTO return_items (return_id, transaction_item_id, product_name, quantity, refund_amount)
    VALUES (v_ret_id, (v_item->>'item_id')::UUID, v_tx_item.product_name, v_qty, v_item_amt);

    -- Restore stock atomically (no read-modify-write)
    IF v_tx_item.product_id IS NOT NULL THEN
      UPDATE stock_levels
      SET    stock = stock + v_qty
      WHERE  product_id = v_tx_item.product_id
        AND  branch_id  = v_tx.branch_id;
    END IF;
  END LOOP;

  -- 6. Mark transaction refunded
  UPDATE transactions SET status = 'refunded' WHERE id = p_transaction_id;

  -- 7. Audit
  INSERT INTO audit_log (branch_id, staff_id, action, details, severity)
  VALUES (
    v_tx.branch_id, v_staff_id,
    'TRANSACTION_RETURNED',
    format('Return on %s · Refund: ₱%s · Reason: %s',
      v_tx.receipt_no, v_refund, COALESCE(NULLIF(trim(p_reason),''), 'N/A')),
    'warning'
  );

  RETURN jsonb_build_object('return_id', v_ret_id, 'refund_amount', v_refund);
END;
$$;

REVOKE ALL ON FUNCTION process_return FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION process_return TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. apply_stock_adjustment RPC — atomic stock adjustment
--    Replaces the read-then-write race condition in api.ts apiCreateAdjustment.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION apply_stock_adjustment(
  p_product_id  UUID,
  p_branch_id   UUID,
  p_type        TEXT,     -- 'in' | 'out' | 'correction' | 'damage' | 'return'
  p_quantity    NUMERIC,
  p_reason      TEXT      DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_staff_id UUID;
  v_adj_id   UUID;
  v_name     TEXT;
BEGIN
  -- Only managers / admins may adjust stock directly
  SELECT id INTO v_staff_id
  FROM   staff
  WHERE  auth_id = auth.uid()
    AND  status  = 'active'
    AND  role    IN ('admin', 'manager');

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: only managers and admins can adjust stock';
  END IF;

  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'INVALID: adjustment quantity must be positive';
  END IF;

  IF p_type NOT IN ('in','out','correction','damage','return') THEN
    RAISE EXCEPTION 'INVALID: unknown adjustment type %', p_type;
  END IF;

  -- Insert adjustment record
  INSERT INTO stock_adjustments (product_id, branch_id, staff_id, type, quantity, reason)
  VALUES (p_product_id, p_branch_id, v_staff_id, p_type, p_quantity, p_reason)
  RETURNING id INTO v_adj_id;

  -- Atomic stock update — no read-modify-write race
  CASE p_type
    WHEN 'in', 'return' THEN
      UPDATE stock_levels SET stock = stock + p_quantity
      WHERE  product_id = p_product_id AND branch_id = p_branch_id;
    WHEN 'out', 'damage' THEN
      UPDATE stock_levels SET stock = GREATEST(stock - p_quantity, 0)
      WHERE  product_id = p_product_id AND branch_id = p_branch_id;
    WHEN 'correction' THEN
      UPDATE stock_levels SET stock = p_quantity
      WHERE  product_id = p_product_id AND branch_id = p_branch_id;
  END CASE;

  SELECT name INTO v_name FROM products WHERE id = p_product_id;

  INSERT INTO audit_log (branch_id, staff_id, action, details, severity)
  VALUES (p_branch_id, v_staff_id, 'STOCK_ADJUSTMENT',
    format('%s %s × %s: %s', upper(p_type), p_quantity, COALESCE(v_name, p_product_id::TEXT), p_reason),
    'info');

  RETURN jsonb_build_object('adjustment_id', v_adj_id);
END;
$$;

REVOKE ALL ON FUNCTION apply_stock_adjustment FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION apply_stock_adjustment TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. FIX void_with_pin: add branch isolation
--    BEFORE: any manager from any branch could authorize voids.
--    AFTER:  manager must be from the same branch as the transaction.
--            Admin role can authorize across branches.
-- ─────────────────────────────────────────────────────────────────────────────

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
  v_cashier_id     UUID;
  v_cashier_branch UUID;
  v_manager        RECORD;
  v_tx             RECORD;
BEGIN
  -- 1. Verify caller is active staff
  SELECT id, branch_id INTO v_cashier_id, v_cashier_branch
  FROM   staff
  WHERE  auth_id = auth.uid() AND status = 'active';

  IF v_cashier_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  -- 2. Input validation
  IF length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'INVALID: reason is too short';
  END IF;
  IF p_pin !~ '^\d{4,8}$' THEN
    RAISE EXCEPTION 'INVALID_PIN: PIN must be 4 to 8 digits';
  END IF;

  -- 3. Find a manager whose PIN matches AND who is from the same branch
  --    (admins can authorize across any branch)
  SELECT id, name INTO v_manager
  FROM   staff
  WHERE  status = 'active'
    AND  role   IN ('manager', 'admin')
    AND  (branch_id = v_cashier_branch OR role = 'admin')
    AND  override_pin_hash IS NOT NULL
    AND  override_pin_hash = crypt(p_pin, override_pin_hash)
  LIMIT 1;

  IF v_manager.id IS NULL THEN
    RAISE EXCEPTION 'INVALID_PIN: incorrect PIN';
  END IF;

  -- 4. Validate transaction
  SELECT * INTO v_tx FROM transactions WHERE id = p_transaction_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: transaction does not exist';
  END IF;

  -- Transaction must belong to cashier's branch
  IF v_tx.branch_id IS DISTINCT FROM v_cashier_branch THEN
    RAISE EXCEPTION 'FORBIDDEN: transaction does not belong to your branch';
  END IF;

  IF v_tx.status != 'completed' THEN
    RAISE EXCEPTION 'INVALID: only completed transactions can be voided';
  END IF;

  -- 5. Void
  UPDATE transactions
  SET    status      = 'voided',
         void_reason = p_reason,
         voided_at   = NOW()
  WHERE  id = p_transaction_id;

  -- 6. Restore stock atomically
  UPDATE stock_levels sl
  SET    stock = sl.stock + ti.quantity
  FROM   transaction_items ti
  WHERE  ti.transaction_id = p_transaction_id
    AND  sl.product_id     = ti.product_id
    AND  sl.branch_id      = v_tx.branch_id;

  -- 7. Audit (records both the cashier and the authorizing manager)
  INSERT INTO audit_log (branch_id, staff_id, action, details, severity)
  VALUES (
    v_tx.branch_id, v_cashier_id,
    'TRANSACTION_VOIDED_PIN_OVERRIDE',
    format('Receipt: %s | Authorized by: %s (PIN) | Reason: %s',
      v_tx.receipt_no, v_manager.name, p_reason),
    'warning'
  );
END;
$$;

-- Re-grant (idempotent)
REVOKE ALL ON FUNCTION void_with_pin FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION void_with_pin TO authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. PREVENT ROLE ESCALATION trigger
--    Managers cannot promote anyone to admin.
--    Staff cannot change their own role.
--    Cashiers / viewers cannot change any role.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION prevent_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_actor_role TEXT;
BEGIN
  SELECT role INTO v_actor_role
  FROM   staff
  WHERE  auth_id = auth.uid()
  LIMIT  1;

  -- Managers cannot grant admin
  IF v_actor_role = 'manager' AND NEW.role = 'admin' THEN
    RAISE EXCEPTION 'FORBIDDEN: managers cannot assign admin role';
  END IF;

  -- Cashiers/viewers cannot change any role
  IF v_actor_role IN ('cashier', 'viewer') AND NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'FORBIDDEN: insufficient privileges to change staff roles';
  END IF;

  -- Nobody can change their own role (except admins operating on others)
  IF NEW.auth_id = auth.uid()
    AND NEW.role IS DISTINCT FROM OLD.role
    AND v_actor_role != 'admin'
  THEN
    RAISE EXCEPTION 'FORBIDDEN: cannot change your own role';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS staff_role_escalation_check ON staff;
CREATE TRIGGER staff_role_escalation_check
  BEFORE UPDATE ON staff
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role)
  EXECUTE FUNCTION prevent_role_escalation();


-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Ensure TAX = 0 on existing transactions (clean historical data if needed)
--     This is a one-time cleanup — harmless to run multiple times.
-- ─────────────────────────────────────────────────────────────────────────────

-- If any transactions were created with tax > 0, zero them out
-- and recalculate total as subtotal - discount
UPDATE transactions
SET    tax   = 0,
       total = GREATEST(subtotal - discount, 0)
WHERE  tax != 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- Done. Verify with:
--   SELECT routine_name FROM information_schema.routines
--   WHERE routine_schema = 'public'
--     AND routine_name IN (
--       'verify_staff_pin','set_device_pin',
--       'create_transaction','process_return',
--       'apply_stock_adjustment','void_with_pin',
--       'prevent_role_escalation'
--     );
-- ─────────────────────────────────────────────────────────────────────────────
