-- ============================================================
-- TenPOS — Migration 005: PIN RPCs + Realtime
-- Run in: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- ─── Enable Realtime for key tables ──────────────────────────────────────────
alter publication supabase_realtime add table products;
alter publication supabase_realtime add table transactions;
alter publication supabase_realtime add table stock_levels;

-- ─── verify_staff_pin(pin) → boolean ─────────────────────────────────────────
-- Called from client after idle lock. Returns TRUE if pin matches OR if staff
-- hasn't set a PIN yet (null pin_hash = no lock configured).
create or replace function verify_staff_pin(p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash text;
begin
  select pin_hash into v_hash
  from staff
  where auth_id = auth.uid()
  limit 1;

  -- No PIN configured → always allow through
  if v_hash is null then
    return true;
  end if;

  return crypt(p_pin, v_hash) = v_hash;
end;
$$;

grant execute on function verify_staff_pin to authenticated;

-- ─── set_staff_pin(pin) → void ────────────────────────────────────────────────
-- Stores a bcrypt hash of the given PIN for the current user.
create or replace function set_staff_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update staff
  set pin_hash = crypt(p_pin, gen_salt('bf', 10))
  where auth_id = auth.uid();
end;
$$;

grant execute on function set_staff_pin to authenticated;

-- ─── clear_staff_pin() → void ────────────────────────────────────────────────
create or replace function clear_staff_pin()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update staff set pin_hash = null where auth_id = auth.uid();
end;
$$;

grant execute on function clear_staff_pin to authenticated;
