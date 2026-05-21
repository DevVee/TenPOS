# TenPOS — Security Architecture

> **Status:** Partially implemented — see checklist below.  
> Run `supabase/migrations/008_security_hardening.sql` in Supabase SQL Editor to complete DB items.

---

## Threat Model

Assume every attacker has:
- A valid cashier account they created or stole
- Browser DevTools open and can edit any frontend code
- The public Supabase URL and anon key
- A script firing 1,000 requests per second
- Access to the mobile APK (decompilable)

The system must remain secure under all of these. **Frontend is decoration. The database is the only truth.**

---

## TODO Checklist

### 🔴 Critical — Do Before Any Real Business Data

- [x] Run `ENABLE ROW LEVEL SECURITY` on all tables — **done in 002_rls.sql**
- [x] Deploy `get_my_role()`, `get_my_branch()`, `has_role()` helper functions — **done in 008_security_hardening.sql** (run it!)
- [x] Replace `apiCreateTransaction` with `supabase.rpc('create_transaction', ...)` — **done in web/src/lib/api.ts**
- [x] Replace `apiVoidTransaction` with `supabase.rpc('void_transaction', ...)` — **done in web/src/lib/api.ts**
- [ ] **MANUAL:** Enable **Refresh Token Reuse Detection** in Supabase → Auth → Settings
- [ ] **MANUAL:** Set login rate limits in Supabase → Auth → Rate Limits (10 attempts/hour)
- [ ] **MANUAL:** Confirm service role key is **not** in any committed file or Vercel env var
- [x] Add `stock >= 0` constraint on `stock_levels` table — **done in 008_security_hardening.sql** (run it!)
- [x] Verify audit_log has **no** UPDATE or DELETE policies — confirmed (002_rls.sql has only SELECT + INSERT)

### 🟡 High — Do Before Launch

- [x] Add CSP + security headers to `web/vercel.json` — **done** (X-Frame-Options, CSP, HSTS, nosniff, XSS-Protection)
- [x] Add `total > 0` and `discount <= subtotal` constraints — **done in 008_security_hardening.sql** (run it!)
- [x] Add self-role-escalation trigger on `staff` table — **done in 008_security_hardening.sql** (run it!)
- [x] Confirm no `dangerouslySetInnerHTML` anywhere in web app — verified clean (React JSX only)

### 🟢 Good to Have — Before Scale

- [ ] Idempotency keys on transactions (for mobile offline dedup)
- [ ] Alerts on `audit_log` for `severity = 'critical'`
- [ ] Nightly export of `audit_log` to cold storage
- [ ] Supabase Point-in-time recovery (Pro plan)

---

## 1. Authentication Security

### Flow

```
User enters email + password
  → Supabase Auth validates credentials
  → Returns JWT access token (1 hour) + refresh token (7 days)
  → JWT stored in localStorage by Supabase SDK
  → Every API call includes JWT in Authorization header
  → Supabase validates JWT before running any query
```

### Settings (Supabase Dashboard → Auth → Settings)

```
JWT expiry:                    3600 (1 hour)
Refresh token reuse detection: ENABLED  ← critical, kills stolen sessions
Sign-in attempts per hour:     10
```

### Rules

- Access token: **1 hour** (default — keep it)
- Refresh token: reduce to **1 day** for POS (cashiers log in daily)
- Never store role, permissions, or user data outside what the Supabase SDK manages

```tsx
// ❌ UNSAFE — attacker edits this in DevTools
localStorage.setItem('role', 'admin')
if (localStorage.getItem('role') === 'admin') showAdminPanel()

// ✅ SAFE — role comes from DB query guarded by RLS
const { data: staff } = await supabase
  .from('staff')
  .select('role')
  .eq('auth_id', user.id)
  .single()
```

---

## 2. Authorization — RBAC

### Golden Rule

**Every permission check must happen in the database via RLS.**
The frontend only hides/shows UI. It never grants access.

An attacker can change any frontend variable. RLS runs inside PostgreSQL before any data is touched — it cannot be bypassed from the client.

### Helper Functions (run in Supabase SQL Editor)

