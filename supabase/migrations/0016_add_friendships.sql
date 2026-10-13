-- Friends/contacts: a persistent, consent-based relationship so bill
-- splits remember who you've split with before instead of re-adding a
-- guest by name every time. See session design notes (premortem) for why
-- this is consent-based rather than a one-sided add:
--   1. adding a friend requires them to accept -- never instant, same
--      posture as a flat invite rather than silently linking two accounts.
--   2. a split share aimed at a real account (friend or otherwise) now
--      starts 'proposed' and only becomes a real pending debt once that
--      person accepts -- a request is a proposal, not an instant claim.
--      Guest shares (no account to ask) are unaffected, still 'pending'.
-- No separate "friends table duplicate of flat members" problem: the
-- Split screen's people picker is meant to union flat_members + accepted
-- friendships client-side, not store a third copy of the relationship.

-- ============================================================
-- 1. friendships
-- ============================================================
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint friendships_not_self check (requester_id <> addressee_id)
);

-- One row per pair regardless of who requested or direction -- stops
-- duplicate/parallel requests between the same two people. The app
-- updates this row in place (e.g. re-requesting after a decline) rather
-- than inserting a second one.
create unique index friendships_pair_unique
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

create index friendships_requester_id_idx on public.friendships (requester_id);
create index friendships_addressee_id_idx on public.friendships (addressee_id);

alter table public.friendships enable row level security;

-- No helper function needed here (unlike bill_splits' participant check)
-- -- both sides of a friendship are plain columns on the row itself, so
-- RLS can compare them directly without a self-referential subquery.
create policy "participants can view their friendship"
  on public.friendships for select
  to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

create policy "users can send a friend request"
  on public.friendships for insert
  to authenticated
  with check (requester_id = auth.uid());

create policy "addressee can accept or decline a request"
  on public.friendships for update
  to authenticated
  using (addressee_id = auth.uid())
  with check (addressee_id = auth.uid());

-- Either side can remove the relationship -- cancel a pending request
-- (requester) or end an accepted friendship (either). This never touches
-- bill_split_shares, which references owed_by_user_id directly: removing
-- a friendship doesn't erase or orphan past splits with that person.
create policy "either participant can remove the friendship"
  on public.friendships for delete
  to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

grant select, insert, update, delete on public.friendships to authenticated;

-- ============================================================
-- 2. bill_split_shares -- a share on a real account now starts
--    'proposed' instead of landing straight in 'pending'
-- ============================================================
alter table public.bill_split_shares drop constraint bill_split_shares_status_check;
alter table public.bill_split_shares
  add constraint bill_split_shares_status_check check (status in ('proposed', 'pending', 'paid', 'declined'));
