-- Creating a flat does an INSERT ... RETURNING (to get the generated invite
-- code back immediately). Postgres checks RETURNING output against the
-- table's SELECT policy, not just the INSERT policy's WITH CHECK. Our SELECT
-- policy only allowed members to see a flat -- but the creator isn't added
-- to flat_members until a second, separate insert right after. That gap
-- made every single flat creation fail with an RLS violation.
--
-- Fix: a flat's creator can always see their own flat, in addition to
-- members being able to see flats they belong to.

alter policy "flat members can view their flat"
  on public.flats
  using (public.is_flat_member(id) or created_by = auth.uid());
