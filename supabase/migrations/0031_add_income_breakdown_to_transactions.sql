-- Lets an income transaction logged via confirm_income_source_payment
-- carry its own payslip-style breakdown, so Transactions can show "detail
-- of the pay" (gross, tax, ACC, student loan, KiwiSaver, hours, net)
-- instead of just the generic edit form. All nullable: a plain manual
-- income entry, or a gross-tracked source's confirm, has none of this and
-- keeps behaving exactly as before.
alter table public.transactions add column income_source_id uuid references public.income_sources(id) on delete set null;
alter table public.transactions add column gross_amount numeric;
alter table public.transactions add column income_tax numeric;
alter table public.transactions add column acc_levy numeric;
alter table public.transactions add column student_loan numeric;
alter table public.transactions add column kiwisaver_amount numeric;
alter table public.transactions add column hours_paid numeric;
