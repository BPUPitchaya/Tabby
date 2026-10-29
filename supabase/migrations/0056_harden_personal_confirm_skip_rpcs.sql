-- Found in code review: confirm_bill_payment, confirm_payday_payment,
-- confirm_income_source_payment, skip_bill_payment and
-- skip_income_source_payment all shared two gaps (integrity hardening,
-- not a security hole -- each row is already scoped to user_id = auth.uid()
-- internally, so this can only ever affect the caller's own data):
--
-- 1. No guard against confirming/skipping the same cycle twice. Replaying
--    a confirm (a retried request, or a double-tap) logged duplicate
--    income/expense transactions each time.
-- 2. No search_path pinned, flagged by the security linter alongside
--    every other RPC in this file that already sets one.
--
-- confirm_bill_payment and confirm_payday_payment also had no
-- amount > 0 check (confirm_income_source_payment's 9-arg version, the
-- real one in use, already relies on the UI's own > 0 checks but gets the
-- same hardening here for consistency).
--
-- Also drops a stale orphaned 3-arg confirm_income_source_payment overload
-- left over from before a later migration added the six extra params with
-- a different signature -- same CREATE OR REPLACE-creates-a-new-overload
-- issue already cleaned up once for confirm_share_paid_by_ower (0050).

drop function if exists public.confirm_income_source_payment(uuid, numeric, date);

create or replace function public.confirm_bill_payment(p_bill_id uuid, p_amount numeric, p_due_date date)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_bill public.bills%rowtype;
begin
  select * into v_bill from public.bills where id = p_bill_id and user_id = auth.uid();
  if not found then
    raise exception 'Bill not found';
  end if;

  if p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  if v_bill.last_confirmed_date is not null and p_due_date <= v_bill.last_confirmed_date then
    raise exception 'This bill has already been confirmed for this cycle';
  end if;

  insert into public.transactions (user_id, amount, description, category_id, occurred_at, is_income, skipped)
  values (auth.uid(), p_amount, v_bill.name, v_bill.category_id, p_due_date, false, false);

  update public.bills set last_confirmed_date = p_due_date where id = p_bill_id;
end;
$$;

create or replace function public.skip_bill_payment(p_bill_id uuid, p_due_date date)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_bill public.bills%rowtype;
begin
  select * into v_bill from public.bills where id = p_bill_id and user_id = auth.uid();
  if not found then
    raise exception 'Bill not found';
  end if;

  if v_bill.last_confirmed_date is not null and p_due_date <= v_bill.last_confirmed_date then
    raise exception 'This bill has already been confirmed or skipped for this cycle';
  end if;

  insert into public.transactions (user_id, amount, description, category_id, occurred_at, is_income, skipped)
  values (auth.uid(), 0, v_bill.name || ' (skipped)', v_bill.category_id, p_due_date, false, true);

  update public.bills set last_confirmed_date = p_due_date where id = p_bill_id;
end;
$$;

create or replace function public.confirm_payday_payment(p_amount numeric, p_payday_date date)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_last_confirmed date;
begin
  select last_confirmed_payday into v_last_confirmed
  from public.income_settings where user_id = auth.uid();

  if not found then
    raise exception 'Income settings not found';
  end if;

  if p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  if v_last_confirmed is not null and p_payday_date <= v_last_confirmed then
    raise exception 'This payday has already been confirmed';
  end if;

  insert into public.transactions (user_id, amount, description, category_id, occurred_at, is_income, skipped)
  values (auth.uid(), p_amount, 'Pay', null, p_payday_date, true, false);

  update public.income_settings set last_confirmed_payday = p_payday_date where user_id = auth.uid();
end;
$$;

create or replace function public.skip_income_source_payment(p_source_id uuid, p_payday_date date)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_source public.income_sources%rowtype;
begin
  select * into v_source from public.income_sources where id = p_source_id and user_id = auth.uid();
  if not found then
    raise exception 'Income source not found';
  end if;

  if v_source.last_confirmed_payday is not null and p_payday_date <= v_source.last_confirmed_payday then
    raise exception 'This payday has already been confirmed or skipped';
  end if;

  insert into public.transactions (user_id, amount, description, category_id, occurred_at, is_income, skipped)
  values (auth.uid(), 0, v_source.label || ' (skipped)', null, p_payday_date, true, true);

  update public.income_sources set last_confirmed_payday = p_payday_date where id = p_source_id;
end;
$$;

create or replace function public.confirm_income_source_payment(
  p_source_id uuid, p_amount numeric, p_payday_date date,
  p_gross_amount numeric default null, p_income_tax numeric default null,
  p_acc_levy numeric default null, p_student_loan numeric default null,
  p_kiwisaver_amount numeric default null, p_hours_paid numeric default null
)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_source public.income_sources%rowtype;
begin
  select * into v_source from public.income_sources where id = p_source_id and user_id = auth.uid();
  if not found then
    raise exception 'Income source not found';
  end if;

  if p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;

  if v_source.last_confirmed_payday is not null and p_payday_date <= v_source.last_confirmed_payday then
    raise exception 'This payday has already been confirmed';
  end if;

  insert into public.transactions (
    user_id, amount, description, category_id, occurred_at, is_income, skipped,
    income_source_id, gross_amount, income_tax, acc_levy, student_loan, kiwisaver_amount, hours_paid
  )
  values (
    auth.uid(), p_amount, v_source.label, null, p_payday_date, true, false,
    p_source_id, p_gross_amount, p_income_tax, p_acc_levy, p_student_loan, p_kiwisaver_amount, p_hours_paid
  );

  update public.income_sources set last_confirmed_payday = p_payday_date where id = p_source_id;
end;
$$;
