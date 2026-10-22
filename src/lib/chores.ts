// Flat chores -- schedule a recurring (weekly/biweekly/monthly) chore,
// assigned to one fixed person or rotating through a list of flat
// members. Cycle math reuses computeIncomeCycle from profile.ts, same
// as bills.ts already does -- not duplicated here. See
// 0040_add_chores.sql for why admin-only create/edit/delete and
// member-level "mark done" are split across the table's own RLS and the
// confirm_chore RPC.
import { supabase } from '@/lib/supabase';
import { computeIncomeCycle, type IncomeCycle, type IncomeFrequency } from '@/lib/profile';

export type AssignmentMode = 'fixed' | 'rotating';

export type Chore = {
  id: string;
  flatId: string;
  name: string;
  frequency: IncomeFrequency;
  payWeekday: number | null;
  dayOfMonth: number | null;
  assignmentMode: AssignmentMode;
  // Ordered flat_members.user_id list this chore cycles through -- one
  // id for 'fixed', two or more for 'rotating'.
  assigneeOrder: string[];
  rotationIndex: number;
  lastConfirmedDate: string | null;
};

function fromRow(row: {
  id: string;
  flat_id: string;
  name: string;
  frequency: IncomeFrequency;
  pay_weekday: number | null;
  day_of_month: number | null;
  assignment_mode: AssignmentMode;
  assignee_order: string[] | null;
  rotation_index: number;
  last_confirmed_date: string | null;
}): Chore {
  return {
    id: row.id,
    flatId: row.flat_id,
    name: row.name,
    frequency: row.frequency,
    payWeekday: row.pay_weekday,
    dayOfMonth: row.day_of_month,
    assignmentMode: row.assignment_mode,
    assigneeOrder: row.assignee_order ?? [],
    rotationIndex: row.rotation_index,
    lastConfirmedDate: row.last_confirmed_date,
  };
}

const SELECT_COLUMNS =
  'id, flat_id, name, frequency, pay_weekday, day_of_month, assignment_mode, assignee_order, rotation_index, last_confirmed_date';

export async function fetchChores(flatId: string): Promise<Chore[]> {
  const { data, error } = await supabase
    .from('chores')
    .select(SELECT_COLUMNS)
    .eq('flat_id', flatId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(fromRow);
}

export type ChoreParams = {
  name: string;
  frequency: IncomeFrequency;
  payWeekday: number | null;
  dayOfMonth: number | null;
  assignmentMode: AssignmentMode;
  assigneeOrder: string[];
};

export async function createChore(flatId: string, params: ChoreParams): Promise<void> {
  const { error } = await supabase.from('chores').insert({
    flat_id: flatId,
    name: params.name,
    frequency: params.frequency,
    pay_weekday: params.frequency === 'monthly' ? null : params.payWeekday,
    day_of_month: params.frequency === 'monthly' ? params.dayOfMonth : null,
    assignment_mode: params.assignmentMode,
    assignee_order: params.assigneeOrder,
  });
  if (error) throw error;
}

// Same "cadence change resets confirm state" rule as updateBill -- an old
// confirm date (and rotation position) computed under the previous
// schedule/assignee list has no well-defined meaning under the new one.
export async function updateChore(choreId: string, params: ChoreParams): Promise<void> {
  const { error } = await supabase
    .from('chores')
    .update({
      name: params.name,
      frequency: params.frequency,
      pay_weekday: params.frequency === 'monthly' ? null : params.payWeekday,
      day_of_month: params.frequency === 'monthly' ? params.dayOfMonth : null,
      assignment_mode: params.assignmentMode,
      assignee_order: params.assigneeOrder,
      rotation_index: 0,
      last_confirmed_date: null,
    })
    .eq('id', choreId);
  if (error) throw error;
}

export async function deleteChore(choreId: string): Promise<void> {
  const { error } = await supabase.from('chores').delete().eq('id', choreId);
  if (error) throw error;
}

export function getChoreCycle(
  chore: Pick<Chore, 'frequency' | 'payWeekday' | 'dayOfMonth'>,
  now: Date = new Date(),
): IncomeCycle | null {
  return computeIncomeCycle(
    { frequency: chore.frequency, payWeekday: chore.payWeekday, payDayOfMonth: chore.dayOfMonth },
    now,
  );
}

// Whose turn it is right now -- null if no one's assigned yet.
export function currentAssigneeId(chore: Pick<Chore, 'assigneeOrder' | 'rotationIndex'>): string | null {
  if (chore.assigneeOrder.length === 0) return null;
  return chore.assigneeOrder[chore.rotationIndex % chore.assigneeOrder.length];
}

// Done for the CURRENT cycle -- same "last_confirmed_date covers this
// cycle's start" convention as getPendingBillDue in bills.ts.
export function isChoreDoneThisCycle(
  chore: Pick<Chore, 'frequency' | 'payWeekday' | 'dayOfMonth' | 'lastConfirmedDate'>,
  now: Date = new Date(),
): boolean {
  const cycle = getChoreCycle(chore, now);
  if (!cycle) return false;
  return chore.lastConfirmedDate !== null && chore.lastConfirmedDate >= cycle.startDate;
}

export async function confirmChore(choreId: string, cycleStartDate: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_chore', { p_chore_id: choreId, p_cycle_start: cycleStartDate });
  if (error) throw error;
}

// Reverses one confirmChore -- clears the done state AND rolls the
// rotation back to whoever it was before that confirm advanced it, so
// undoing genuinely restores the prior state rather than just hiding the
// checkmark while leaving the wrong person "up next". Goes through the
// plain admin-only UPDATE policy (no RPC needed) -- same reasoning as
// everywhere else in this app: undoing someone else's done chore is an
// admin action, not a member one, the mirror image of why confirm_chore
// is member-level but editing the chore itself is admin-only.
export async function undoChoreConfirmation(chore: Chore): Promise<void> {
  const count = chore.assigneeOrder.length;
  const revertedIndex =
    chore.assignmentMode === 'rotating' && count > 1 ? (chore.rotationIndex - 1 + count) % count : chore.rotationIndex;
  const { error } = await supabase
    .from('chores')
    .update({ last_confirmed_date: null, rotation_index: revertedIndex })
    .eq('id', chore.id);
  if (error) throw error;
}
