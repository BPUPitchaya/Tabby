-- Atomic confirm/skip for income_sources -- same reasoning as
-- confirm_bill_payment/skip_bill_payment (0023_add_bills.sql): logs the
-- income transaction AND advances last_confirmed_payday in one function
-- call, so a crash mid-confirm can't leave the two out of sync. Payday's
-- original confirm had exactly this two-step bug once (fixed in
-- 0025_add_confirm_payday_rpc.sql) -- this multi-source version starts
-- out atomic rather than repeating that mistake a third time.
create or replace function public.confirm_income_source_payment(
  p_source_id uuid,
  p_amount numeric,
  p_payday_date date
) returns void
language plpgsql
security invoker
as $$
declare
  v_source public.income_sources%rowtype;
begin
  select * into v_source from public.income_sources where id = p_source_id and user_id = auth.uid();
  if not found then
    raise exception 'Income source not found';
  end if;

  insert into public.transactions (user_id, amount, description, category_id, occurred_at, is_income, skipped)
  values (auth.uid(), p_amount, v_source.label, null, p_payday_date, true, false);

  update public.income_sources set last_confirmed_payday = p_payday_date where id = p_source_id;
end;
$$;

-- Skip -- logs a $0 flagged transaction (same "visible in history, not a
-- silent gap" reasoning as skip_bill_payment) for a cycle with no pay at
-- all (job hasn't started, between contracts) -- distinct from a normal
-- paid-hours entry, which always goes through confirm instead, sick/annual
-- leave included (see session notes: paid leave is still paid, not a skip).
create or replace function public.skip_income_source_payment(
  p_source_id uuid,
  p_payday_date date
) returns void
language plpgsql
security invoker
as $$
declare
  v_source public.income_sources%rowtype;
begin
  select * into v_source from public.income_sources where id = p_source_id and user_id = auth.uid();
  if not found then
    raise exception 'Income source not found';
  end if;

  insert into public.transactions (user_id, amount, description, category_id, occurred_at, is_income, skipped)
  values (auth.uid(), 0, v_source.label || ' (skipped)', null, p_payday_date, true, true);

  update public.income_sources set last_confirmed_payday = p_payday_date where id = p_source_id;
end;
$$;
