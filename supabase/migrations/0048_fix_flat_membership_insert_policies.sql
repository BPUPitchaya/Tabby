-- Found in code review: the two flat_members INSERT policies only check
-- WHO is being inserted, never WHAT role they're inserted with. That means:
--
-- 1. "users can join a flat themselves" (0001) let anyone who knows (or
--    guesses) a flat_id self-insert as role='admin' directly, skipping the
--    invite-code flow entirely and self-promoting to admin on a flat they
--    were never invited to. It also let a member removed under 0047 simply
--    re-insert themselves, undoing the removal.
-- 2. "flat members can add others by email" (0006) let any existing member
--    (not just an admin) insert a DIFFERENT person into the flat with
--    role='admin', silently handing out admin on someone else's behalf.
--
-- Fix: self-join is now routed through a security-definer RPC that verifies
-- the invite code server-side and always inserts role='member' -- the plain
-- self-insert policy is narrowed to only the one legitimate direct-insert
-- case left (createFlat inserting its own creator as admin, immediately
-- after that same user created the flat). The add-by-email policy is
-- narrowed to admin-only callers and can never insert role='admin'.

drop policy "users can join a flat themselves" on public.flat_members;

create policy "flat creator can self-insert as admin"
  on public.flat_members for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and role = 'admin'
    and exists (
      select 1 from public.flats f
      where f.id = flat_id and f.created_by = auth.uid()
    )
  );

drop policy "flat members can add others by email" on public.flat_members;

create policy "flat admins can add others by email"
  on public.flat_members for insert
  to authenticated
  with check (
    role = 'member'
    and public.is_flat_admin(flat_id)
  );

-- Narrow security-definer join: verifies the invite code itself (instead of
-- trusting the client to have looked one up first) and always inserts
-- role='member', so there is no direct-insert path left for a self-join to
-- become admin or to re-add a removed member without going through this.
create function public.join_flat_by_invite_code(p_invite_code text)
returns public.flats
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flat public.flats;
begin
  select * into v_flat from public.flats where invite_code = p_invite_code;

  if v_flat.id is null then
    raise exception 'No flat found with that invite code.';
  end if;

  insert into public.flat_members (flat_id, user_id, role)
  values (v_flat.id, auth.uid(), 'member');

  return v_flat;
end;
$$;

revoke all on function public.join_flat_by_invite_code(text) from public;
grant execute on function public.join_flat_by_invite_code(text) to authenticated;
