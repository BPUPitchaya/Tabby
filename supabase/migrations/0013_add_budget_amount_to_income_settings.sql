-- Separate from income_amount on purpose -- income is what you expect to
-- receive, budget is how much of it you intend to spend. They were the
-- same number before this migration (the dashboard's "Budget %" was
-- literally spend-against-income), which meant there was no way to budget
-- less than you earn. Nullable: a budget can't exist before income does
-- (computeIncomeCycle needs frequency/payday, which only income carries),
-- so the app gates setting a budget on income already being set, rather
-- than enforcing it at the DB level with a second NOT NULL table.
alter table public.income_settings
  add column budget_amount numeric check (budget_amount is null or budget_amount > 0);
