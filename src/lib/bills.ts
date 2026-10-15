// Recurring bills -- schedule a weekly/biweekly/monthly expense, fixed or
// variable amount, get reminded on the due date. Cycle math reuses
// computeIncomeCycle from profile.ts directly rather than duplicating it --
// a bill's {frequency, payWeekday, dayOfMonth} is the same shape income
// settings already solved this for.
import { supabase } from '@/lib/supabase';
import { computeIncomeCycle, type IncomeFrequency } from '@/lib/profile';

export type Bill = {
  id: string;
  name: string;
  categoryId: string | null;
  isVariable: boolean;
  amount: number | null;
  frequency: IncomeFrequency;
  payWeekday: number | null;
  dayOfMonth: number | null;
  lastConfirmedDate: string | null;
};

// Past this many active bills, scheduling local notifications risks
// bumping into iOS's system-wide 64-pending-notification cap (2 per bill --
// reminder + possible follow-up). A soft warning, not a hard block --
// see bills-modal.tsx.
export const BILL_COUNT_SOFT_CAP = 20;

function fromRow(row: {
  id: string;
  name: string;
  category_id: string | null;
  is_variable: boolean;
  amount: number | null;
  frequency: IncomeFrequency;
  pay_weekday: number | null;
  day_of_month: number | null;
  last_confirmed_date: string | null;
}): Bill {
  return {
    id: row.id,
    name: row.name,
    categoryId: row.category_id,
    isVariable: row.is_variable,
    amount: row.amount,
    frequency: row.frequency,
    payWeekday: row.pay_weekday,
    dayOfMonth: row.day_of_month,
    lastConfirmedDate: row.last_confirmed_date,
  };
}

export async function fetchBills(userId: string): Promise<Bill[]> {
  const { data, error } = await supabase
    .from('bills')
    .select(
      'id, name, category_id, is_variable, amount, frequency, pay_weekday, day_of_month, last_confirmed_date',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map(fromRow);
}

export async function createBill(
  userId: string,
  params: {
    name: string;
    categoryId: string | null;
    isVariable: boolean;
    amount: number | null;
    frequency: IncomeFrequency;
    payWeekday: number | null;
    dayOfMonth: number | null;
  },
): Promise<string> {
  const { data, error } = await supabase
    .from('bills')
    .insert({
      user_id: userId,
      name: params.name,
      category_id: params.categoryId,
      is_variable: params.isVariable,
      amount: params.isVariable ? null : params.amount,
      frequency: params.frequency,
      pay_weekday: params.frequency === 'monthly' ? null : params.payWeekday,
      day_of_month: params.frequency === 'monthly' ? params.dayOfMonth : null,
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id as string;
}

// Changing the cadence (frequency/payWeekday/dayOfMonth) always resets
// last_confirmed_date to null -- an old confirm date computed under the
// previous schedule has no well-defined meaning under the new one, so
// rather than guess, the next cycle is simply treated as never-confirmed.
export async function updateBill(
  billId: string,
  params: {
    name: string;
    categoryId: string | null;
    isVariable: boolean;
    amount: number | null;
    frequency: IncomeFrequency;
    payWeekday: number | null;
    dayOfMonth: number | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from('bills')
    .update({
      name: params.name,
      category_id: params.categoryId,
      is_variable: params.isVariable,
      amount: params.isVariable ? null : params.amount,
      frequency: params.frequency,
      pay_weekday: params.frequency === 'monthly' ? null : params.payWeekday,
      day_of_month: params.frequency === 'monthly' ? params.dayOfMonth : null,
      last_confirmed_date: null,
    })
    .eq('id', billId);

  if (error) throw error;
}

export async function deleteBill(billId: string): Promise<void> {
  const { error } = await supabase.from('bills').delete().eq('id', billId);
  if (error) throw error;
}

// The most recent due date (cycle.startDate) if it hasn't been resolved
// (confirmed or skipped) yet -- same shape as getPendingPayday. null means
// either an unschedulable bill or the latest cycle is already resolved.
export function getPendingBillDue(
  bill: Pick<Bill, 'frequency' | 'payWeekday' | 'dayOfMonth' | 'lastConfirmedDate'>,
  now: Date = new Date(),
): string | null {
  const cycle = computeIncomeCycle(
    { frequency: bill.frequency, payWeekday: bill.payWeekday, payDayOfMonth: bill.dayOfMonth },
    now,
  );
  if (!cycle) return null;
  if (bill.lastConfirmedDate && bill.lastConfirmedDate >= cycle.startDate) return null;
  return cycle.startDate;
}

export function getNextBillDueDate(
  bill: Pick<Bill, 'frequency' | 'payWeekday' | 'dayOfMonth'>,
  now: Date = new Date(),
): string | null {
  return (
    computeIncomeCycle(
      { frequency: bill.frequency, payWeekday: bill.payWeekday, payDayOfMonth: bill.dayOfMonth },
      now,
    )?.endDate ?? null
  );
}

// Both writes (transaction insert + last_confirmed_date advance) happen
// inside a single Postgres function call -- see confirm_bill_payment in
// 0023_add_bills.sql for why this isn't two separate client calls.
export async function confirmBillPayment(billId: string, amount: number, dueDate: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_bill_payment', {
    p_bill_id: billId,
    p_amount: amount,
    p_due_date: dueDate,
  });
  if (error) throw error;
}

export async function skipBillPayment(billId: string, dueDate: string): Promise<void> {
  const { error } = await supabase.rpc('skip_bill_payment', {
    p_bill_id: billId,
    p_due_date: dueDate,
  });
  if (error) throw error;
}
