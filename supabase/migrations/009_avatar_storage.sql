-- ============================================================
-- TenPOS — Migration 009: Avatar Storage RLS Policies
--
-- Prerequisites (do this ONCE in Supabase dashboard):
--   Storage → New bucket
--   Name: avatars
--   Public bucket: ON   ← important
--   Save
--
-- Then run this SQL in Supabase → SQL Editor → New query → Run
-- ============================================================

-- ── 1. Make sure the bucket is public (idempotent) ───────────────────────────
update storage.buckets
set    public = true
where  id     = 'avatars';

-- ── 2. Drop old policies if re-running this migration ───────────────────────
drop policy if exists "avatar_insert"  on storage.objects;
drop policy if exists "avatar_update"  on storage.objects;
drop policy if exists "avatar_delete"  on storage.objects;
drop policy if exists "avatar_select"  on storage.objects;

-- ── 3. INSERT — authenticated user may only upload into their own folder ─────
--    Path must start with {auth.uid()}/   e.g.  abc-123/avatar.jpg
create policy "avatar_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ── 4. UPDATE — authenticated user may overwrite only their own file ─────────
--    (needed because apiUploadAvatar uses upsert: true)
create policy "avatar_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ── 5. DELETE — authenticated user may delete only their own file ────────────
create policy "avatar_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ── 6. SELECT — everyone can read (public bucket) ───────────────────────────
create policy "avatar_select"
on storage.objects
for select
to public
using (bucket_id = 'avatars');
