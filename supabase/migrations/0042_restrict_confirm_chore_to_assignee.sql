-- confirm_chore only checked flat membership, so anyone in the flat could
-- mark ANY chore done, not just their own -- no accountability. Now only
-- the person whose turn it currently is, or the flat admin (as a fix-a-
-- mistake override), can mark it done.
create or replace function public.confirm_chore(p_chore_id uuid, p_cycle_start date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chore public.chores%rowtype;
  v_next_index int;
  v_current_assignee uuid;
begin
  select * into v_chore from public.chores where id = p_chore_id;
  if not found then
    raise exception 'Chore not found';
  end if;

  if not public.is_flat_member(v_chore.flat_id) then
    raise exception 'Not a member of this flat';
  end if;

  if array_length(v_chore.assignee_order, 1) > 0 then
    v_current_assignee := v_chore.assignee_order[(v_chore.rotation_index % array_length(v_chore.assignee_order, 1)) + 1];
  end if;

  if v_current_assignee is distinct from auth.uid() and not public.is_flat_admin(v_chore.flat_id) then
    raise exception 'Only the person this chore is currently assigned to can mark it done';
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
