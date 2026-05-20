-- ============================================================
-- TenPOS — Migration 004: Seed Data
-- Run AFTER 001_schema.sql
-- Creates 1 branch + sample categories + sample products
-- ============================================================

-- ─── Branch ───────────────────────────────────────────────────────────────────
insert into branches (id, name, address, manager_name, active)
values (
  'a0000000-0000-0000-0000-000000000001',
  'Ten Foundation Philippines Inc.',
  '123 Katipunan Ave, Quezon City, Metro Manila',
  'Manager',
  true
)
on conflict (id) do nothing;

-- ─── Categories ───────────────────────────────────────────────────────────────
insert into categories (id, branch_id, name, icon, active, sort_order) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Large Schoolbag',       'LS', true, 1),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Medium Schoolbag',      'MS', true, 2),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Super Large Schoolbag', 'SL', true, 3),
  ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'Lunch Bag',             'LB', true, 4)
on conflict (id) do nothing;

-- ─── Sample Products — all belong to branch ...0001 ─────────────────────────
insert into products (branch_id, category_id, name, sku, price, cost, active) values
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Butterfly Large Bag',  'LS-BTF-001', 850.00, 450.00, true),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Doodles Large Bag',    'LS-DDL-001', 950.00, 500.00, true),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Carnival Large Bag',   'LS-CRN-001', 900.00, 480.00, true),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'Dalmatian Medium Bag', 'MS-DAL-001', 750.00, 380.00, true),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002', 'Dino Medium Bag',      'MS-DNO-001', 720.00, 360.00, true),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000004', 'Unicorn Lunch Bag',    'LB-UNI-001', 350.00, 180.00, true)
on conflict do nothing;

-- ─── Vouchers ─────────────────────────────────────────────────────────────────
insert into vouchers (branch_id, code, type, value, min_purchase, max_uses, active, description) values
  ('a0000000-0000-0000-0000-000000000001', 'WELCOME10', 'percent', 10, 200, 100, true,  '10% off for new customers'),
  ('a0000000-0000-0000-0000-000000000001', 'SAVE50',    'fixed',   50, 500,  50, true,  '₱50 off orders above ₱500'),
  ('a0000000-0000-0000-0000-000000000001', 'SUMMER20',  'percent', 20, 1000, 30, false, 'Summer sale 20% off')
on conflict do nothing;

-- ─── Note ─────────────────────────────────────────────────────────────────────
-- After running this seed, create your owner account:
-- 1. Go to Supabase Dashboard → Authentication → Users → Add user
-- 2. Email: admin@tenpos.ph  Password: (choose a strong one)
-- 3. Then run this to create the matching staff row:
--
--    insert into staff (auth_id, branch_id, name, email, role, status)
--    values (
--      '<paste the UUID from Authentication → Users>',
--      'a0000000-0000-0000-0000-000000000001',
--      'Admin',
--      'admin@tenpos.ph',
--      'admin',
--      'active'
--    );
