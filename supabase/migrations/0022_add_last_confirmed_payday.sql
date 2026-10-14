-- Tracks the most recent payday the user actually confirmed income for,
-- separate from the pay-cycle math in computeIncomeCycle() -- that
-- function only knows the *schedule* (most recent/next occurrence), not
-- whether this specific occurrence was ever acknowledged. A pending
-- payday is: computeIncomeCycle(settings).startDate > last_confirmed_payday
-- (or last_confirmed_payday is null).
alter table public.income_settings add column last_confirmed_payday date;
