-- Self-service account deletion (Phase: App Store readiness) needs these
-- five columns to survive the deleting user's profile row going away --
-- today they're `not null` with no ON DELETE rule at all, so deleting a
-- profile that created a flat, paid a shared expense, or settled up with
-- anyone raises a foreign-key violation and the whole delete fails.
-- SET NULL here instead: the flat/expense/settlement ROW survives (so
-- other members' history and balances stay intact), only the "who"
-- pointer on it goes null -- the UI shows "Deleted User" wherever that's
-- the case. See lib/flats.ts and shared-expenses UI for that display
-- fallback, added alongside this migration.
alter table public.flats drop constraint flats_created_by_fkey;
alter table public.flats alter column created_by drop not null;
alter table public.flats add constraint flats_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;

alter table public.shared_expenses drop constraint shared_expenses_paid_by_fkey;
alter table public.shared_expenses alter column paid_by drop not null;
alter table public.shared_expenses add constraint shared_expenses_paid_by_fkey
  foreign key (paid_by) references public.profiles (id) on delete set null;

alter table public.shared_expense_splits drop constraint shared_expense_splits_user_id_fkey;
alter table public.shared_expense_splits alter column user_id drop not null;
alter table public.shared_expense_splits add constraint shared_expense_splits_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete set null;

alter table public.settlements drop constraint settlements_from_user_fkey;
alter table public.settlements alter column from_user drop not null;
alter table public.settlements add constraint settlements_from_user_fkey
  foreign key (from_user) references public.profiles (id) on delete set null;

alter table public.settlements drop constraint settlements_to_user_fkey;
alter table public.settlements alter column to_user drop not null;
alter table public.settlements add constraint settlements_to_user_fkey
  foreign key (to_user) references public.profiles (id) on delete set null;
