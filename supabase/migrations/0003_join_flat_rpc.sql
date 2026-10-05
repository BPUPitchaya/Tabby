-- Joining a flat by invite code requires looking the flat up *before* you're
-- a member, but the "flat members can view their flat" SELECT policy only
-- allows members to see it. Rather than widen that policy (which would let
-- any authenticated user list/browse all flats), use a narrow
-- security-definer function that returns only the single flat matching an
-- exact invite code -- no general listing capability.

create function public.find_flat_by_invite_code(code text)
returns table (id uuid, name text, invite_code text, created_by uuid)
language sql
security definer set search_path = public
stable
as $$
  select id, name, invite_code, created_by
  from public.flats
  where invite_code = code;
$$;

revoke all on function public.find_flat_by_invite_code(text) from public;
grant execute on function public.find_flat_by_invite_code(text) to authenticated;