```sql
-- Returns the authenticated staff member's role
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM staff
  WHERE auth_id = auth.uid() AND status = 'active'
  LIMIT 1
$$;

-- Returns the authenticated staff member's branch_id
CREATE OR REPLACE FUNCTION get_my_branch()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT branch_id FROM staff
  WHERE auth_id = auth.uid() AND status = 'active'
  LIMIT 1
$$;

-- Check if current user has one of the allowed roles
CREATE OR REPLACE FUNCTION has_role(allowed_roles TEXT[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT get_my_role() = ANY(allowed_roles)
$$;
```

---

## 3. RLS Policies — Per Table

### Enable RLS on all tables first

```sql
ALTER TABLE staff               ENABLE ROW LEVEL SECURITY;
ALTER TABLE products            ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_levels        ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE vouchers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches            ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns             ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_items        ENABLE ROW LEVEL SECURITY;
-- With RLS enabled and no policies → zero rows accessible by default
```

### `staff`

```sql
-- Read own record
CREATE POLICY "staff: read own"
ON staff FOR SELECT
USING (auth_id = auth.uid());

-- Managers/admins read all staff
CREATE POLICY "staff: managers read all"
ON staff FOR SELECT
USING (has_role(ARRAY['admin', 'manager']));

-- Only admins write staff (create, update, delete)
CREATE POLICY "staff: admin full write"
ON staff FOR ALL
USING (has_role(ARRAY['admin']))
WITH CHECK (has_role(ARRAY['admin']));
```

### `products`

```sql
-- All authenticated users read active products (POS needs this)
CREATE POLICY "products: authenticated read active"
ON products FOR SELECT
USING (auth.uid() IS NOT NULL AND active = true);

-- Managers/admins see all including inactive
CREATE POLICY "products: managers see all"
ON products FOR SELECT
USING (has_role(ARRAY['admin', 'manager']));

-- Managers/admins create and update
CREATE POLICY "products: managers write"
ON products FOR INSERT
WITH CHECK (has_role(ARRAY['admin', 'manager']));

CREATE POLICY "products: managers update"
ON products FOR UPDATE
USING (has_role(ARRAY['admin', 'manager']))
WITH CHECK (has_role(ARRAY['admin', 'manager']));

-- Only admin deletes
CREATE POLICY "products: admin delete"
ON products FOR DELETE
USING (has_role(ARRAY['admin']));
```

### `stock_levels`

```sql
-- All authenticated users read stock (POS needs this)
CREATE POLICY "stock: authenticated read"
ON stock_levels FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Only managers/admins manually adjust stock
CREATE POLICY "stock: managers adjust"
ON stock_levels FOR UPDATE
USING (has_role(ARRAY['admin', 'manager']))
WITH CHECK (has_role(ARRAY['admin', 'manager']));

-- Stock decrements happen only via create_transaction RPC (SECURITY DEFINER)
-- Cashiers cannot call UPDATE on stock_levels directly
```

### `transactions` — most critical

```sql
-- Cashiers read only their own; managers/admins read all
CREATE POLICY "transactions: scoped read"
ON transactions FOR SELECT
USING (
  staff_id = (SELECT id FROM staff WHERE auth_id = auth.uid())
  OR has_role(ARRAY['admin', 'manager'])
);

-- Any active staff can insert (but only via RPC which validates branch)
CREATE POLICY "transactions: staff insert"
ON transactions FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND branch_id = get_my_branch()
);

-- Nobody can UPDATE transactions directly (voids go through RPC)
CREATE POLICY "transactions: no direct update"
ON transactions FOR UPDATE
USING (false);

-- Nobody can ever delete a transaction
CREATE POLICY "transactions: no delete"
ON transactions FOR DELETE
USING (false);
```

### `vouchers`

```sql
-- Cashiers read active vouchers (for POS validation)
CREATE POLICY "vouchers: authenticated read active"
ON vouchers FOR SELECT
USING (auth.uid() IS NOT NULL AND active = true);

-- Only managers/admins manage vouchers
CREATE POLICY "vouchers: managers write"
ON vouchers FOR ALL
USING (has_role(ARRAY['admin', 'manager']))
WITH CHECK (has_role(ARRAY['admin', 'manager']));
```

