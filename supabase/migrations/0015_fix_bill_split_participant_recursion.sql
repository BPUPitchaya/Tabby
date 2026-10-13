-- Fixes "new row violates row-level security policy for table bill_splits"
-- on every create -- root cause found by direct SQL testing (see session
-- notes): is_bill_split_participant() queried public.bill_splits from
-- inside bill_splits's own SELECT policy. That self-reference broke
-- visibility of the row just inserted specifically when RETURNING an
-- actual column (RETURNING a literal, or any other table's RETURNING,
-- worked fine -- only this table's self-referential policy failed).
--
-- Fix: the "am I the creator" half of the check never needed a subquery
-- at all -- created_by is a column on the row already being evaluated.
-- Only the "does someone owe me" half needs to look at a different table
-- (bill_split_shares), which isn't self-referential and was never the
-- problem.
create or replace function public.is_bill_split_participant(target_bill_split_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.bill_split_shares s
    where s.bill_split_id = target_bill_split_id and s.owed_by_user_id = auth.uid()
  );
$$;

drop policy "participants can view a bill split" on public.bill_splits;

create policy "participants can view a bill split"
  on public.bill_splits for select
  to authenticated
  using (created_by = auth.uid() or public.is_bill_split_participant(id));
