-- payment_details lived on profiles, which has a blanket "any
-- authenticated user can read any row" select policy (0001_init.sql,
-- written back when the only column that mattered was display_name).
-- RLS is row-level, not column-level, so that policy also exposed bank
-- account details to every signed-in user, not just the account owner --
-- nothing in the app's UI queried someone else's payment_details, but the
-- database itself allowed it to anyone with a session. Moving it to its
-- own table with an owner-only policy closes that off at the data layer,
-- not just by convention in the client code.
--
-- No data migrated: payment_details was only ever null in production
-- (confirmed before writing this migration) -- this onboarding flow
-- shipped and got reverted to a safer shape in the same session.

alter table public.profiles drop column payment_details;

create table public.payment_details (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  details text not null,
  updated_at timestamptz not null default now()
);

alter table public.payment_details enable row level security;

-- Owner only, full stop -- not even a friend or someone they've split a
-- bill with can read this row directly. The only path anyone else ever
-- sees these details is the owner's own device putting them into an
-- outgoing reminder message (see money-owing-modal.tsx / index.tsx),
-- never a database read on the recipient's side.
create policy "users can manage their own payment details"
  on public.payment_details for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.payment_details to authenticated;
