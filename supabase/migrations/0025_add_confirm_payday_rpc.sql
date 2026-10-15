-- Same atomicity fix as bills (confirm_bill_payment/skip_bill_payment in
-- 0023) -- the "did you get paid?" confirm used to insert the income
-- transaction and update income_settings.last_confirmed_payday as two
-- separate client calls (handleConfirmPayday in index.tsx), the exact
-- two-step pattern Cassandra's premortem flagged as a data-integrity risk
-- for bills. Payday had the same bug live; this closes it the same way.
create or replace function public.confirm_payday_payment(
  p_amount numeric,
  p_payday_date date
) returns void
language plpgsql
security invoker
as $$
begin
  if not exists (select 1 from public.income_settings where user_id = auth.uid()) then
    raise exception 'Income settings not found';
  end if;

  insert into public.transactions (user_id, amount, description, category_id, occurred_at, is_income, skipped)
  values (auth.uid(), p_amount, 'Pay', null, p_payday_date, true, false);

  update public.income_settings set last_confirmed_payday = p_payday_date where user_id = auth.uid();
end;
$$;
