-- Tracks whether the one-time "add your payment details?" onboarding
-- question has been shown, separate from payment_details itself -- a
-- user who explicitly skips still has payment_details = null, and
-- without this flag they'd get asked again on every app open. Same
-- "asked once, never again" posture as wants_flat (0011_add_wants_flat_to_profiles.sql),
-- but a plain boolean here since there's no third "not yet decided"
-- state to represent (skipping IS the decision, not a null one).
alter table public.profiles add column payment_details_prompted boolean not null default false;
