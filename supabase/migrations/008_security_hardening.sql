-- ─────────────────────────────────────────────────────────────────────────────
-- 008_security_hardening.sql
-- Production security hardening for TenPOS.
--
-- Run in Supabase SQL Editor. Safe to re-run — uses IF NOT EXISTS / OR REPLACE.
-- Run AFTER 001–007.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. ALIAS HELPER FUNCTIONS ───────────────────────────────────────────────
-- Canonical names used across SECURITY.md and RPCs.
-- (002_rls.sql uses auth_role / auth_branch_id — these wrap them.)

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

-- ─── 2. DATABASE CONSTRAINTS ─────────────────────────────────────────────────

-- Stock can never go negative
DO $$ BEGIN
  ALTER TABLE stock_levels
    ADD CONSTRAINT stock_non_negative CHECK (stock >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Transaction totals must be sane
DO $$ BEGIN
  ALTER TABLE transactions
    ADD CONSTRAINT total_positive CHECK (total >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE transactions
    ADD CONSTRAINT discount_valid CHECK (discount >= 0 AND discount <= subtotal);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Receipt numbers must be unique (prevents double-submission bugs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_receipt_no
  ON transactions (receipt_no);

-- ─── 3. SELF-ROLE-ESCALATION TRIGGER ─────────────────────────────────────────
-- Prevents any user from upgrading their own role, even if they have write access.

CREATE OR REPLACE FUNCTION prevent_role_self_escalation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF OLD.auth_id = auth.uid() AND NEW.role != OLD.role THEN
    RAISE EXCEPTION 'FORBIDDEN: cannot change your own role';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_no_self_role_change ON staff;
CREATE TRIGGER enforce_no_self_role_change
  BEFORE UPDATE ON staff
  FOR EACH ROW EXECUTE FUNCTION prevent_role_self_escalation();

-- ─── 4. create_transaction RPC ───────────────────────────────────────────────
-- Replaces the multi-step frontend inserts in apiCreateTransaction.
-- Key security properties:
--   • Re-reads prices from DB — frontend price is ignored
--   • Enforces branch match between staff and payload
--   • Checks stock before decrement; relies on stock_non_negative constraint as final guard
--   • Validates voucher server-side (active, not expired, not over-used, min-order met)
--   • Validates total payment >= total due
--   • Runs atomically inside a single transaction

CREATE OR REPLACE FUNCTION create_transaction(
  p_branch_id     UUID,
  p_items         JSONB,   -- [{product_id, variant_id?, quantity, discount?, note?}]
  p_payments      JSONB,   -- [{method, amount, reference?}]
  p_discount      NUMERIC  DEFAULT 0,
  p_voucher_code  TEXT     DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
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
BEGIN
  -- 1. Verify active staff exists
  SELECT id, branch_id INTO v_staff_id, v_staff_branch
  FROM staff
  WHERE auth_id = auth.uid() AND status = 'active'
  LIMIT 1;

  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: no active staff session';
  END IF;

  -- 2. Enforce branch match
  IF v_staff_branch IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'FORBIDDEN: branch mismatch (staff branch: %, requested: %)', v_staff_branch, p_branch_id;
  END IF;

  -- 3. Validate cart not empty
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'INVALID: cart is empty';
  END IF;

  -- 4. Validate each item: DB prices, active products, stock availability
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
    FROM products
    WHERE id = (v_item->>'product_id')::UUID;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID: product % not found', v_item->>'product_id';
    END IF;
    IF NOT v_product.active THEN
      RAISE EXCEPTION 'INVALID: product % is inactive', v_item->>'product_id';
    END IF;

    v_price := v_product.price;  -- ← DB price; frontend price is ignored

    -- Check stock
    PERFORM 1 FROM stock_levels
    WHERE product_id = (v_item->>'product_id')::UUID
      AND branch_id  = p_branch_id
      AND stock      >= v_qty;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK: product %', v_item->>'product_id';
    END IF;

    v_subtotal := v_subtotal + (v_price * v_qty) - v_item_discount;
  END LOOP;

  -- 5. Validate order-level discount
  IF p_discount < 0 OR p_discount > v_subtotal THEN
    RAISE EXCEPTION 'INVALID: order discount out of range (discount=%, subtotal=%)', p_discount, v_subtotal;
  END IF;

  -- 6. Validate voucher (if provided)
  IF p_voucher_code IS NOT NULL THEN
    -- NOTE: adjust column names if your schema uses different names
    -- (expiry vs expires_at, min_order vs min_purchase)
    PERFORM 1 FROM vouchers
    WHERE upper(code) = upper(p_voucher_code)
      AND active      = true
      AND (expiry IS NULL OR expiry > NOW())
      AND (max_uses IS NULL OR used_count < max_uses)
      AND min_order <= v_subtotal;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID_VOUCHER: %', p_voucher_code;
    END IF;
  END IF;

  -- 7. Validate payment total covers the order total
  SELECT COALESCE(SUM((p->>'amount')::NUMERIC), 0) INTO v_total_paid
  FROM jsonb_array_elements(p_payments) AS p;

  v_total := GREATEST(ROUND(v_subtotal - p_discount, 2), 0);

  IF v_total_paid < v_total THEN
    RAISE EXCEPTION 'UNDERPAID: tendered=% required=%', v_total_paid, v_total;
  END IF;

  -- 8. Generate unique receipt number
  v_receipt_no := 'TEN-' || TO_CHAR(NOW() AT TIME ZONE 'Asia/Manila', 'YYYYMMDD') || '-'
    || LPAD(
        (SELECT COUNT(*) + 1 FROM transactions
         WHERE DATE(created_at AT TIME ZONE 'Asia/Manila') = CURRENT_DATE)::TEXT,
        4, '0'
       );

  -- 9. Insert transaction header
  INSERT INTO transactions (
    branch_id, staff_id, receipt_no,
    subtotal, discount, tax, total,
    amount_tendered, change_given,
    payment_method, voucher_code, status
  ) VALUES (
    p_branch_id, v_staff_id, v_receipt_no,
    v_subtotal, p_discount, 0, v_total,
    v_total_paid, GREATEST(v_total_paid - v_total, 0),
    (p_payments->0->>'method'), p_voucher_code, 'completed'
  )
  RETURNING id INTO v_tx_id;

  -- 10. Insert line items (using DB prices)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_qty           := (v_item->>'quantity')::INT;
    v_item_discount := COALESCE((v_item->>'discount')::NUMERIC, 0);

    SELECT price INTO v_price FROM products WHERE id = (v_item->>'product_id')::UUID;

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
    FROM products p WHERE p.id = (v_item->>'product_id')::UUID;

    -- 11. Decrement stock atomically
    UPDATE stock_levels
    SET stock = stock - v_qty
    WHERE product_id = (v_item->>'product_id')::UUID
      AND branch_id  = p_branch_id;
  END LOOP;

  -- 12. Insert payment rows
  INSERT INTO transaction_payments (transaction_id, method, amount, reference)
  SELECT v_tx_id, p->>'method', (p->>'amount')::NUMERIC, NULLIF(p->>'reference', '')
  FROM jsonb_array_elements(p_payments) AS p;

  -- 13. Increment voucher usage
  IF p_voucher_code IS NOT NULL THEN
    UPDATE vouchers
    SET used_count = used_count + 1
    WHERE upper(code) = upper(p_voucher_code);
  END IF;

  -- 14. Audit log
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

-- Grant execute to authenticated users (RLS inside the function controls branch)
REVOKE ALL ON FUNCTION create_transaction FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_transaction TO authenticated;

-- ─── 5. void_transaction RPC ─────────────────────────────────────────────────
-- Replaces direct UPDATE on transactions for voids.
-- Managers/admins → void directly.
-- Cashiers/viewers → FORBIDDEN (use void_with_pin from migration 006).

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

  -- 4. Enforce branch isolation (admin may override)
  IF NOT has_role(ARRAY['admin']) AND v_tx.branch_id IS DISTINCT FROM get_my_branch() THEN
    RAISE EXCEPTION 'FORBIDDEN: transaction belongs to a different branch';
  END IF;

  IF v_tx.status != 'completed' THEN
    RAISE EXCEPTION 'INVALID: only completed transactions can be voided (current status: %)', v_tx.status;
  END IF;

  -- 5. Void the transaction
  UPDATE transactions
  SET status     = 'voided',
      void_reason = p_reason,
      voided_at   = NOW()
  WHERE id = p_transaction_id;

  -- 6. Restore stock for each item
  UPDATE stock_levels sl
  SET    stock = sl.stock + ti.quantity
  FROM   transaction_items ti
  WHERE  ti.transaction_id = p_transaction_id
    AND  sl.product_id     = ti.product_id
    AND  sl.branch_id      = v_tx.branch_id;

  -- 7. Audit
  SELECT id INTO v_staff_id FROM staff WHERE auth_id = auth.uid() LIMIT 1;

  INSERT INTO audit_log (branch_id, staff_id, action, details, severity)
  VALUES (
    v_tx.branch_id, v_staff_id,
    'TRANSACTION_VOIDED',
    'TX: ' || p_transaction_id || ' | Reason: ' || p_reason,
    'warning'
  );
END;
$$;

REVOKE ALL ON FUNCTION void_transaction FROM PUBLIC;
GRANT EXECUTE ON FUNCTION void_transaction TO authenticated;

-- ─── DONE ─────────────────────────────────────────────────────────────────────
-- Summary of what this migration adds:
--   ✅ get_my_role() / get_my_branch() / has_role() — canonical helpers
--   ✅ stock_non_negative CHECK constraint
--   ✅ total_positive CHECK constraint
--   ✅ discount_valid CHECK constraint
--   ✅ UNIQUE index on receipt_no
--   ✅ prevent_role_self_escalation trigger
--   ✅ create_transaction RPC (server-validates prices, stock, branch, voucher, payment)
--   ✅ void_transaction RPC (manager/admin role enforced in PostgreSQL)
