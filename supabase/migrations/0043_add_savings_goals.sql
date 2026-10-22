-- Savings goals -- save toward something specific ("$500 for a trip by
-- March"), tracked via real logged contributions rather than a single
-- mutable "amount saved" field, so a correction never silently overwrites
-- history (same reasoning bills already uses: confirm logs a real
-- transaction row, not just a flag flip). Single-user, not flat-scoped,
-- so RLS is the simple user_id = auth.uid() shape bills already uses --
-- no admin/member split needed.
create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  target_amount numeric not null check (target_amount > 0),
  target_date date,
  created_at timestamptz not null default now()
);

create table public.savings_goal_contributions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.savings_goals(id) on delete cascade,
  amount numeric not null check (amount > 0),
  occurred_at date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.savings_goals enable row level security;
alter table public.savings_goal_contributions enable row level security;

create policy "savings_goals_select_own" on public.savings_goals for select using (user_id = auth.uid());
create policy "savings_goals_insert_own" on public.savings_goals for insert with check (user_id = auth.uid());
create policy "savings_goals_update_own" on public.savings_goals for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "savings_goals_delete_own" on public.savings_goals for delete using (user_id = auth.uid());

-- Ownership of a contribution runs through its parent goal's user_id --
-- only the goal's own owner can see or add to it.
create policy "savings_goal_contributions_select_own" on public.savings_goal_contributions for select
  using (exists (select 1 from public.savings_goals g where g.id = goal_id and g.user_id = auth.uid()));
create policy "savings_goal_contributions_insert_own" on public.savings_goal_contributions for insert
  with check (exists (select 1 from public.savings_goals g where g.id = goal_id and g.user_id = auth.uid()));
create policy "savings_goal_contributions_delete_own" on public.savings_goal_contributions for delete
  using (exists (select 1 from public.savings_goals g where g.id = goal_id and g.user_id = auth.uid()));

-- Table-level GRANT is separate from RLS and does not follow from it --
-- learned twice already this project (0038, 0041): RLS restricts which
-- rows a role can touch, but Postgres still requires this baseline grant
-- before authenticated can touch the table AT ALL. Included here from
-- the start instead of as a follow-up fix.
grant select, insert, update, delete on public.savings_goals to authenticated;
grant select, insert, delete on public.savings_goal_contributions to authenticated;