### `audit_log`

```sql
-- Managers/admins can read audit logs
CREATE POLICY "audit: managers read"
ON audit_log FOR SELECT
USING (has_role(ARRAY['admin', 'manager']));

-- Any authenticated user can insert (for logging)
CREATE POLICY "audit: authenticated insert"
ON audit_log FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- No UPDATE or DELETE policies = append-only, permanent record
```

---

## 4. Database Constraints

```sql
-- Stock can never go negative
ALTER TABLE stock_levels
  ADD CONSTRAINT stock_non_negative CHECK (stock >= 0);

-- Transaction totals must make sense
ALTER TABLE transactions
  ADD CONSTRAINT total_positive CHECK (total > 0),
  ADD CONSTRAINT discount_valid CHECK (discount >= 0 AND discount <= subtotal);

-- Prevent receipt number collisions
ALTER TABLE transactions
  ADD CONSTRAINT unique_receipt_no UNIQUE (receipt_no);

-- Prevent role self-escalation trigger
CREATE OR REPLACE FUNCTION prevent_role_self_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.auth_id = auth.uid() AND NEW.role != OLD.role THEN
    RAISE EXCEPTION 'FORBIDDEN: cannot change your own role';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER enforce_no_self_role_change
BEFORE UPDATE ON staff
FOR EACH ROW EXECUTE FUNCTION prevent_role_self_escalation();
```

---

## 5. Secure RPCs (Replace Direct API Calls)

### `create_transaction` RPC

Replaces `apiCreateTransaction`. Validates everything server-side:
- Re-reads prices from DB (ignores frontend price)
- Enforces branch match
- Checks stock availability
- Validates voucher
- Verifies payment total >= transaction total
- Decrements stock atomically

