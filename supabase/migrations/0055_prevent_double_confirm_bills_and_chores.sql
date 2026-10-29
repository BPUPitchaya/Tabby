-- Found in code review: neither confirm_flat_bill nor confirm_chore
-- guarded against confirming the same cycle twice.
--
-- confirm_flat_bill: two flatmates tapping Confirm for the same bill cycle
-- (a race, or a retried request) created TWO shared_expenses, each paid by
-- a different person -- double-logging the bill and leaving balances
-- wrong.
--
-- confirm_chore: once A confirms a cycle, B becomes the current assignee
-- and the function's own assignee check now passes for them -- nothing
-- stopped B (or an admin override) from confirming that SAME cycle again,
-- silently advancing rotation_index a second time and skipping B's actual
-- turn with no record anyone did it.
--
-- Fix: both now raise if the cycle being confirmed is not strictly after
-- the row's own last_confirmed_date, same "already confirmed" guard shape.

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

  if v_bill.last_confirmed_date is not null and p_due_date <= v_bill.last_confirmed_date then
    raise exception 'This bill has already been confirmed for this cycle';
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

create or replace function public.confirm_chore(p_chore_id uuid, p_cycle_start date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chore public.chores%rowtype;
  v_next_index int;
  v_current_assignee uuid;
begin
  select * into v_chore from public.chores where id = p_chore_id;
  if not found then
    raise exception 'Chore not found';
  end if;

  if not public.is_flat_member(v_chore.flat_id) then
    raise exception 'Not a member of this flat';
  end if;

  if v_chore.last_confirmed_date is not null and p_cycle_start <= v_chore.last_confirmed_date then
    raise exception 'This chore has already been confirmed for this cycle';
  end if;

  if array_length(v_chore.assignee_order, 1) > 0 then
    v_current_assignee := v_chore.assignee_order[(v_chore.rotation_index % array_length(v_chore.assignee_order, 1)) + 1];
  end if;

  if v_current_assignee is distinct from auth.uid() and not public.is_flat_admin(v_chore.flat_id) then
    raise exception 'Only the person this chore is currently assigned to can mark it done';
  end if;

  v_next_index := case
    when v_chore.assignment_mode = 'rotating' and array_length(v_chore.assignee_order, 1) > 1
      then v_chore.rotation_index + 1
    else v_chore.rotation_index
  end;

  update public.chores
  set last_confirmed_date = p_cycle_start, rotation_index = v_next_index
  where id = p_chore_id;
end;
$$;
