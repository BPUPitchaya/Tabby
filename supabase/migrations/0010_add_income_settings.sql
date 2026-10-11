-- Recurring expected income, set up in Edit Profile (deferred from signup --
-- that's going to live in the future onboarding questionnaire instead).
-- This is deliberately separate from the actual income *transactions*
-- already tracked (is_income on transactions, see 0009) -- one is a
-- budget/forecast figure the user sets once, the other is real recorded
-- money. The dashboard compares "spent so far" against this figure.
--
-- This is its OWN table rather than new columns on public.profiles,
-- because profiles has "profiles are viewable by any authenticated user"
-- (so flatmates can see each other's display_name) -- income is sensitive
-- enough that it needs a strictly self-only policy, which a shared,
-- already-permissive table can't give it without weakening that table for
-- everyone else.
--
-- income_pay_weekday: 0-6, Sunday-Saturday (matches JS Date#getDay()) --
-- used for weekly/biweekly. Biweekly doesn't store a reference date, so
-- its cycle is a rolling 14-day window ending on the most recent matching
-- weekday -- a documented simplification, not a true alternating-week
-- cycle (see src/lib/profile.ts).
-- income_pay_day_of_month: 1-31 -- used for monthly, clamped to the last
-- day of shorter months.
create table public.income_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  income_amount numeric not null check (income_amount > 0),
  income_frequency text not null check (income_frequency in ('weekly', 'biweekly', 'monthly')),
  income_pay_weekday smallint check (income_pay_weekday between 0 and 6),
  income_pay_day_of_month smallint check (income_pay_day_of_month between 1 and 31),
  updated_at timestamptz not null default now()
);

alter table public.income_settings enable row level security;

create policy "users can view their own income settings"
  on public.income_settings for select
  to authenticated
  using (user_id = auth.uid());

create policy "users can insert their own income settings"
  on public.income_settings for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "users can update their own income settings"
  on public.income_settings for update
  to authenticated
  using (user_id = auth.uid());

create policy "users can delete their own income settings"
  on public.income_settings for delete
  to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.income_settings to authenticated;
