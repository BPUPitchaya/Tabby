-- Flats had SELECT and INSERT policies but no UPDATE or DELETE -- meaning
-- nobody could rename or delete a flat once created. Add admin-only
-- rename/delete, plus a helper mirroring is_flat_member() for the admin
-- check. Leaving a flat already works (migration 0001's "users can leave
-- a flat themselves" policy on flat_members) -- that one just needed a UI
-- button, not a new policy.

create function public.is_flat_admin(target_flat_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.flat_members
    where flat_id = target_flat_id and user_id = auth.uid() and role = 'admin'
  );
$$;

create policy "flat admins can rename their flat"
  on public.flats for update
  to authenticated
  using (public.is_flat_admin(id))
  with check (public.is_flat_admin(id));

create policy "flat admins can delete their flat"
  on public.flats for delete
  to authenticated
  using (public.is_flat_admin(id));
