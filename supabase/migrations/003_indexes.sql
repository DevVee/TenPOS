-- ============================================================
-- TenPOS — Migration 003: Indexes for Performance
-- Run AFTER 001_schema.sql
-- ============================================================

-- Products — fast lookup by branch + SKU + barcode
create index if not exists idx_products_branch      on products(branch_id);
create index if not exists idx_products_category    on products(category_id);
create index if not exists idx_products_sku         on products(branch_id, sku);
create index if not exists idx_products_barcode     on products(barcode) where barcode is not null;
create index if not exists idx_products_active      on products(branch_id, active);

-- Transactions — fast reporting queries
create index if not exists idx_tx_branch_date       on transactions(branch_id, created_at desc);
create index if not exists idx_tx_staff             on transactions(staff_id);
create index if not exists idx_tx_status            on transactions(branch_id, status);
create index if not exists idx_tx_receipt           on transactions(receipt_no);
create index if not exists idx_tx_local_id          on transactions(local_id) where local_id is not null;

-- Transaction items — fast join from transaction
create index if not exists idx_tx_items_tx          on transaction_items(transaction_id);
create index if not exists idx_tx_items_product     on transaction_items(product_id);

-- Stock — fast lookup per product+branch
create index if not exists idx_stock_product_branch on stock_levels(product_id, branch_id);
create index if not exists idx_stock_low            on stock_levels(branch_id, stock, reorder_point);

-- Stock adjustments — audit queries
create index if not exists idx_adj_product_date     on stock_adjustments(product_id, created_at desc);
create index if not exists idx_adj_branch_date      on stock_adjustments(branch_id, created_at desc);

-- Staff — fast auth lookup
create index if not exists idx_staff_auth_id        on staff(auth_id) where auth_id is not null;
create index if not exists idx_staff_branch         on staff(branch_id);

-- Audit log — fast fetch for dashboard
create index if not exists idx_audit_branch_date    on audit_log(branch_id, created_at desc);

-- Shifts — open shift lookup
create index if not exists idx_shifts_open          on shifts(branch_id, status) where status = 'open';

-- Vouchers — fast lookup by code
create index if not exists idx_vouchers_code        on vouchers(branch_id, code);
