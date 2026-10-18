-- Two-step settle: a share used to flip straight to 'paid' from a single
-- tap by either side (the ower marking their own debt paid, or the payee
-- marking someone else's share paid on their behalf) -- whoever tapped
-- first unilaterally closed it, no second confirmation needed. Now both
-- sides confirm independently; status only becomes 'paid' once both have.
-- A guest share (no owed_by_user_id, no app account to confirm from) keeps
-- settling on the payee's confirm alone -- there's no second party to ask.
alter table public.bill_split_shares add column ower_confirmed_at timestamptz;
alter table public.bill_split_shares add column payee_confirmed_at timestamptz;

-- Backfill: a share already marked 'paid' under the old single-tap rule
-- gets both timestamps set to paid_at, so existing history doesn't show
-- as half-confirmed.
update public.bill_split_shares
set ower_confirmed_at = paid_at, payee_confirmed_at = paid_at
where status = 'paid';

-- security invoker + RLS's own "a user can mark their own share paid"
-- policy (owed_by_user_id = auth.uid()) gates who may call this.
create or replace function public.confirm_share_paid_by_ower(p_share_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  v_share public.bill_split_shares%rowtype;
begin
  select * into v_share from public.bill_split_shares
  where id = p_share_id and owed_by_user_id = auth.uid();
  if not found then
    raise exception 'Share not found';
  end if;

  update public.bill_split_shares
  set
    ower_confirmed_at = now(),
    status = case when payee_confirmed_at is not null then 'paid' else status end,
    paid_at = case when payee_confirmed_at is not null then now() else paid_at end
  where id = p_share_id;
end;
$$;

-- Gated by "creator can manage bill split shares" (the bill_split's
-- created_by = auth.uid()). A guest share (no account on the other side)
-- settles on this confirm alone -- there's nobody else who could confirm.
create or replace function public.confirm_share_paid_by_payee(p_share_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  v_share public.bill_split_shares%rowtype;
begin
  select s.* into v_share from public.bill_split_shares s
  join public.bill_splits bs on bs.id = s.bill_split_id
  where s.id = p_share_id and bs.created_by = auth.uid();
  if not found then
    raise exception 'Share not found';
  end if;

  update public.bill_split_shares
  set
    payee_confirmed_at = now(),
    status = case
      when owed_by_user_id is null or ower_confirmed_at is not null then 'paid'
      else status
    end,
    paid_at = case
      when owed_by_user_id is null or ower_confirmed_at is not null then now()
      else paid_at
    end
  where id = p_share_id;
end;
$$;
