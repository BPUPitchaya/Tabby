-- Multi-job income support -- replaces the old singleton income_settings
-- row (one fixed amount) with a list of income sources, one per job, each
-- with its own schedule, fixed-or-hourly mode, and optional gross/net tax
-- tracking. Additive only for now: income_settings and its RPC are left
-- fully intact and still in active use -- this just creates the new table
-- and copies existing data into it, so nothing breaks while the lib layer
-- and UI are built against it. A follow-up migration retires the old
-- columns/RPC once the app code has moved over.
create table public.income_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  -- At most one source per user may be primary -- enforced below by a
  -- partial unique index, not just app-layer convention. The primary
  -- source is the one whose cycle Budget/Earned/Spent follow when the
  -- dashboard period preference is "follow pay cycle" (see profile.ts).
  is_primary boolean not null default false,
  mode text not null check (mode in ('fixed', 'hourly')),
  -- Exactly one of these is set, matching `mode` -- enforced below.
  amount numeric check (amount is null or amount > 0),
  hourly_rate numeric check (hourly_rate is null or hourly_rate > 0),
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly')),
  pay_weekday smallint check (pay_weekday >= 0 and pay_weekday <= 6),
  day_of_month smallint check (day_of_month >= 1 and day_of_month <= 31),
  check (
    (mode = 'fixed' and amount is not null and hourly_rate is null) or
    (mode = 'hourly' and hourly_rate is not null and amount is null)
  ),
  -- 'gross' (today's only behavior) logs whatever was entered/computed as
  -- the income transaction, no tax math. 'net' additionally asks for a tax
  -- code (+ student loan, KiwiSaver) and logs the estimated take-home
  -- instead -- see the planned lib/nz-tax.ts, not part of this migration.
  tracking_mode text not null default 'gross' check (tracking_mode in ('gross', 'net')),
  tax_code text,
  has_student_loan boolean not null default false,
  -- null = not enrolled/opted out. 3/4/6/8/10 are NZ's actual allowed
  -- employee contribution rates -- not a free-form percentage.
  kiwisaver_pct smallint check (kiwisaver_pct is null or kiwisaver_pct in (3, 4, 6, 8, 10)),
  last_confirmed_payday date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one primary source per user.
create unique index income_sources_one_primary
  on public.income_sources (user_id)
  where is_primary;

-- IRD rule, not a UI nicety: at most one CONCURRENT job may use the main
-- tax code (M/ME) when tax-tracked -- every other job needs a secondary
-- code (S/SB/SH/ST). Enforced at the data layer so this can never be
-- silently violated by a bug in the app-layer check.
create unique index income_sources_one_main_tax_code
  on public.income_sources (user_id)
  where tracking_mode = 'net' and tax_code in ('M', 'ME');

alter table public.income_sources enable row level security;

create policy "income_sources_select_own" on public.income_sources
  for select using (user_id = auth.uid());
create policy "income_sources_insert_own" on public.income_sources
  for insert with check (user_id = auth.uid());
create policy "income_sources_update_own" on public.income_sources
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "income_sources_delete_own" on public.income_sources
  for delete using (user_id = auth.uid());

grant select, insert, update, delete on public.income_sources to authenticated;

-- Copy existing income_settings rows forward -- every row that exists
-- already has a full schedule (the app only ever creates one via
-- updateIncomeSettings, which requires frequency etc.), so this is a
-- straight 1:1 copy, always as the primary, fixed-mode, gross-tracked
-- source (today's exact behavior, preserved).
insert into public.income_sources (
  user_id, label, is_primary, mode, amount, frequency, pay_weekday, day_of_month,
  tracking_mode, last_confirmed_payday
)
select
  user_id, 'Main income', true, 'fixed', income_amount, income_frequency,
  income_pay_weekday, income_pay_day_of_month, 'gross', last_confirmed_payday
from public.income_settings;
