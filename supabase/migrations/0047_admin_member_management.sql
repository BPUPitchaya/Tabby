-- Admin member management: promote/demote a member's role, or remove
-- them from the flat outright. Both actions exclude the acting admin's
-- own row (enforced client-side, see flat.tsx) -- since an admin can
-- never target themselves through this feature, at least one admin
-- (the actor) always remains afterward, so this can never strand a flat
-- admin-less the way an unprotected leave once could (see
-- 0045_safe_leave_flat.sql for that separate problem and its fix). No
-- security-definer RPC needed here for that reason -- a plain table
-- UPDATE/DELETE under these policies is already safe by construction.
--
-- Added as a second, OR'd policy alongside the existing ones -- flat_members
-- already has no UPDATE policy at all, and only a self-leave DELETE policy
-- (0001_init.sql), so these are purely additive, same pattern as 0006's
-- second INSERT policy for add-by-email alongside self-join.
create policy "flat admins can update member roles"
  on public.flat_members for update
  using (public.is_flat_admin(flat_id))
  with check (public.is_flat_admin(flat_id));

create policy "flat admins can remove a member"
  on public.flat_members for delete
  using (public.is_flat_admin(flat_id));
