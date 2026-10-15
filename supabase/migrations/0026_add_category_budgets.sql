-- Per-category budget caps, optional and opt-in: no category starts with
-- one, the user adds a cap to whichever categories they actually want to
-- track. Deliberately its own table, never a column on the shared
-- `categories` table -- categories are a shared lookup used across
-- transactions, bills, and bill splits, and a budget cap is personal
-- account data, same reasoning as payment_details living in its own table
-- rather than on `profiles` (0021_move_payment_details_to_own_table.sql).
create table public.category_budgets (
  user_id uuid not null references public.profiles(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  amount numeric not null check (amount > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, category_id)
);

alter table public.category_budgets enable row level security;

create policy "category_budgets_select_own" on public.category_budgets
  for select using (user_id = auth.uid());
create policy "category_budgets_insert_own" on public.category_budgets
  for insert with check (user_id = auth.uid());
create policy "category_budgets_update_own" on public.category_budgets
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "category_budgets_delete_own" on public.category_budgets
  for delete using (user_id = auth.uid());

grant select, insert, update, delete on public.category_budgets to authenticated;
