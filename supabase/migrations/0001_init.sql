-- Tabby initial schema
-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run

-- ============================================================
-- 1. profiles (extends auth.users with public-safe info)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are viewable by any authenticated user"
  on public.profiles for select
  to authenticated
  using (true);

create policy "users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid());

-- auto-create a profile row whenever someone signs up
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- 2. categories (global defaults + user-custom)
-- ============================================================
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade, -- null = global default
  name text not null,
  icon text,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

create policy "categories are viewable by owner or if global"
  on public.categories for select
  to authenticated
  using (user_id is null or user_id = auth.uid());

create policy "users can manage their own categories"
  on public.categories for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

insert into public.categories (user_id, name, icon) values
  (null, 'Groceries', 'shopping-cart'),
  (null, 'Utilities', 'zap'),
  (null, 'Rent/Housing', 'home'),
  (null, 'Transport', 'car'),
  (null, 'Dining Out', 'coffee'),
  (null, 'Entertainment', 'film'),
  (null, 'Health', 'heart'),
  (null, 'Other', 'tag');

-- ============================================================
-- 3. transactions (personal, includes shared-expense shares)
-- ============================================================
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category_id uuid references public.categories (id),
  amount numeric(12, 2) not null,
  description text,
  occurred_at date not null default current_date,
  shared_expense_id uuid, -- set if this row was generated from a flat shared expense
  created_at timestamptz not null default now()
);

create index transactions_user_id_idx on public.transactions (user_id);

alter table public.transactions enable row level security;

create policy "users can manage their own transactions"
  on public.transactions for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- 4. flats (household groups)
-- ============================================================
create table public.flats (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

alter table public.flats enable row level security;

-- ============================================================
-- 5. flat_members
-- ============================================================
create table public.flat_members (
  id uuid primary key default gen_random_uuid(),
  flat_id uuid not null references public.flats (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  unique (flat_id, user_id)
);

alter table public.flat_members enable row level security;

-- helper: is the current user a member of a given flat?
create function public.is_flat_member(target_flat_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.flat_members
    where flat_id = target_flat_id and user_id = auth.uid()
  );
$$;

create policy "flat members can view their flat"
  on public.flats for select
  to authenticated
  using (public.is_flat_member(id));

create policy "authenticated users can create a flat"
  on public.flats for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "flat members can view membership list"
  on public.flat_members for select
  to authenticated
  using (public.is_flat_member(flat_id));

create policy "users can join a flat themselves"
  on public.flat_members for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "users can leave a flat themselves"
  on public.flat_members for delete
  to authenticated
  using (user_id = auth.uid());

-- ============================================================
-- 6. shared_expenses + splits
-- ============================================================
create table public.shared_expenses (
  id uuid primary key default gen_random_uuid(),
  flat_id uuid not null references public.flats (id) on delete cascade,
  paid_by uuid not null references public.profiles (id),
  category_id uuid references public.categories (id),
  amount numeric(12, 2) not null,
  description text,
  occurred_at date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.shared_expenses enable row level security;

create policy "flat members can view shared expenses"
  on public.shared_expenses for select
  to authenticated
  using (public.is_flat_member(flat_id));

create policy "flat members can add shared expenses"
  on public.shared_expenses for insert
  to authenticated
  with check (public.is_flat_member(flat_id) and paid_by = auth.uid());

create policy "payer can edit or delete their own shared expense"
  on public.shared_expenses for update
  to authenticated
  using (paid_by = auth.uid());

create policy "payer can delete their own shared expense"
  on public.shared_expenses for delete
  to authenticated
  using (paid_by = auth.uid());

create table public.shared_expense_splits (
  id uuid primary key default gen_random_uuid(),
  shared_expense_id uuid not null references public.shared_expenses (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  share_amount numeric(12, 2) not null,
  unique (shared_expense_id, user_id)
);

alter table public.shared_expense_splits enable row level security;

create policy "flat members can view splits"
  on public.shared_expense_splits for select
  to authenticated
  using (
    exists (
      select 1 from public.shared_expenses se
      where se.id = shared_expense_id and public.is_flat_member(se.flat_id)
    )
  );

create policy "payer can manage splits on their own expense"
  on public.shared_expense_splits for all
  to authenticated
  using (
    exists (
      select 1 from public.shared_expenses se
      where se.id = shared_expense_id and se.paid_by = auth.uid()
    )
  );

-- ============================================================
-- 7. settlements (who paid whom back)
-- ============================================================
create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  flat_id uuid not null references public.flats (id) on delete cascade,
  from_user uuid not null references public.profiles (id),
  to_user uuid not null references public.profiles (id),
  amount numeric(12, 2) not null,
  note text,
  settled_at timestamptz not null default now()
);

alter table public.settlements enable row level security;

create policy "flat members can view settlements"
  on public.settlements for select
  to authenticated
  using (public.is_flat_member(flat_id));

create policy "either party can record a settlement"
  on public.settlements for insert
  to authenticated
  with check (public.is_flat_member(flat_id) and (from_user = auth.uid() or to_user = auth.uid()));
