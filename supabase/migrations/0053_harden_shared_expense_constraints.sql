-- Found in code review:
--
-- 1. shared_expenses had no amount > 0 check, and its UPDATE policy had no
--    explicit WITH CHECK -- Postgres defaults that to the USING expression
--    (paid_by = auth.uid()), which says nothing about flat_id. A payer
--    could silently move their own expense to a flat they're not even a
--    member of, changing what everyone else in both flats owes.
-- 2. shared_expense_splits' "payer can manage splits on their own expense"
--    ALL policy only checked that the parent expense belongs to the
--    caller -- nothing restricted share_amount (could be negative or far
--    more than the expense total) or required user_id to actually be a
--    member of that expense's flat.
--
-- The app's own client code (flats.ts addSharedExpense/updateSharedExpense)
-- never changes flat_id/paid_by on update and only ever inserts
-- always-positive equal splits for real flat members -- none of this
-- changes legitimate behavior, it closes what a direct API call could do
-- that the UI never does.

alter table public.shared_expenses add constraint shared_expenses_amount_positive check (amount > 0);
alter table public.shared_expense_splits add constraint shared_expense_splits_amount_positive check (share_amount > 0);

-- Column-level grant rather than a trigger: freezes flat_id and paid_by
-- from ever being changed via a direct client update, while amount/
-- description/category_id/occurred_at (the only columns the real edit flow
-- touches) stay updatable.
revoke update on public.shared_expenses from authenticated;
grant update (amount, description, category_id, occurred_at) on public.shared_expenses to authenticated;

drop policy "payer can manage splits on their own expense" on public.shared_expense_splits;

create policy "payer can manage splits on their own expense"
  on public.shared_expense_splits for all
  to authenticated
  using (
    exists (
      select 1 from public.shared_expenses se
      where se.id = shared_expense_id and se.paid_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.shared_expenses se
      where se.id = shared_expense_id
        and se.paid_by = auth.uid()
        and public.is_flat_member_user(se.flat_id, user_id)
    )
  );
