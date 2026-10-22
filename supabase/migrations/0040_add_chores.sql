-- Flat chores: recurring (weekly/biweekly/monthly, same cadence shape as
-- bills), assigned either to one fixed person or rotating through a list
-- of flat members. Cycle/due-date math reuses computeIncomeCycle via
-- lib/chores.ts, same as bills.ts already does -- not duplicated here.
create table public.chores (
  id uuid primary key default gen_random_uuid(),
  flat_id uuid not null references public.flats(id) on delete cascade,
  name text not null,
  frequency text not null check (frequency in ('weekly', 'biweekly', 'monthly')),
  pay_weekday smallint check (pay_weekday >= 0 and pay_weekday <= 6),
  day_of_month smallint check (day_of_month >= 1 and day_of_month <= 31),
  assignment_mode text not null default 'fixed' check (assignment_mode in ('fixed', 'rotating')),
  -- Ordered flat_members.user_id list this chore cycles through -- one id
  -- for 'fixed', two or more for 'rotating'. Whose turn it is right now:
  -- assignee_order[rotation_index % length] (lib/chores.ts).
  assignee_order uuid[] not null default '{}',
  rotation_index int not null default 0,
  -- Most recent CYCLE START DATE this chore was marked done for -- same
  -- role and convention as bills.last_confirmed_date.
  last_confirmed_date date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.chores enable row level security;

create policy "flat members can view chores"
  on public.chores for select
  using (public.is_flat_member(flat_id));

create policy "flat admins can create chores"
  on public.chores for insert
  with check (public.is_flat_admin(flat_id));

create policy "flat admins can edit chores"
  on public.chores for update
  using (public.is_flat_admin(flat_id))
  with check (public.is_flat_admin(flat_id));

create policy "flat admins can delete chores"
  on public.chores for delete
  using (public.is_flat_admin(flat_id));

-- Marking a chore done is a MEMBER action (anyone in the flat can do
-- their own chore), deliberately separate from editing the chore's
-- definition (admin-only, via the plain UPDATE policy above). security
-- definer so this one narrow, validated action can advance
-- last_confirmed_date/rotation_index without having to make the whole
-- row member-writable -- same "keep the privileged grant narrow" lesson
-- as 0038_grant_service_role_ai_proxy_usage.sql.
create or replace function public.confirm_chore(p_chore_id uuid, p_cycle_start date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chore public.chores%rowtype;
  v_next_index int;
begin
  select * into v_chore from public.chores where id = p_chore_id;
  if not found then
    raise exception 'Chore not found';
  end if;

  if not public.is_flat_member(v_chore.flat_id) then
    raise exception 'Not a member of this flat';
  end if;

  v_next_index := case
    when v_chore.assignment_mode = 'rotating' and array_length(v_chore.assignee_order, 1) > 1
      then v_chore.rotation_index + 1
    else v_chore.rotation_index
  end;

  update public.chores
  set last_confirmed_date = p_cycle_start, rotation_index = v_next_index
  where id = p_chore_id;
end;
$$;