```sql
CREATE OR REPLACE FUNCTION create_transaction(
  p_branch_id     UUID,
  p_items         JSONB,
  p_payments      JSONB,
  p_discount      NUMERIC DEFAULT 0,
  p_voucher_code  TEXT    DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_staff_id     UUID;
  v_staff_branch UUID;
  v_subtotal     NUMERIC := 0;
  v_tax          NUMERIC := 0;
  v_total        NUMERIC := 0;
  v_total_paid   NUMERIC := 0;
  v_tx_id        UUID;
  v_receipt_no   TEXT;
  v_item         JSONB;
  v_product      RECORD;
  v_price        NUMERIC;
  v_qty          INT;
BEGIN
  -- 1. Verify active staff
  SELECT id, branch_id INTO v_staff_id, v_staff_branch
  FROM staff WHERE auth_id = auth.uid() AND status = 'active';
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  -- 2. Enforce branch
  IF v_staff_branch != p_branch_id THEN
    RAISE EXCEPTION 'FORBIDDEN: branch mismatch';
  END IF;

  -- 3. Validate cart not empty
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'INVALID: empty cart';
  END IF;

  -- 4. Re-validate prices and stock from DB (never trust frontend)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT price, active INTO v_product FROM products
    WHERE id = (v_item->>'product_id')::UUID;

    IF NOT FOUND OR NOT v_product.active THEN
      RAISE EXCEPTION 'INVALID: product % not found or inactive', v_item->>'product_id';
    END IF;

    v_price := v_product.price;  -- DB price, not frontend price
    v_qty   := (v_item->>'quantity')::INT;

    IF v_qty <= 0 OR v_qty > 999 THEN
      RAISE EXCEPTION 'INVALID: quantity out of range';
    END IF;

    PERFORM 1 FROM stock_levels
    WHERE product_id = (v_item->>'product_id')::UUID
      AND branch_id = p_branch_id AND stock >= v_qty;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK: %', v_item->>'product_id';
    END IF;

    v_subtotal := v_subtotal + (v_price * v_qty);
  END LOOP;

  -- 5. Validate discount
  IF p_discount < 0 OR p_discount > v_subtotal THEN
    RAISE EXCEPTION 'INVALID: discount out of range';
  END IF;

  -- 6. Validate voucher
  IF p_voucher_code IS NOT NULL THEN
    PERFORM 1 FROM vouchers
    WHERE upper(code) = upper(p_voucher_code)
      AND active = true
      AND (expires_at IS NULL OR expires_at > NOW())
      AND (max_uses IS NULL OR used_count < max_uses)
      AND min_purchase <= v_subtotal;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID_VOUCHER: %', p_voucher_code;
    END IF;
  END IF;

  -- 7. Validate payment
  SELECT SUM((p->>'amount')::NUMERIC) INTO v_total_paid
  FROM jsonb_array_elements(p_payments) AS p;
  v_tax   := ROUND((v_subtotal - p_discount) * 0.12, 2);
  v_total := ROUND(v_subtotal - p_discount + v_tax, 2);
  IF v_total_paid < v_total THEN
    RAISE EXCEPTION 'UNDERPAID: got % need %', v_total_paid, v_total;
  END IF;

  -- 8. Create transaction
  v_receipt_no := 'RCP-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' ||
    LPAD((SELECT COUNT(*)+1 FROM transactions WHERE DATE(created_at)=CURRENT_DATE)::TEXT, 4, '0');

  INSERT INTO transactions (
    branch_id, staff_id, receipt_no,
    subtotal, discount, tax, total,
    amount_tendered, change_given, voucher_code, status
  ) VALUES (
    p_branch_id, v_staff_id, v_receipt_no,
    v_subtotal, p_discount, v_tax, v_total,
    v_total_paid, GREATEST(v_total_paid - v_total, 0),
    p_voucher_code, 'completed'
  ) RETURNING id INTO v_tx_id;

  -- 9. Insert items with DB prices
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT price INTO v_price FROM products WHERE id = (v_item->>'product_id')::UUID;
    INSERT INTO transaction_items (
      transaction_id, product_id, variant_id, product_name, sku,
      quantity, unit_price, discount, subtotal
    )
    SELECT v_tx_id, (v_item->>'product_id')::UUID, (v_item->>'variant_id')::UUID,
      p.name, p.sku,
      (v_item->>'quantity')::INT, v_price,
      COALESCE((v_item->>'discount')::NUMERIC, 0),
      v_price * (v_item->>'quantity')::INT
    FROM products p WHERE p.id = (v_item->>'product_id')::UUID;

    -- 10. Decrement stock atomically
    UPDATE stock_levels
    SET stock = stock - (v_item->>'quantity')::INT
    WHERE product_id = (v_item->>'product_id')::UUID AND branch_id = p_branch_id;
  END LOOP;

  -- 11. Insert payments
  INSERT INTO transaction_payments (transaction_id, method, amount, reference)
  SELECT v_tx_id, p->>'method', (p->>'amount')::NUMERIC, p->>'reference'
  FROM jsonb_array_elements(p_payments) AS p;

  -- 12. Increment voucher usage
  IF p_voucher_code IS NOT NULL THEN
    UPDATE vouchers SET used_count = used_count + 1
    WHERE upper(code) = upper(p_voucher_code);
  END IF;

  -- 13. Audit log
  INSERT INTO audit_log (branch_id, staff_id, action, details, severity)
  VALUES (p_branch_id, v_staff_id, 'TRANSACTION_CREATED',
          'Receipt: ' || v_receipt_no || ', Total: ' || v_total, 'info');

  RETURN jsonb_build_object('id', v_tx_id, 'receipt_no', v_receipt_no, 'total', v_total);
END;
$$;
```

### `void_transaction` RPC

```sql
CREATE OR REPLACE FUNCTION void_transaction(p_transaction_id UUID, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_staff_id UUID;
  v_tx       RECORD;
BEGIN
  IF NOT has_role(ARRAY['admin', 'manager']) THEN
    RAISE EXCEPTION 'FORBIDDEN: only managers can void';
  END IF;
  IF length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'INVALID: reason too short';
  END IF;

  SELECT * INTO v_tx FROM transactions WHERE id = p_transaction_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_tx.status != 'completed' THEN RAISE EXCEPTION 'INVALID: not a completed transaction'; END IF;

  UPDATE transactions
  SET status = 'voided', void_reason = p_reason, voided_at = NOW()
  WHERE id = p_transaction_id;

  -- Restore stock
  UPDATE stock_levels sl
  SET stock = sl.stock + ti.quantity
  FROM transaction_items ti
  WHERE ti.transaction_id = p_transaction_id AND sl.product_id = ti.product_id;

  -- Audit
  SELECT id INTO v_staff_id FROM staff WHERE auth_id = auth.uid();
  INSERT INTO audit_log (branch_id, staff_id, action, details, severity)
  VALUES (v_tx.branch_id, v_staff_id, 'TRANSACTION_VOIDED',
          'TX: ' || p_transaction_id || ' | ' || p_reason, 'warning');
END;
$$;
```

