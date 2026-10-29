-- Found in code review: confirm_share_paid_by_ower/confirm_share_paid_by_payee
-- are security invoker, so RLS is their real gate -- but the blanket "a user
-- can mark their own share paid" UPDATE policy they were relying on allows
-- a full-row update on ANY share owned_by_user_id = auth.uid(), with no
-- restriction on which columns or what status it moves to. That meant a
-- user could skip both RPCs entirely and run a raw update on their own
-- share setting status='paid' and payee_confirmed_at directly -- settling a
-- bill without the payee ever confirming anything, defeating the whole
-- two-step confirmation 0034/0035 added.
--
-- Fix: make both RPCs security definer -- they already do their own
-- explicit authorization check internally (the WHERE clause on the SELECT),
-- so RLS was never really protecting anything inside them anyway. Narrow
-- the blanket policy to the one legitimate direct update it still needs to
-- cover: an ower responding to a still-*proposed* share (accept -> pending,
-- or decline). That transition can only ever land on 'pending' or
-- 'declined', never 'paid', and only applies to a row that is currently
-- 'proposed' -- so it can no longer be used to settle a share at all, with
-- or without going through a confirm RPC.

drop policy "a user can mark their own share paid" on public.bill_split_shares;

create policy "a user can respond to their own proposed share"
  on public.bill_split_shares for update
  to authenticated
  using (owed_by_user_id = auth.uid() and status = 'proposed')
  with check (owed_by_user_id = auth.uid() and status in ('pending', 'declined'));

create or replace function public.confirm_share_paid_by_ower(p_share_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
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
    note = coalesce(p_note, note),
    status = case when payee_confirmed_at is not null then 'paid' else status end,
    paid_at = case when payee_confirmed_at is not null then now() else paid_at end
  where id = p_share_id;
end;
$$;

revoke all on function public.confirm_share_paid_by_ower(uuid, text) from public;
grant execute on function public.confirm_share_paid_by_ower(uuid, text) to authenticated;

create or replace function public.confirm_share_paid_by_payee(p_share_id uuid)
returns void
language plpgsql
security definer
set search_path = public
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

revoke all on function public.confirm_share_paid_by_payee(uuid) from public;
grant execute on function public.confirm_share_paid_by_payee(uuid) to authenticated;
