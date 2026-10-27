// Recurring flat bills -- rent/power/internet, scheduled once instead of
// re-logged as a one-off shared_expense every cycle. Cycle math reuses
// computeIncomeCycle from profile.ts, same as bills.ts/chores.ts already
// do -- not duplicated here. See 0046_add_flat_bills.sql for why
// create/edit/delete is admin-only but confirming a cycle is member-level.
import { supabase } from '@/lib/supabase';
import { computeIncomeCycle, type IncomeCycle, type IncomeFrequency } from '@/lib/profile';

export type FlatBill = {
  id: string;
  flatId: string;
  name: string;
  categoryId: string | null;
  amount: number;
  frequency: IncomeFrequency;
  payWeekday: number | null;
  dayOfMonth: number | null;
  lastConfirmedDate: string | null;
};

function fromRow(row: {
  id: string;
  flat_id: string;
  name: string;
  category_id: string | null;
  amount: number;
  frequency: IncomeFrequency;
  pay_weekday: number | null;
  day_of_month: number | null;
  last_confirmed_date: string | null;
}): FlatBill {
  return {
    id: row.id,
    flatId: row.flat_id,
    name: row.name,
    categoryId: row.category_id,
    amount: row.amount,
    frequency: row.frequency,
    payWeekday: row.pay_weekday,
    dayOfMonth: row.day_of_month,
    lastConfirmedDate: row.last_confirmed_date,
  };
}

const SELECT_COLUMNS = 'id, flat_id, name, category_id, amount, frequency, pay_weekday, day_of_month, last_confirmed_date';

export async function fetchFlatBills(flatId: string): Promise<FlatBill[]> {
  const { data, error } = await supabase
    .from('flat_bills')
    .select(SELECT_COLUMNS)
    .eq('flat_id', flatId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(fromRow);
}

export type FlatBillParams = {
  name: string;
  categoryId: string | null;
  amount: number;
  frequency: IncomeFrequency;
  payWeekday: number | null;
  dayOfMonth: number | null;
};

export async function createFlatBill(flatId: string, params: FlatBillParams): Promise<void> {
  const { error } = await supabase.from('flat_bills').insert({
    flat_id: flatId,
    name: params.name,
    category_id: params.categoryId,
    amount: params.amount,
    frequency: params.frequency,
    pay_weekday: params.frequency === 'monthly' ? null : params.payWeekday,
    day_of_month: params.frequency === 'monthly' ? params.dayOfMonth : null,
  });
  if (error) throw error;
}

// Same "cadence change resets confirm state" rule as updateBill/updateChore
// -- an old confirm date computed under the previous schedule has no
// well-defined meaning under the new one.
export async function updateFlatBill(billId: string, params: FlatBillParams): Promise<void> {
  const { error } = await supabase
    .from('flat_bills')
    .update({
      name: params.name,
      category_id: params.categoryId,
      amount: params.amount,
      frequency: params.frequency,
      pay_weekday: params.frequency === 'monthly' ? null : params.payWeekday,
      day_of_month: params.frequency === 'monthly' ? params.dayOfMonth : null,
      last_confirmed_date: null,
    })
    .eq('id', billId);
  if (error) throw error;
}

export async function deleteFlatBill(billId: string): Promise<void> {
  const { error } = await supabase.from('flat_bills').delete().eq('id', billId);
  if (error) throw error;
}

export function getFlatBillCycle(
  bill: Pick<FlatBill, 'frequency' | 'payWeekday' | 'dayOfMonth'>,
  now: Date = new Date(),
): IncomeCycle | null {
  return computeIncomeCycle(
    { frequency: bill.frequency, payWeekday: bill.payWeekday, payDayOfMonth: bill.dayOfMonth },
    now,
  );
}

// Same "last_confirmed_date covers this cycle's start" convention as
// isChoreDoneThisCycle/getPendingBillDue.
export function isFlatBillDoneThisCycle(
  bill: Pick<FlatBill, 'frequency' | 'payWeekday' | 'dayOfMonth' | 'lastConfirmedDate'>,
  now: Date = new Date(),
): boolean {
  const cycle = getFlatBillCycle(bill, now);
  if (!cycle) return false;
  return bill.lastConfirmedDate !== null && bill.lastConfirmedDate >= cycle.startDate;
}

// Logs a real shared_expense (paid_by = whoever confirms) split equally
// among every current flat member, and advances last_confirmed_date, in
// one atomic RPC call -- see confirm_flat_bill in 0046_add_flat_bills.sql.
export async function confirmFlatBill(billId: string, dueDate: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_flat_bill', { p_bill_id: billId, p_due_date: dueDate });
  if (error) throw error;
}
