-- Ad-hoc bill splitting: "went out with a group, split the bill" -- distinct
-- from shared_expenses (0001_init.sql), which is ongoing flat/household
-- costs among known flat members only. This is a one-off split that can
-- include anyone, flatmate or not, app user or not:
--   - owed_by_user_id set: a real Tabby user (any user, not just flatmates)
--   - owed_by_user_id null + guest_name set: someone without the app,
--     settled via a tap-to-send share link (share_token) instead of a
--     push notification -- see the follow-up Edge Function for that page.
-- Kept as its own table group rather than extending shared_expenses so the
-- existing flat-balance logic in flats.ts stays untouched.

-- ============================================================
-- 1. bill_splits (one per outing/receipt)
-- ============================================================
create table public.bill_splits (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  merchant text,
  total_amount numeric(12, 2) not null check (total_amount > 0),
  occurred_at date not null default current_date,
  created_at timestamptz not null default now()
);

create index bill_splits_created_by_idx on public.bill_splits (created_by);

alter table public.bill_splits enable row level security;

-- ============================================================
-- 2. bill_split_items (optional line-item detail, e.g. from a receipt scan)
-- ============================================================
create table public.bill_split_items (
  id uuid primary key default gen_random_uuid(),
  bill_split_id uuid not null references public.bill_splits (id) on delete cascade,
  description text not null,
  amount numeric(12, 2) not null
);

create index bill_split_items_bill_split_id_idx on public.bill_split_items (bill_split_id);

alter table public.bill_split_items enable row level security;

-- ============================================================
-- 3. bill_split_shares (who owes how much)
-- ============================================================
create table public.bill_split_shares (
  id uuid primary key default gen_random_uuid(),
  bill_split_id uuid not null references public.bill_splits (id) on delete cascade,
  owed_by_user_id uuid references public.profiles (id) on delete cascade,
  guest_name text,
  amount_owed numeric(12, 2) not null check (amount_owed > 0),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  -- Short random token for the public, no-login "you owe $X, mark as paid"
  -- link sent to guests. Not a secret in the security sense (same spirit
  -- as flats.invite_code) -- worst case someone marks a $12 dinner share
  -- paid early, there's no money movement or account access behind it.
  share_token text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  constraint bill_split_shares_has_owner check (owed_by_user_id is not null or guest_name is not null)
);

create index bill_split_shares_bill_split_id_idx on public.bill_split_shares (bill_split_id);
create index bill_split_shares_owed_by_user_id_idx on public.bill_split_shares (owed_by_user_id);

alter table public.bill_split_shares enable row level security;

-- ============================================================
-- 4. RLS
-- ============================================================

-- helper: is the current user the creator of a bill split, or does
-- someone owe a share on it (as a real user, not a guest)? Both sides of
-- a split should be able to see it -- same transparency Splitwise-style
-- group splitting apps default to within one outing.
create function public.is_bill_split_participant(target_bill_split_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.bill_splits bs
    where bs.id = target_bill_split_id and bs.created_by = auth.uid()
  ) or exists (
    select 1 from public.bill_split_shares s
    where s.bill_split_id = target_bill_split_id and s.owed_by_user_id = auth.uid()
  );
$$;

create policy "participants can view a bill split"
  on public.bill_splits for select
  to authenticated
  using (public.is_bill_split_participant(id));

create policy "users can create their own bill splits"
  on public.bill_splits for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "creator can edit or delete their own bill split"
  on public.bill_splits for update
  to authenticated
  using (created_by = auth.uid());

create policy "creator can delete their own bill split"
  on public.bill_splits for delete
  to authenticated
  using (created_by = auth.uid());

create policy "participants can view bill split items"
  on public.bill_split_items for select
  to authenticated
  using (public.is_bill_split_participant(bill_split_id));

create policy "creator can manage bill split items"
  on public.bill_split_items for all
  to authenticated
  using (
    exists (
      select 1 from public.bill_splits bs
      where bs.id = bill_split_id and bs.created_by = auth.uid()
    )
  );

create policy "participants can view bill split shares"
  on public.bill_split_shares for select
  to authenticated
  using (public.is_bill_split_participant(bill_split_id));

create policy "creator can manage bill split shares"
  on public.bill_split_shares for all
  to authenticated
  using (
    exists (
      select 1 from public.bill_splits bs
      where bs.id = bill_split_id and bs.created_by = auth.uid()
    )
  );

-- a user can mark their own share paid without being the creator
create policy "a user can mark their own share paid"
  on public.bill_split_shares for update
  to authenticated
  using (owed_by_user_id = auth.uid())
  with check (owed_by_user_id = auth.uid());

-- ============================================================
-- 5. grants
-- ============================================================
-- No grants to anon, same posture as 0002_grants.sql -- the guest
-- "mark as paid" share-link page goes through a service-role Edge
-- Function (token-gated, bypasses RLS deliberately) rather than direct
-- anon table access.
grant select, insert, update, delete on
  public.bill_splits,
  public.bill_split_items,
  public.bill_split_shares
to authenticated;
