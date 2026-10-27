-- Leaving a flat used to be a plain client-side delete on flat_members,
-- with nothing stopping the sole admin from leaving and stranding the
-- flat with zero admins -- rename/delete-flat and every chore
-- create/edit/delete action are all gated on is_flat_admin(), so an
-- admin-less flat is permanently stuck on those for everyone, with no
-- recovery path anywhere in the UI (see /prometheus gap, 2026-10-27).
--
-- Fix: when the leaving user is the only admin and other members remain,
-- atomically promote the longest-standing other member to admin before
-- removing the leaving user. security definer (like confirm_chore/
-- confirm_bill_payment) since promoting someone else's role has no
-- existing UPDATE policy on flat_members to rely on -- this function
-- validates membership itself instead of depending on RLS.
create or replace function public.leave_flat(p_flat_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_other_admin_count int;
  v_next_member uuid;
begin
  select role into v_role
  from public.flat_members
  where flat_id = p_flat_id and user_id = auth.uid();

  if v_role is null then
    raise exception 'Not a member of this flat';
  end if;

  if v_role = 'admin' then
    select count(*) into v_other_admin_count
    from public.flat_members
    where flat_id = p_flat_id and user_id <> auth.uid() and role = 'admin';

    if v_other_admin_count = 0 then
      select user_id into v_next_member
      from public.flat_members
      where flat_id = p_flat_id and user_id <> auth.uid()
      order by joined_at asc
      limit 1;

      if v_next_member is not null then
        update public.flat_members set role = 'admin'
        where flat_id = p_flat_id and user_id = v_next_member;
      end if;
    end if;
  end if;

  delete from public.flat_members where flat_id = p_flat_id and user_id = auth.uid();
end;
$$;

revoke all on function public.leave_flat(uuid) from public;
grant execute on function public.leave_flat(uuid) to authenticated;
