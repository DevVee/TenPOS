-- ============================================================
-- TenPOS — Migration 002: Row Level Security (RLS)
-- Run AFTER 001_schema.sql
-- ============================================================

-- Enable RLS on every table
alter table branches          enable row level security;
alter table staff             enable row level security;
alter table categories        enable row level security;
alter table products          enable row level security;
alter table product_variants  enable row level security;
alter table stock_levels      enable row level security;
alter table stock_adjustments enable row level security;
alter table vouchers          enable row level security;
alter table shifts            enable row level security;
alter table transactions      enable row level security;
alter table transaction_items enable row level security;
alter table transaction_payments enable row level security;
alter table returns           enable row level security;
alter table return_items      enable row level security;
alter table audit_log         enable row level security;

-- ─── Helper: get the staff row for the current Supabase Auth user ─────────────
create or replace function auth_staff()
returns setof staff language sql security definer stable as $$
  select * from staff where auth_id = auth.uid() limit 1;
$$;

-- ─── Helper: get branch_id of the current authenticated staff ────────────────
create or replace function auth_branch_id()
returns uuid language sql security definer stable as $$
  select branch_id from staff where auth_id = auth.uid() limit 1;
$$;

-- ─── Helper: get role of the current authenticated staff ─────────────────────
create or replace function auth_role()
returns text language sql security definer stable as $$
  select role from staff where auth_id = auth.uid() limit 1;
$$;

-- ============================================================
-- BRANCHES
-- ============================================================
-- Admin sees all; managers/cashiers see their own branch only
create policy "branches_select" on branches for select using (
  auth_role() = 'admin'
  or id = auth_branch_id()
);
create policy "branches_insert" on branches for insert with check (auth_role() = 'admin');
create policy "branches_update" on branches for update using (auth_role() = 'admin');
create policy "branches_delete" on branches for delete using (auth_role() = 'admin');

-- ============================================================
-- STAFF
-- ============================================================
create policy "staff_select" on staff for select using (
  auth_role() in ('admin','manager')
  or auth_id = auth.uid()
);
create policy "staff_insert" on staff for insert with check (auth_role() in ('admin','manager'));
create policy "staff_update" on staff for update using (
  auth_role() in ('admin','manager')
  or auth_id = auth.uid()        -- allow self-update (PIN change)
);
create policy "staff_delete" on staff for delete using (auth_role() = 'admin');

-- ============================================================
-- CATEGORIES
-- ============================================================
create policy "categories_select" on categories for select using (
  branch_id = auth_branch_id() or auth_role() = 'admin'
);
create policy "categories_write" on categories for all using (
  auth_role() in ('admin','manager') and (branch_id = auth_branch_id() or auth_role() = 'admin')
);

-- ============================================================
-- PRODUCTS
-- ============================================================
-- All authenticated staff can read products in their branch
create policy "products_select" on products for select using (
  branch_id = auth_branch_id() or auth_role() = 'admin'
);
create policy "products_insert" on products for insert with check (
  auth_role() in ('admin','manager') and (branch_id = auth_branch_id() or auth_role() = 'admin')
);
create policy "products_update" on products for update using (
  auth_role() in ('admin','manager') and (branch_id = auth_branch_id() or auth_role() = 'admin')
);
create policy "products_delete" on products for delete using (auth_role() = 'admin');

-- ============================================================
-- PRODUCT VARIANTS
-- ============================================================
create policy "variants_select" on product_variants for select using (
  exists (select 1 from products p where p.id = product_id
    and (p.branch_id = auth_branch_id() or auth_role() = 'admin'))
);
create policy "variants_write" on product_variants for all using (
  auth_role() in ('admin','manager')
);

-- ============================================================
-- STOCK LEVELS
-- ============================================================
create policy "stock_select" on stock_levels for select using (
  branch_id = auth_branch_id() or auth_role() = 'admin'
);
create policy "stock_write" on stock_levels for all using (
  branch_id = auth_branch_id() or auth_role() = 'admin'
);

-- ============================================================
-- STOCK ADJUSTMENTS
-- ============================================================
create policy "adjustments_select" on stock_adjustments for select using (
  branch_id = auth_branch_id() or auth_role() = 'admin'
);
create policy "adjustments_insert" on stock_adjustments for insert with check (
  branch_id = auth_branch_id() or auth_role() = 'admin'
);

-- ============================================================
-- VOUCHERS
-- ============================================================
create policy "vouchers_select" on vouchers for select using (
  branch_id = auth_branch_id() or auth_role() = 'admin'
);
create policy "vouchers_write" on vouchers for all using (
  auth_role() in ('admin','manager') and (branch_id = auth_branch_id() or auth_role() = 'admin')
);

-- ============================================================
-- SHIFTS
-- ============================================================
create policy "shifts_select" on shifts for select using (
  branch_id = auth_branch_id() or auth_role() = 'admin'
);
create policy "shifts_write" on shifts for all using (
  branch_id = auth_branch_id() or auth_role() = 'admin'
);

-- ============================================================
-- TRANSACTIONS
-- ============================================================
create policy "transactions_select" on transactions for select using (
  branch_id = auth_branch_id() or auth_role() = 'admin'
);
-- Cashiers can insert (create sales), managers/admin can also void/refund
create policy "transactions_insert" on transactions for insert with check (
  branch_id = auth_branch_id() or auth_role() = 'admin'
);
create policy "transactions_update" on transactions for update using (
  auth_role() in ('admin','manager') and (branch_id = auth_branch_id() or auth_role() = 'admin')
);

-- ============================================================
-- TRANSACTION ITEMS + PAYMENTS
-- ============================================================
create policy "tx_items_select" on transaction_items for select using (
  exists (select 1 from transactions t where t.id = transaction_id
    and (t.branch_id = auth_branch_id() or auth_role() = 'admin'))
);
create policy "tx_items_insert" on transaction_items for insert with check (
  exists (select 1 from transactions t where t.id = transaction_id
    and (t.branch_id = auth_branch_id() or auth_role() = 'admin'))
);
create policy "tx_payments_select" on transaction_payments for select using (
  exists (select 1 from transactions t where t.id = transaction_id
    and (t.branch_id = auth_branch_id() or auth_role() = 'admin'))
);
create policy "tx_payments_insert" on transaction_payments for insert with check (
  exists (select 1 from transactions t where t.id = transaction_id
    and (t.branch_id = auth_branch_id() or auth_role() = 'admin'))
);

-- ============================================================
-- RETURNS
-- ============================================================
create policy "returns_select" on returns for select using (
  branch_id = auth_branch_id() or auth_role() = 'admin'
);
create policy "returns_insert" on returns for insert with check (
  auth_role() in ('admin','manager') and (branch_id = auth_branch_id() or auth_role() = 'admin')
);
create policy "return_items_select" on return_items for select using (
  exists (select 1 from returns r where r.id = return_id
    and (r.branch_id = auth_branch_id() or auth_role() = 'admin'))
);
create policy "return_items_insert" on return_items for insert with check (
  exists (select 1 from returns r where r.id = return_id
    and (r.branch_id = auth_branch_id() or auth_role() = 'admin'))
);

-- ============================================================
-- AUDIT LOG
-- ============================================================
create policy "audit_select" on audit_log for select using (
  auth_role() in ('admin','manager') and (branch_id = auth_branch_id() or auth_role() = 'admin')
);
create policy "audit_insert" on audit_log for insert with check (
  branch_id = auth_branch_id() or auth_role() = 'admin'
);
