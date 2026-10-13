import { supabase } from '@/lib/supabase';

export type IncomeFrequency = 'weekly' | 'biweekly' | 'monthly';

export type Profile = {
  id: string;
  display_name: string;
};

export async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data as Profile;
}

export async function updateDisplayName(userId: string, displayName: string) {
  const { error } = await supabase.from('profiles').update({ display_name: displayName }).eq('id', userId);
  if (error) throw error;
}

// Free-text bank account + reference, included in a reminder message so
// the ower doesn't have to follow up asking how to pay -- see
// 0019_add_payment_details.sql / 0021_move_payment_details_to_own_table.sql
// for why this is plain text (no NZ Venmo/Cash App equivalent) in its own
// table with an owner-only RLS policy, not a column on profiles (which
// anyone signed in can read).
export async function fetchMyPaymentDetails(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('payment_details')
    .select('details')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.details ?? null;
}

export async function updatePaymentDetails(userId: string, paymentDetails: string) {
  const trimmed = paymentDetails.trim();
  if (!trimmed) {
    const { error } = await supabase.from('payment_details').delete().eq('user_id', userId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase
    .from('payment_details')
    .upsert({ user_id: userId, details: trimmed, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// Whether the one-time "add your payment details?" onboarding question has
// been shown -- see 0020_add_payment_details_prompted.sql for why this is
// a separate flag from payment_details itself (skipping still leaves that
// null, and without this they'd be asked again every open).
export async function fetchPaymentDetailsPrompted(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('payment_details_prompted')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data.payment_details_prompted as boolean;
}

export async function markPaymentDetailsPrompted(userId: string) {
  const { error } = await supabase
    .from('profiles')
    .update({ payment_details_prompted: true })
    .eq('id', userId);
  if (error) throw error;
}

// null = hasn't answered the "living with flatmates?" onboarding question
// yet. Distinct from `false`, which means they answered "no" -- both hide
// the Flat tab, but only `null` (combined with no flat) triggers the
// onboarding question itself; `false` means they've already seen it.
export async function fetchWantsFlat(userId: string): Promise<boolean | null> {
  const { data, error } = await supabase.from('profiles').select('wants_flat').eq('id', userId).single();
  if (error) throw error;
  return data.wants_flat;
}

export async function updateWantsFlat(userId: string, wantsFlat: boolean) {
  const { error } = await supabase.from('profiles').update({ wants_flat: wantsFlat }).eq('id', userId);
  if (error) throw error;
}

// Recurring expected income, stored in its own table (income_settings) --
// deliberately NOT a column on profiles, since profiles has a
// "viewable by any authenticated user" policy (so flatmates can see each
// other's display_name) and income is sensitive enough to need a strict,
// self-only policy instead.
//
// budgetAmount is separate from amount (what you earn) -- how much of your
// income you actually intend to spend, not a restatement of income itself.
// null until the user sets it explicitly; always null if income itself
// hasn't been set (there's no pay cycle to attach a budget to otherwise).
export type IncomeSettings = {
  amount: number;
  frequency: IncomeFrequency;
  payWeekday: number | null; // 0-6, Sunday-Saturday
  payDayOfMonth: number | null; // 1-31
  budgetAmount: number | null;
};

export async function fetchIncomeSettings(userId: string): Promise<IncomeSettings | null> {
  const { data, error } = await supabase
    .from('income_settings')
    .select('income_amount, income_frequency, income_pay_weekday, income_pay_day_of_month, budget_amount')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    amount: data.income_amount,
    frequency: data.income_frequency,
    payWeekday: data.income_pay_weekday,
    payDayOfMonth: data.income_pay_day_of_month,
    budgetAmount: data.budget_amount,
  };
}

// No row exists until the user sets income up, so this is an upsert rather
// than a plain update -- there's nothing to update the first time. Only
// writes the income columns (not budget_amount), so saving income never
// clobbers a budget that was set separately -- upsert's ON CONFLICT only
// touches the columns listed here.
export async function updateIncomeSettings(
  userId: string,
  settings: Pick<IncomeSettings, 'amount' | 'frequency' | 'payWeekday' | 'payDayOfMonth'>,
) {
  const { error } = await supabase.from('income_settings').upsert(
    {
      user_id: userId,
      income_amount: settings.amount,
      income_frequency: settings.frequency,
      income_pay_weekday: settings.payWeekday,
      income_pay_day_of_month: settings.payDayOfMonth,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) throw error;
}

export async function clearIncomeSettings(userId: string) {
  const { error } = await supabase.from('income_settings').delete().eq('user_id', userId);
  if (error) throw error;
}

// Plain update, not upsert -- a budget can only be set once an
// income_settings row already exists (the UI gates on this: Budget can't
// be opened for editing until Earned has been set up at least once).
export async function updateBudgetAmount(userId: string, budgetAmount: number) {
  const { error } = await supabase
    .from('income_settings')
    .update({ budget_amount: budgetAmount, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) throw error;
}

export async function clearBudgetAmount(userId: string) {
  const { error } = await supabase
    .from('income_settings')
    .update({ budget_amount: null, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) throw error;
}

// Supabase Auth's email change sends a confirmation link to the new
// address -- the email on the session doesn't actually change until the
// user clicks it, so the caller needs to tell the user to check their inbox
// rather than treat this as instant.
export async function updateEmail(newEmail: string) {
  const { error } = await supabase.auth.updateUser({ email: newEmail });
  if (error) throw error;
}

export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export type IncomeCycle = {
  /** Inclusive, 'YYYY-MM-DD'. */
  startDate: string;
  /** Exclusive, 'YYYY-MM-DD' -- the first day of the *next* cycle. */
  endDate: string;
};

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  // month is 0-indexed, same as Date -- day 0 of the *next* month is the
  // last day of this one.
  return new Date(year, month + 1, 0).getDate();
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + days);
  return next;
}

// Most recent date on/before `now` that falls on `weekday` (0-6).
function mostRecentWeekday(now: Date, weekday: number): Date {
  const diff = (now.getDay() - weekday + 7) % 7;
  return addDays(now, -diff);
}

// Pure date math, split out for testability (same pattern as flats.ts /
// dashboard.ts). `now` is injectable so tests don't depend on the real
// clock.
//
// Weekly: the cycle starts on the most recent occurrence of the chosen
// weekday and runs 7 days.
//
// Biweekly: deliberately a *rolling* 14-day window ending on the most
// recent occurrence of the chosen weekday, not a true alternating-week
// cycle -- a single weekday can't disambiguate which of the two possible
// phases is the real payday without an extra reference date the user
// wasn't asked for. Documented limitation, not a bug.
//
// Monthly: the cycle starts on this month's pay-day-of-month (or last
// month's, if that day hasn't happened yet this month), clamped to the
// last day of shorter months.
export function computeIncomeCycle(
  settings: Pick<IncomeSettings, 'frequency' | 'payWeekday' | 'payDayOfMonth'>,
  now: Date = new Date(),
): IncomeCycle | null {
  const { frequency, payWeekday, payDayOfMonth } = settings;

  if (frequency === 'weekly' && payWeekday !== null && payWeekday !== undefined) {
    const start = mostRecentWeekday(now, payWeekday);
    return { startDate: toISODate(start), endDate: toISODate(addDays(start, 7)) };
  }

  if (frequency === 'biweekly' && payWeekday !== null && payWeekday !== undefined) {
    const start = mostRecentWeekday(now, payWeekday);
    return { startDate: toISODate(start), endDate: toISODate(addDays(start, 14)) };
  }

  if (frequency === 'monthly' && payDayOfMonth) {
    const year = now.getFullYear();
    const month = now.getMonth();
    const thisMonthDay = Math.min(payDayOfMonth, daysInMonth(year, month));

    let startYear = year;
    let startMonth = month;
    if (now.getDate() < thisMonthDay) {
      // hasn't happened yet this month -- the current cycle started last month
      startMonth = month - 1;
      if (startMonth < 0) {
        startMonth = 11;
        startYear -= 1;
      }
    }
    const startDay = Math.min(payDayOfMonth, daysInMonth(startYear, startMonth));
    const start = new Date(startYear, startMonth, startDay);

    let endYear = startYear;
    let endMonth = startMonth + 1;
    if (endMonth > 11) {
      endMonth = 0;
      endYear += 1;
    }
    const endDay = Math.min(payDayOfMonth, daysInMonth(endYear, endMonth));
    const end = new Date(endYear, endMonth, endDay);

    return { startDate: toISODate(start), endDate: toISODate(end) };
  }

  return null;
}

export type IncomeProgress = {
  budgetAmount: number;
  frequency: IncomeFrequency;
  cycle: IncomeCycle;
  spent: number;
};

// null whenever there's nothing to show progress against -- no income set
// up at all, or income set up but no budget chosen yet (the Budget cell
// falls back to "Set it" in that case, same as before this had a separate
// budget figure).
export async function fetchIncomeProgress(userId: string): Promise<IncomeProgress | null> {
  const settings = await fetchIncomeSettings(userId);
  if (!settings || settings.budgetAmount === null) return null;

  const cycle = computeIncomeCycle(settings);
  if (!cycle) return null;

  const { data, error } = await supabase
    .from('transactions')
    .select('amount')
    .eq('user_id', userId)
    .eq('is_income', false)
    .gte('occurred_at', cycle.startDate)
    .lt('occurred_at', cycle.endDate);

  if (error) throw error;

  const spent = (data ?? []).reduce((sum, row) => sum + (row as { amount: number }).amount, 0);

  return {
    budgetAmount: settings.budgetAmount,
    frequency: settings.frequency,
    cycle,
    spent: Math.round(spent * 100) / 100,
  };
}
