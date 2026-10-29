-- Found in code review: "either party can record a settlement" had no
-- amount check and no check that from_user/to_user are actually members of
-- the flat the settlement is recorded against.
--
-- 1. No amount > 0 check meant a negative amount could flip a balance the
--    wrong way (e.g. from_user=B, to_user=A, amount=-200 has the same
--    practical effect as a fabricated debt from A to B).
-- 2. from_user/to_user weren't checked against flat membership, so a
--    settlement could reference someone who isn't actually in that flat.
--
-- Unilateral settling itself (either side can mark it settled, with no
-- confirmation from the other) is kept as-is -- an intentional honor-system
-- design for a trusted-flatmates app, same as Splitwise's "settle up", not
-- a bug on its own.

alter table public.settlements add constraint settlements_amount_positive check (amount > 0);

-- is_flat_member() only ever checked auth.uid() against a flat -- need the
-- same check for an arbitrary user_id (the other party in a settlement).
create function public.is_flat_member_user(target_flat_id uuid, target_user_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.flat_members
    where flat_id = target_flat_id and user_id = target_user_id
  );
$$;

revoke all on function public.is_flat_member_user(uuid, uuid) from public;
grant execute on function public.is_flat_member_user(uuid, uuid) to authenticated;

drop policy "either party can record a settlement" on public.settlements;

create policy "either party can record a settlement"
  on public.settlements for insert
  to authenticated
  with check (
    public.is_flat_member(flat_id)
    and (from_user = auth.uid() or to_user = auth.uid())
    and public.is_flat_member_user(flat_id, from_user)
    and public.is_flat_member_user(flat_id, to_user)
  );
