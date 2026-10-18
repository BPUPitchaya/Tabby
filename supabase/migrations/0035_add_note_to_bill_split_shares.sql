-- Optional reference note on a share's own confirm -- e.g. a bank
-- reference or "paid via cash" -- so the other side has something to
-- cross-check against their own bank app, cheaper than the screenshot+
-- transaction-ID idea this was weighed against (see session notes:
-- unverifiable and a real data-liability risk for what it actually
-- proves). Captured on the ower's confirm, since they're the one with a
-- real reference to give; the payee just reads it.
alter table public.bill_split_shares add column note text;

create or replace function public.confirm_share_paid_by_ower(p_share_id uuid, p_note text default null)
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
    note = coalesce(p_note, note),
    status = case when payee_confirmed_at is not null then 'paid' else status end,
    paid_at = case when payee_confirmed_at is not null then now() else paid_at end
  where id = p_share_id;
end;
$$;
