// Multi-job income -- replaces the old income_settings singleton. One row
// per job, each with its own schedule, fixed-or-hourly mode, and optional
// gross/net tax tracking. See 0028_add_income_sources.sql for the schema
// and the two DB-level constraints (one primary per user, one main tax
// code per user) this file's pure helpers mirror for friendlier UX.
import { computeIncomeCycle, type IncomeCycle, type IncomeFrequency } from '@/lib/profile';
import { supabase } from '@/lib/supabase';

export type IncomeMode = 'fixed' | 'hourly';
export type TrackingMode = 'gross' | 'net';
export type KiwiSaverPct = 3 | 4 | 6 | 8 | 10;

export type IncomeSource = {
  id: string;
  label: string;
  isPrimary: boolean;
  mode: IncomeMode;
  amount: number | null; // fixed mode only
  hourlyRate: number | null; // hourly mode only
  frequency: IncomeFrequency;
  payWeekday: number | null;
  dayOfMonth: number | null;
  trackingMode: TrackingMode;
  taxCode: string | null; // net tracking only
  hasStudentLoan: boolean;
  kiwiSaverPct: KiwiSaverPct | null; // net tracking only, null = opted out
  lastConfirmedPayday: string | null;
};

type IncomeSourceRow = {
  id: string;
  label: string;
  is_primary: boolean;
  mode: IncomeMode;
  amount: number | null;
  hourly_rate: number | null;
  frequency: IncomeFrequency;
  pay_weekday: number | null;
  day_of_month: number | null;
  tracking_mode: TrackingMode;
  tax_code: string | null;
  has_student_loan: boolean;
  kiwisaver_pct: KiwiSaverPct | null;
  last_confirmed_payday: string | null;
};

function fromRow(row: IncomeSourceRow): IncomeSource {
  return {
    id: row.id,
    label: row.label,
    isPrimary: row.is_primary,
    mode: row.mode,
    amount: row.amount,
    hourlyRate: row.hourly_rate,
    frequency: row.frequency,
    payWeekday: row.pay_weekday,
    dayOfMonth: row.day_of_month,
    trackingMode: row.tracking_mode,
    taxCode: row.tax_code,
    hasStudentLoan: row.has_student_loan,
    kiwiSaverPct: row.kiwisaver_pct,
    lastConfirmedPayday: row.last_confirmed_payday,
  };
}

const SELECT_COLUMNS =
  'id, label, is_primary, mode, amount, hourly_rate, frequency, pay_weekday, day_of_month, tracking_mode, tax_code, has_student_loan, kiwisaver_pct, last_confirmed_payday';

