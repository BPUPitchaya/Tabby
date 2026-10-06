-- Lets a flat member add someone directly by email (if that person already
-- has a Tabby account), instead of only being able to self-join via invite
-- code. Needs two things:
--
-- 1. A way to look up a user's id by email without exposing a general
--    "list all users" capability to the client -- a narrow security-definer
--    function that only returns a single id for an exact email match.
--
-- 2. A second INSERT policy on flat_members: the existing one only lets
--    someone insert a row where user_id = their own id (self-join). Adding
--    someone ELSE requires a separate policy. Both policies co-exist as
--    permissive (OR'd), so self-join via invite code still works
--    unchanged -- this just adds a second way in.

create function public.find_user_id_by_email(target_email text)
returns uuid
language sql
security definer set search_path = public, auth
stable
as $$
  select id from auth.users where lower(email) = lower(target_email) limit 1;
$$;

revoke all on function public.find_user_id_by_email(text) from public;
grant execute on function public.find_user_id_by_email(text) to authenticated;

create policy "flat members can add others by email"
  on public.flat_members for insert
  to authenticated
  with check (public.is_flat_member(flat_id));
