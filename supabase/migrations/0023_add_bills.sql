-- Recurring bills: user-scheduled expenses (weekly/biweekly/monthly),
-- fixed or variable amount. Reminder/confirm flow mirrors income_settings'
-- payday pattern, but generalized per-bill (see src/lib/bill-notifications.ts
-- for why notification IDs are keyed by bill id, not a fixed string).

-- A skipped bill still writes a real transaction row (flagged, $0), so bill
-- history shows "skipped on purpose" rather than a silent gap -- but it
-- must never count as real spend, hence the filter added to every existing
-- spend aggregate (dashboard.ts, profile.ts fetchIncomeProgress) alongside
-- this migration.
alter table public.transactions add column skipped boolean not null default false;

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  category_id uuid references public.categories(id) on delete set null,
  -- null amount only valid when is_variable is true -- enforced in the app
  -- layer (lib/bills.ts), not a DB constraint, since "variable implies
  -- amount is null" is a save-time UI rule more than a data invariant.
  is_variable boolean not null default false,
  amount numeric check (amount is null or amount > 0),
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly')),
  pay_weekday smallint check (pay_weekday >= 0 and pay_weekday <= 6),
  day_of_month smallint check (day_of_month >= 1 and day_of_month <= 31),
  -- Most recent due date this bill was resolved for (confirmed or
  -- explicitly skipped) -- same role as income_settings.last_confirmed_payday.
  -- Reset to null whenever frequency/pay_weekday/day_of_month changes (see
  -- updateBill in lib/bills.ts) so an edited schedule recomputes cleanly
  -- instead of inheriting a confirm date from the old cadence.
  last_confirmed_date date,
  created_at timestamptz not null default now()
);

alter table public.bills enable row level security;

create policy "bills_select_own" on public.bills for select using (user_id = auth.uid());
create policy "bills_insert_own" on public.bills for insert with check (user_id = auth.uid());
create policy "bills_update_own" on public.bills for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "bills_delete_own" on public.bills for delete using (user_id = auth.uid());

-- Atomic confirm -- logs the expense transaction AND advances
-- last_confirmed_date in one function call, so a crash/kill mid-flow can't
-- leave the two out of sync (payday's handleConfirmPayday does this as two
-- separate client calls; flagged in premortem as a risk this feature
-- shouldn't repeat). security invoker -- still runs as the caller, so the
-- table RLS policies above apply exactly as if the client had issued the
-- insert/update directly.
create or replace function public.confirm_bill_payment(
  p_bill_id uuid,
  p_amount numeric,
  p_due_date date
) returns void
language plpgsql
security invoker
as $$
declare
  v_bill public.bills%rowtype;
begin
  select * into v_bill from public.bills where id = p_bill_id and user_id = auth.uid();
  if not found then
    raise exception 'Bill not found';
  end if;

  insert into public.transactions (user_id, amount, description, category_id, occurred_at, is_income, skipped)
  values (auth.uid(), p_amount, v_bill.name, v_bill.category_id, p_due_date, false, false);

  update public.bills set last_confirmed_date = p_due_date where id = p_bill_id;
end;
$$;

-- Skip -- logs a $0 flagged transaction instead of just silently advancing
-- the cycle, so "I skipped this" is distinguishable from "the app missed
-- it" when looking back at history later.
create or replace function public.skip_bill_payment(
  p_bill_id uuid,
  p_due_date date
) returns void
language plpgsql
security invoker
as $$
declare
  v_bill public.bills%rowtype;
begin
  select * into v_bill from public.bills where id = p_bill_id and user_id = auth.uid();
  if not found then
    raise exception 'Bill not found';
  end if;

  insert into public.transactions (user_id, amount, description, category_id, occurred_at, is_income, skipped)
  values (auth.uid(), 0, v_bill.name || ' (skipped)', v_bill.category_id, p_due_date, false, true);

  update public.bills set last_confirmed_date = p_due_date where id = p_bill_id;
end;
$$;
