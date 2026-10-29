-- Found in code review: leave_flat (0045) promotes another member when
-- the sole admin explicitly leaves a flat, but account deletion
-- (supabase/functions/delete-account) just cascade-deletes the
-- flat_members row directly -- the same "never strand a flat with zero
-- admins" problem 0045 fixed for leaving was never closed for deleting
-- your account instead. A sole admin deleting their account leaves the
-- flat permanently stuck: rename/delete-flat and every chore action are
-- gated on is_flat_admin(), with no recovery path anywhere in the UI.
--
-- Fix: the same promote-before-removal logic as leave_flat, but for every
-- flat the departing user belongs to (not just one), and parameterized by
-- an explicit p_user_id since the edge function runs as service_role on
-- the caller's behalf rather than as the caller themselves -- auth.uid()
-- isn't meaningful in that context. Restricted to service_role only: this
-- must never be callable by an ordinary authenticated user to promote
-- someone else's admin on a flat they're not even in.
create or replace function public.promote_admins_before_account_deletion(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_flat record;
  v_other_admin_count int;
  v_next_member uuid;
begin
  for v_flat in
    select flat_id from public.flat_members
    where user_id = p_user_id and role = 'admin'
  loop
    select count(*) into v_other_admin_count
    from public.flat_members
    where flat_id = v_flat.flat_id and user_id <> p_user_id and role = 'admin';

    if v_other_admin_count = 0 then
      select user_id into v_next_member
      from public.flat_members
      where flat_id = v_flat.flat_id and user_id <> p_user_id
      order by joined_at asc
      limit 1;

      if v_next_member is not null then
        update public.flat_members set role = 'admin'
        where flat_id = v_flat.flat_id and user_id = v_next_member;
      end if;
    end if;
  end loop;
end;
$$;

revoke all on function public.promote_admins_before_account_deletion(uuid) from public, authenticated, anon;
grant execute on function public.promote_admins_before_account_deletion(uuid) to service_role;
