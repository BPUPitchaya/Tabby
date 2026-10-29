-- Found in code review: both friendships write policies only checked WHO
-- was writing, never WHAT they were allowed to write -- the same root
-- cause as the flat_members and bill_split_shares gaps fixed earlier.
--
-- 1. "users can send a friend request" let a direct insert set
--    status='accepted' immediately, skipping the other person's consent
--    entirely -- defeating the whole point of this being a consent-based
--    relationship (see 0016's own design comment).
-- 2. "addressee can accept or decline a request" only checked
--    addressee_id = auth.uid() on both the existing row and the new one --
--    it never restricted which row's requester_id could be changed to.
--    An addressee could update requester_id to an arbitrary other user X
--    and set status='accepted', fabricating a friendship with X who never
--    consented to anything.
-- 3. Real bug, not just a security gap: reviving a declined request (see
--    sendFriendRequestTo's comment) updates the existing row, but only the
--    row's *current* addressee can update it under that same policy -- so
--    if the original requester tries to re-request after being declined,
--    the update matches zero rows and silently does nothing (no error),
--    while the UI reports success.
--
-- Fix: move every friendship write through two narrow security-definer
-- RPCs that enforce the actual rules (always starts/stays 'pending' until
-- the real addressee responds, requester is always the caller) instead of
-- trusting client-supplied row values. Direct insert/update from the
-- client is removed entirely; select and delete are unaffected, both were
-- already correctly scoped.

drop policy "users can send a friend request" on public.friendships;
drop policy "addressee can accept or decline a request" on public.friendships;

create function public.request_friendship(p_addressee_id uuid)
returns public.friendships
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester uuid := auth.uid();
  v_row public.friendships%rowtype;
begin
  if p_addressee_id = v_requester then
    raise exception 'That''s you.';
  end if;

  select * into v_row from public.friendships
  where least(requester_id, addressee_id) = least(v_requester, p_addressee_id)
    and greatest(requester_id, addressee_id) = greatest(v_requester, p_addressee_id);

  if found then
    if v_row.status = 'accepted' then
      raise exception 'You''re already friends.';
    end if;
    if v_row.status = 'pending' then
      raise exception 'A request is already pending with that person.';
    end if;
    -- declined -- revive as a fresh request from whoever is calling now,
    -- regardless of which side originally requested.
    update public.friendships
    set status = 'pending', requester_id = v_requester, addressee_id = p_addressee_id, responded_at = null
    where id = v_row.id
    returning * into v_row;
    return v_row;
  end if;

  insert into public.friendships (requester_id, addressee_id)
  values (v_requester, p_addressee_id)
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.request_friendship(uuid) from public;
grant execute on function public.request_friendship(uuid) to authenticated;

create function public.respond_to_friend_request(p_friendship_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.friendships
  set status = case when p_accept then 'accepted' else 'declined' end,
      responded_at = now()
  where id = p_friendship_id and addressee_id = auth.uid() and status = 'pending';

  if not found then
    raise exception 'Request not found or already responded to.';
  end if;
end;
$$;

revoke all on function public.respond_to_friend_request(uuid, boolean) from public;
grant execute on function public.respond_to_friend_request(uuid, boolean) to authenticated;
