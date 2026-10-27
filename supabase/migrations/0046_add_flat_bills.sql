-- Recurring flat bills -- rent/power/internet, scheduled once instead of
-- re-entered by hand every cycle the way shared_expenses (0001_init.sql)
-- requires today. Same {frequency, pay_weekday, day_of_month,
-- last_confirmed_date} shape as bills.ts (personal) and chores.ts (flat),
-- reusing computeIncomeCycle via lib/flat-bills.ts, not duplicated here.
-- Admin-only create/edit/delete (same posture as chores); confirming a
-- cycle is a MEMBER action -- whoever actually paid it taps confirm, same
-- as addSharedExpense's own insert policy already allows any member to
-- log a shared expense.
--
-- Fixed amount only (no variable-amount mode like personal bills) --
-- splitting an unknown amount among members has no well-defined per-
-- member share until a real amount exists, so that mode is left out
-- rather than half-built.
create table public.flat_bills (
  id uuid primary key default gen_random_uuid(),
  flat_id uuid not null references public.flats(id) on delete cascade,
  name text not null,
  category_id uuid references public.categories(id),
  amount numeric not null check (amount > 0),
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly')),
  pay_weekday smallint check (pay_weekday >= 0 and pay_weekday <= 6),
  day_of_month smallint check (day_of_month >= 1 and day_of_month <= 31),
  last_confirmed_date date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.flat_bills enable row level security;

create policy "flat members can view flat bills"
  on public.flat_bills for select
  using (public.is_flat_member(flat_id));

create policy "flat admins can create flat bills"
  on public.flat_bills for insert
  with check (public.is_flat_admin(flat_id));

create policy "flat admins can edit flat bills"
  on public.flat_bills for update
  using (public.is_flat_admin(flat_id))
  with check (public.is_flat_admin(flat_id));

create policy "flat admins can delete flat bills"
  on public.flat_bills for delete
  using (public.is_flat_admin(flat_id));

grant select, insert, update, delete on public.flat_bills to authenticated;

-- Confirming logs a real shared_expense (and equal splits among every
-- CURRENT flat member) and advances last_confirmed_date, atomically --
-- same reasoning as confirm_bill_payment/confirm_chore: a crash between
-- two separate client calls must never leave logging and the cycle
-- cursor out of sync. security definer since a member confirming isn't
-- covered by the admin-only UPDATE policy above; validated internally
-- against is_flat_member instead of relying on RLS.
create or replace function public.confirm_flat_bill(p_bill_id uuid, p_due_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bill public.flat_bills%rowtype;
  v_expense_id uuid;
  v_member_count int;
  v_share numeric;
  v_member record;
begin
  select * into v_bill from public.flat_bills where id = p_bill_id;
  if not found then
    raise exception 'Bill not found';
  end if;

  if not public.is_flat_member(v_bill.flat_id) then
    raise exception 'Not a member of this flat';
  end if;

  select count(*) into v_member_count from public.flat_members where flat_id = v_bill.flat_id;
  if v_member_count = 0 then
    raise exception 'No members to split this bill between';
  end if;
  v_share := round(v_bill.amount / v_member_count, 2);

  insert into public.shared_expenses (flat_id, paid_by, category_id, amount, description, occurred_at)
  values (v_bill.flat_id, auth.uid(), v_bill.category_id, v_bill.amount, v_bill.name, p_due_date)
  returning id into v_expense_id;

  for v_member in select user_id from public.flat_members where flat_id = v_bill.flat_id loop
    insert into public.shared_expense_splits (shared_expense_id, user_id, share_amount)
    values (v_expense_id, v_member.user_id, v_share);
  end loop;

  update public.flat_bills set last_confirmed_date = p_due_date where id = p_bill_id;
end;
$$;

revoke all on function public.confirm_flat_bill(uuid, date) from public;
grant execute on function public.confirm_flat_bill(uuid, date) to authenticated;
