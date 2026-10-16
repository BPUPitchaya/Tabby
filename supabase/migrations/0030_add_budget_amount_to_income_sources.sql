-- Phase 5: Home/Budget cutover. budget_amount used to live on the
-- income_settings singleton (0013_add_budget_amount_to_income_settings.sql)
-- -- a budget rides the same pay cycle income defines, and with multiple
-- jobs now possible, that cycle is the PRIMARY source's. Only the primary
-- row's budget_amount is ever read -- same one-budget-per-cycle shape as
-- before, just relocated.
alter table public.income_sources add column budget_amount numeric;

-- Backfill from whichever user currently has a budget set, onto their
-- primary source (the row 0028's migration already copied income_settings
-- into) -- best-effort, one-time; nothing reads income_settings after this
-- lands in the app.
update public.income_sources s
set budget_amount = i.budget_amount
from public.income_settings i
where s.user_id = i.user_id and s.is_primary and i.budget_amount is not null;
