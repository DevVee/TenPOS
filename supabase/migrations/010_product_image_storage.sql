-- ============================================================
-- TenPOS — Migration 010: Product Image Storage
--
-- Prerequisites (do this ONCE in Supabase dashboard):
--   Storage → New bucket
--   Name:           products
--   Public bucket:  ON
--   Save
--
-- Then run this file in Supabase → SQL Editor → New query → Run
-- ============================================================

-- ── 1. Make sure the bucket is marked public (idempotent) ───────────────────
update storage.buckets
set    public = true
where  id     = 'products';

-- ── 2. Drop old policies if re-running ──────────────────────────────────────
drop policy if exists "product_image_insert" on storage.objects;
drop policy if exists "product_image_update" on storage.objects;
drop policy if exists "product_image_delete" on storage.objects;
drop policy if exists "product_image_select" on storage.objects;

-- ── Role helper (inline) ─────────────────────────────────────────────────────
-- Storage policies run outside the normal function search path, so we inline
-- the role check instead of calling has_role() to avoid the 42883 error.
-- Expression: look up the caller's role directly from the staff table.

-- ── 3. INSERT — only admin and manager may upload product images ─────────────
create policy "product_image_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'products'
  and (
    select role from public.staff
    where auth_id = auth.uid() and status = 'active'
    limit 1
  ) in ('admin', 'manager')
);

-- ── 4. UPDATE — admin / manager may overwrite an existing image ──────────────
create policy "product_image_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'products'
  and (
    select role from public.staff
    where auth_id = auth.uid() and status = 'active'
    limit 1
  ) in ('admin', 'manager')
)
with check (
  bucket_id = 'products'
  and (
    select role from public.staff
    where auth_id = auth.uid() and status = 'active'
    limit 1
  ) in ('admin', 'manager')
);

-- ── 5. DELETE — admin / manager may remove product images ───────────────────
create policy "product_image_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'products'
  and (
    select role from public.staff
    where auth_id = auth.uid() and status = 'active'
    limit 1
  ) in ('admin', 'manager')
);

-- ── 6. SELECT — public read (anyone can view product photos) ─────────────────
create policy "product_image_select"
on storage.objects
for select
to public
using (bucket_id = 'products');
