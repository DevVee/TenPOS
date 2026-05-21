-- ============================================================
-- TenPOS — Migration 011: Fix create_transaction voucher columns
--
-- Migration 008 referenced two columns that don't exist in the
-- vouchers table:
--   expiry    → actual column: expires_at
--   min_order → actual column: min_purchase
--
-- This migration replaces the create_transaction function with
-- the corrected column names. All other logic is identical.
--
-- Run in Supabase → SQL Editor → New query → Run
-- ============================================================

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

  -- 6. Validate voucher (if provided) — uses correct column names: expires_at, min_purchase
  IF p_voucher_code IS NOT NULL THEN
    PERFORM 1 FROM vouchers
    WHERE upper(code)   = upper(p_voucher_code)
      AND active        = true
      AND (expires_at IS NULL OR expires_at > NOW())
      AND (max_uses  IS NULL OR used_count < max_uses)
      AND min_purchase  <= v_subtotal;
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

-- Re-grant execute (idempotent)
REVOKE ALL ON FUNCTION create_transaction FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_transaction TO authenticated;
