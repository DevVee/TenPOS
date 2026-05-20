-- ============================================================
-- TenPOS — Migration 001: Core Schema
-- Run this in: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ─── Branches ────────────────────────────────────────────────────────────────
create table if not exists branches (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  address     text,
  manager_name text,
  active      boolean not null default true,
  terminal_count int not null default 1,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─── Staff (links to Supabase Auth for managers/owners; PIN-only for cashiers)
create table if not exists staff (
  id          uuid primary key default gen_random_uuid(),
  auth_id     uuid references auth.users(id) on delete set null, -- nullable; only managers/owners
  branch_id   uuid references branches(id) on delete cascade,
  name        text not null,
  email       text,
  role        text not null check (role in ('admin','manager','cashier','viewer')),
  pin_hash    text,                  -- bcrypt hash of 4–6 digit PIN
  status      text not null default 'active' check (status in ('active','inactive')),
  sales_count int not null default 0,
  last_login  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─── Categories ──────────────────────────────────────────────────────────────
create table if not exists categories (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid references branches(id) on delete cascade,
  name        text not null,
  icon        text not null default '📦',
  active      boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

-- ─── Products ────────────────────────────────────────────────────────────────
create table if not exists products (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid references branches(id) on delete cascade,
  category_id uuid references categories(id) on delete set null,
  name        text not null,
  sku         text not null,
  barcode     text,
  price       numeric(10,2) not null default 0,
  cost        numeric(10,2) not null default 0,
  image_url   text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (branch_id, sku)
);

-- ─── Product Variants (e.g. size S/M/L with price adjustments) ───────────────
create table if not exists product_variants (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid references products(id) on delete cascade,
  label             text not null,   -- e.g. "Size"
  value             text not null,   -- e.g. "Large"
  price_adjustment  numeric(10,2) not null default 0,
  created_at        timestamptz not null default now()
);

-- ─── Stock Levels ────────────────────────────────────────────────────────────
create table if not exists stock_levels (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid references products(id) on delete cascade,
  variant_id      uuid references product_variants(id) on delete cascade,
  branch_id       uuid references branches(id) on delete cascade,
  stock           int not null default 0,
  reorder_point   int not null default 5,
  updated_at      timestamptz not null default now(),
  unique (product_id, branch_id, variant_id)
);

-- ─── Stock Adjustments (audit trail) ─────────────────────────────────────────
create table if not exists stock_adjustments (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid references products(id) on delete cascade,
  variant_id  uuid references product_variants(id) on delete set null,
  branch_id   uuid references branches(id) on delete cascade,
  staff_id    uuid references staff(id) on delete set null,
  type        text not null check (type in ('in','out','correction','damage','return')),
  quantity    int not null,
  reason      text,
  created_at  timestamptz not null default now()
);

-- ─── Vouchers ────────────────────────────────────────────────────────────────
create table if not exists vouchers (
  id              uuid primary key default gen_random_uuid(),
  branch_id       uuid references branches(id) on delete cascade,
  code            text not null,
  type            text not null check (type in ('percent','fixed')),
  value           numeric(10,2) not null,
  min_purchase    numeric(10,2) not null default 0,
  max_uses        int not null default 999999,
  used_count      int not null default 0,
  active          boolean not null default true,
  expires_at      timestamptz,
  description     text,
  created_at      timestamptz not null default now(),
  unique (branch_id, code)
);

-- ─── Shifts ──────────────────────────────────────────────────────────────────
create table if not exists shifts (
  id              uuid primary key default gen_random_uuid(),
  branch_id       uuid references branches(id) on delete cascade,
  staff_id        uuid references staff(id) on delete set null,
  status          text not null default 'open' check (status in ('open','closed')),
  opening_cash    numeric(10,2) not null default 0,
  closing_cash    numeric(10,2),
  total_sales     numeric(10,2) not null default 0,
  transaction_count int not null default 0,
  opened_at       timestamptz not null default now(),
  closed_at       timestamptz
);

-- ─── Transactions ────────────────────────────────────────────────────────────
create table if not exists transactions (
  id              uuid primary key default gen_random_uuid(),
  branch_id       uuid references branches(id) on delete cascade,
  staff_id        uuid references staff(id) on delete set null,
  shift_id        uuid references shifts(id) on delete set null,
  receipt_no      text not null unique,
  subtotal        numeric(10,2) not null default 0,
  discount        numeric(10,2) not null default 0,
  tax             numeric(10,2) not null default 0,
  total           numeric(10,2) not null default 0,
  amount_tendered numeric(10,2) not null default 0,
  change_given    numeric(10,2) not null default 0,
  payment_method  text not null default 'cash',
  voucher_code    text,
  status          text not null default 'completed' check (status in ('completed','voided','refunded')),
  void_reason     text,
  voided_at       timestamptz,
  -- Mobile offline sync tracking
  local_id        text,              -- uuid from offline device
  synced_at       timestamptz,
  created_at      timestamptz not null default now()
);

-- ─── Transaction Items ────────────────────────────────────────────────────────
create table if not exists transaction_items (
  id              uuid primary key default gen_random_uuid(),
  transaction_id  uuid references transactions(id) on delete cascade,
  product_id      uuid references products(id) on delete set null,
  variant_id      uuid references product_variants(id) on delete set null,
  product_name    text not null,     -- snapshot at time of sale
  sku             text not null,     -- snapshot
  unit_price      numeric(10,2) not null,
  quantity        int not null,
  discount        numeric(10,2) not null default 0,
  subtotal        numeric(10,2) not null,
  note            text
);

-- ─── Transaction Payments (split payments support) ───────────────────────────
create table if not exists transaction_payments (
  id              uuid primary key default gen_random_uuid(),
  transaction_id  uuid references transactions(id) on delete cascade,
  method          text not null check (method in ('cash','gcash','paymaya','card')),
  amount          numeric(10,2) not null,
  reference       text            -- e.g. GCash reference number
);

-- ─── Returns ─────────────────────────────────────────────────────────────────
create table if not exists returns (
  id              uuid primary key default gen_random_uuid(),
  transaction_id  uuid references transactions(id) on delete cascade,
  staff_id        uuid references staff(id) on delete set null,
  branch_id       uuid references branches(id) on delete cascade,
  reason          text,
  total_refund    numeric(10,2) not null default 0,
  created_at      timestamptz not null default now()
);

create table if not exists return_items (
  id              uuid primary key default gen_random_uuid(),
  return_id       uuid references returns(id) on delete cascade,
  transaction_item_id uuid references transaction_items(id) on delete set null,
  product_name    text not null,
  quantity        int not null,
  refund_amount   numeric(10,2) not null
);

-- ─── Audit Log ────────────────────────────────────────────────────────────────
create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid references branches(id) on delete cascade,
  staff_id    uuid references staff(id) on delete set null,
  action      text not null,
  details     text,
  ip          text,
  severity    text not null default 'info' check (severity in ('info','warning','critical')),
  created_at  timestamptz not null default now()
);

-- ─── Updated-at triggers ─────────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_branches_updated_at    before update on branches    for each row execute function set_updated_at();
create trigger trg_staff_updated_at       before update on staff       for each row execute function set_updated_at();
create trigger trg_products_updated_at    before update on products    for each row execute function set_updated_at();
create trigger trg_stock_updated_at       before update on stock_levels for each row execute function set_updated_at();
