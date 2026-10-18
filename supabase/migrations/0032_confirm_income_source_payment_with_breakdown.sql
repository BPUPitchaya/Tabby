-- Extends confirm_income_source_payment (0029) to optionally store a
-- payslip-style breakdown on the logged transaction -- gross/net-tracked
-- sources pass one, gross-tracked sources pass nulls (every new param
-- defaults null, so this isn't a breaking change for existing callers).
create or replace function public.confirm_income_source_payment(
  p_source_id uuid,
  p_amount numeric,
  p_payday_date date,
  p_gross_amount numeric default null,
  p_income_tax numeric default null,
  p_acc_levy numeric default null,
  p_student_loan numeric default null,
  p_kiwisaver_amount numeric default null,
  p_hours_paid numeric default null
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
