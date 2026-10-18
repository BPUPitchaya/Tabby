-- Covering index for the new income_source_id FK (0031) -- flagged by the
-- Supabase performance advisor after Phase 6/7 verification; the FK join
-- (fetching a source behind a logged payday, or cascading on delete)
-- would otherwise scan transactions.
create index transactions_income_source_id_idx on public.transactions (income_source_id);