export async function fetchIncomeSources(userId: string): Promise<IncomeSource[]> {
  const { data, error } = await supabase
    .from('income_sources')
    .select(SELECT_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(fromRow);
}

export type IncomeSourceParams = {
  label: string;
  isPrimary: boolean;
  mode: IncomeMode;
  amount: number | null;
  hourlyRate: number | null;
  frequency: IncomeFrequency;
  payWeekday: number | null;
  dayOfMonth: number | null;
  trackingMode: TrackingMode;
  taxCode: string | null;
  hasStudentLoan: boolean;
  kiwiSaverPct: KiwiSaverPct | null;
};

// Clears fields that don't apply to the chosen mode/tracking, rather than
// trusting the caller to already have -- mirrors the DB's own CHECK
// constraint shape (mode = 'fixed' implies hourly_rate is null, etc.) so
// the two can't drift apart.
function toRow(userId: string, params: IncomeSourceParams) {
  return {
    user_id: userId,
    label: params.label.trim(),
    is_primary: params.isPrimary,
    mode: params.mode,
    amount: params.mode === 'fixed' ? params.amount : null,
    hourly_rate: params.mode === 'hourly' ? params.hourlyRate : null,
    frequency: params.frequency,
    pay_weekday: params.frequency === 'monthly' ? null : params.payWeekday,
    day_of_month: params.frequency === 'monthly' ? params.dayOfMonth : null,
    tracking_mode: params.trackingMode,
    tax_code: params.trackingMode === 'net' ? params.taxCode : null,
    has_student_loan: params.trackingMode === 'net' ? params.hasStudentLoan : false,
    kiwisaver_pct: params.trackingMode === 'net' ? params.kiwiSaverPct : null,
  };
}

export async function createIncomeSource(userId: string, params: IncomeSourceParams): Promise<string> {
  const { data, error } = await supabase
    .from('income_sources')
    .insert(toRow(userId, params))
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function updateIncomeSource(
  id: string,
  userId: string,
  params: IncomeSourceParams,
): Promise<void> {
  const { error } = await supabase.from('income_sources').update(toRow(userId, params)).eq('id', id);
  if (error) throw error;
}

export async function deleteIncomeSource(id: string): Promise<void> {
  const { error } = await supabase.from('income_sources').delete().eq('id', id);
  if (error) throw error;
}

// Two plain updates, not one atomic RPC -- unlike confirm/skip (which log
// real money and genuinely need atomicity), a momentary "zero primary
// sources" state between these two calls is harmless and self-healing: at
// worst, one extra screen load briefly falls back to calendar-month
// budgeting until the second call lands. Not worth an RPC for that.
export async function setPrimaryIncomeSource(userId: string, id: string): Promise<void> {
  const { error: clearError } = await supabase
    .from('income_sources')
    .update({ is_primary: false })
    .eq('user_id', userId)
    .eq('is_primary', true);
  if (clearError) throw clearError;

  const { error } = await supabase.from('income_sources').update({ is_primary: true }).eq('id', id);
  if (error) throw error;
}

export function getPrimaryIncomeSource(sources: IncomeSource[]): IncomeSource | null {
  return sources.find((s) => s.isPrimary) ?? null;
}

// Mirrors the DB's income_sources_one_main_tax_code partial unique index --
// checked client-side first for a friendly inline error, same pattern as
// createCategory's duplicate-name check (lib/transactions.ts). The DB
// constraint is still the real enforcement; this just avoids a raw
// constraint-violation message reaching the user.
export function canUseTaxCode(
  sources: IncomeSource[],
  taxCode: string,
  excludingSourceId: string | null,
): boolean {
  if (taxCode !== 'M' && taxCode !== 'ME') return true;
  return !sources.some(
    (s) =>
      s.id !== excludingSourceId && s.trackingMode === 'net' && (s.taxCode === 'M' || s.taxCode === 'ME'),
  );
}

function toCycleInput(source: Pick<IncomeSource, 'frequency' | 'payWeekday' | 'dayOfMonth'>) {
  return { frequency: source.frequency, payWeekday: source.payWeekday, payDayOfMonth: source.dayOfMonth };
}

export function getIncomeSourceCycle(
  source: Pick<IncomeSource, 'frequency' | 'payWeekday' | 'dayOfMonth'>,
  now: Date = new Date(),
): IncomeCycle | null {
  return computeIncomeCycle(toCycleInput(source), now);
}

// Same shape as profile.ts's getPendingPayday, per source instead of a
// singleton -- the most recent payday (cycle.startDate) if it hasn't been
// resolved (confirmed or skipped) yet.
export function getPendingIncomeSourcePayday(
  source: Pick<IncomeSource, 'frequency' | 'payWeekday' | 'dayOfMonth' | 'lastConfirmedPayday'>,
  now: Date = new Date(),
): string | null {
  const cycle = getIncomeSourceCycle(source, now);
  if (!cycle) return null;
  if (source.lastConfirmedPayday && source.lastConfirmedPayday >= cycle.startDate) return null;
  return cycle.startDate;
}

export function getNextIncomeSourcePaydayDate(
  source: Pick<IncomeSource, 'frequency' | 'payWeekday' | 'dayOfMonth'>,
  now: Date = new Date(),
): string | null {
  return getIncomeSourceCycle(source, now)?.endDate ?? null;
}

// Gross pay for a confirm -- the stored fixed amount, or rate × hours for
// hourly mode. `hoursWorked` here means total PAID hours (worked + any
// paid leave taken), not hours physically worked -- see bell copy in
// notifications-modal.tsx and session notes on why sick/annual leave still
// counts as paid.
export function computeGrossPay(
  source: Pick<IncomeSource, 'mode' | 'amount' | 'hourlyRate'>,
  paidHours?: number,
): number | null {
  if (source.mode === 'fixed') return source.amount;
  if (source.hourlyRate === null || paidHours === undefined || paidHours <= 0) return null;
  return Math.round(source.hourlyRate * paidHours * 100) / 100;
}

// Both writes (transaction insert + last_confirmed_payday advance) happen
// inside a single Postgres function call -- see confirm_income_source_payment
// in 0029_add_income_source_payment_rpcs.sql for why this isn't two
// separate client calls (the original singleton payday confirm had exactly
// that bug once; this starts out right).
export async function confirmIncomeSourcePayment(
  sourceId: string,
  amount: number,
  paydayDate: string,
): Promise<void> {
  const { error } = await supabase.rpc('confirm_income_source_payment', {
    p_source_id: sourceId,
    p_amount: amount,
    p_payday_date: paydayDate,
  });
  if (error) throw error;
}

export async function skipIncomeSourcePayment(sourceId: string, paydayDate: string): Promise<void> {
  const { error } = await supabase.rpc('skip_income_source_payment', {
    p_source_id: sourceId,
    p_payday_date: paydayDate,
  });
  if (error) throw error;
}