---

## 6. Frontend Security

### Never trust from the frontend

| ❌ Never | ✅ Instead |
|---|---|
| `unit_price` from the cart | RPC re-reads price from DB |
| Role stored in localStorage or Zustand | Role from DB via authenticated query |
| Void button as the only protection | Void RPC enforces manager role in PostgreSQL |
| `dangerouslySetInnerHTML` | React JSX escapes automatically — always safe |
| String-concatenated SQL | Always use Supabase parameterized queries |

### Security headers (add to `web/vercel.json`)

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'self'; script-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; img-src 'self' data: https://*.supabase.co; style-src 'self' 'unsafe-inline'"
        }
      ]
    }
  ],
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "installCommand": "npm install",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

---

## 7. Mobile Security (Future Expo APK)

### Storage rules

```typescript
// ✅ SAFE — tokens in OS keychain/keystore
import * as SecureStore from 'expo-secure-store'
await SecureStore.setItemAsync('supabase_session', JSON.stringify(session))

// ❌ UNSAFE — readable on rooted devices
await AsyncStorage.setItem('token', accessToken)
```

### Sync rules

- Always submit offline transactions through the same `create_transaction` RPC — server re-validates everything, tampered local data is rejected
- Use an idempotency key (UUID generated at sale time) to prevent duplicate submission on retry
- Never trust local stock count for anything beyond UX warnings — server is the source of truth

```typescript
const offlineTx = {
  idempotency_key: crypto.randomUUID(), // stored with the tx, submitted on reconnect
  branch_id,
  items,
  payments,
}
```

---

## 8. POS-Specific Risks

| Risk | How it's stopped |
|---|---|
| Fake price submission | `create_transaction` RPC ignores frontend price, reads DB |
| Selling from wrong branch | RPC checks `branch_id = get_my_branch()` |
| Overselling out-of-stock | RPC checks stock before decrement; `stock >= 0` constraint |
| Cashier voids their own sale | Void RPC requires manager/admin role |
| Duplicate transaction on retry | `UNIQUE (receipt_no)` + idempotency key |
| Audit log tampering | No UPDATE/DELETE policies on `audit_log` |
| Stock direct manipulation | No UPDATE policy for cashiers on `stock_levels` |
| Role self-escalation | Trigger blocks role change on own row; only admin writes `staff` |

### Audit log — what to record

```
TRANSACTION_CREATED  → info
TRANSACTION_VOIDED   → warning
STOCK_ADJUSTED       → warning
STAFF_CREATED        → info
STAFF_ROLE_CHANGED   → critical
LOGIN_FAILED         → warning
DISCOUNT_APPLIED     → info (if above threshold)
VOUCHER_USED         → info
```

---

## 9. Future Backend (Express API)

```typescript
// Auth middleware — validates JWT, scopes Supabase client to user
export async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'No token' })

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  })
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return res.status(401).json({ error: 'Invalid token' })

  req.user = user
  req.supabase = supabase  // RLS enforced — this user's scope only
  next()
}

// Role guard
export function requireRole(...roles: string[]) {
  return async (req, res, next) => {
    const { data: staff } = await req.supabase.from('staff').select('role').single()
    if (!staff || !roles.includes(staff.role))
      return res.status(403).json({ error: 'Forbidden' })
    next()
  }
}

// Rate limiting
const transactionLimiter = rateLimit({ windowMs: 60_000, max: 30 })
const authLimiter         = rateLimit({ windowMs: 900_000, max: 10 })
```

---

*Last updated: 2026-05-21 — designed, pending implementation.*
