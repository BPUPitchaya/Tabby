-- Minimal, purpose-built log for one decision: do solo (no-flat) users
-- actually open the Flat tab more than once, or is it just ignored?
-- Not a general events table -- scope this down if other analytics needs
-- come up later rather than growing it into one.
create table public.flat_tab_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  has_flat boolean not null,
  viewed_at timestamptz not null default now()
);

alter table public.flat_tab_views enable row level security;

-- Insert-only from the client, by the viewing user themselves. No select
-- policy on purpose -- the client has no reason to read this back; it's
-- queried for analysis via the Supabase dashboard/service role instead.
create policy "users can log their own flat tab views"
  on public.flat_tab_views for insert
  to authenticated
  with check (user_id = auth.uid());

grant insert on public.flat_tab_views to authenticated;
