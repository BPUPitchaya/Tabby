import { supabase } from '@/lib/supabase';

export type IncomeFrequency = 'weekly' | 'biweekly' | 'monthly';

// Which animal mascot represents this user -- shown on the Profile header
// and the Home hero box (see tabby-mascot.tsx). Kept here, not in the
// component file, so the lib layer owns the data shape and the UI
// component imports it, not the other way around.
export type AnimalKey =
  | 'bear'
  | 'cat'
  | 'dog'
  | 'fox'
  | 'rabbit'
  | 'panda'
  | 'koala'
  | 'tiger'
  | 'raccoon'
  | 'hamster'
  | 'otter';

export const ANIMAL_KEYS: AnimalKey[] = [
  'bear',
  'cat',
  'dog',
  'fox',
  'rabbit',
  'panda',
  'koala',
  'tiger',
  'raccoon',
  'hamster',
  'otter',
];

export type Profile = {
  id: string;
  display_name: string;
  avatar_animal: AnimalKey;
};

export async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_animal')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data as Profile;
}

export async function updateDisplayName(userId: string, displayName: string) {
  const { error } = await supabase.from('profiles').update({ display_name: displayName }).eq('id', userId);
  if (error) throw error;
}

export async function updateAvatarAnimal(userId: string, animal: AnimalKey) {
  const { error } = await supabase.from('profiles').update({ avatar_animal: animal }).eq('id', userId);
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

// income_settings (the old single-job singleton this type/these functions
// used to read and write) is retired as of Phase 5 of the income-sources
// plan -- income_sources is now the only live read/write path, via
// income-sources.ts. The table itself still exists with historical data,
// just unread by the app. See IncomeCycle/computeIncomeCycle below (still
// shared pure math, reused by income-sources.ts and bills.ts) and
// getOverspendPrediction (still shared, structurally typed against
// whatever progress shape is passed in).

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

// Calls the delete-account Edge Function (service-role, the client never
// gets that key) -- see supabase/functions/delete-account/index.ts. Your
// own data cascades away with your auth.users row; anything you did
// inside a shared flat (created it, paid a shared expense, settled up)
// survives for other members with its "who" pointer set to null instead.
// The caller is responsible for signing out locally afterward -- the
// server-side session is gone, but local storage still has to be cleared.
export async function deleteAccount(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('delete-account');
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
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
  settings: { frequency: IncomeFrequency; payWeekday: number | null; payDayOfMonth: number | null },
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

export type OverspendPrediction = {
  projectedTotal: number;
  overBy: number;
};

// Projects end-of-cycle spend from the current pace (spent so far / days
// elapsed * total days in the cycle) and flags it only when that
// projection would meaningfully clear the budget -- not the actual
// percentage so far, which the existing progress bar already shows.
// Deliberately conservative: nothing on day 1 (too noisy to project from
// a single day), nothing once already over budget (the bar already says
// so), and a 10%-over-budget floor so a projection that's merely a few
// dollars over isn't presented as if it were a warning.
export function getOverspendPrediction(
  progress: { cycle: IncomeCycle; budgetAmount: number; spent: number },
  now: Date = new Date(),
): OverspendPrediction | null {
  if (progress.budgetAmount <= 0) return null;

  const start = new Date(`${progress.cycle.startDate}T00:00:00`);
  const end = new Date(`${progress.cycle.endDate}T00:00:00`);
  const totalDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (totalDays <= 0) return null;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const elapsedDaysRaw = Math.round((today.getTime() - start.getTime()) / 86_400_000) + 1; // inclusive of today
  const elapsedDays = Math.min(Math.max(elapsedDaysRaw, 1), totalDays);
  if (elapsedDays < 2) return null;

  const pctSoFar = progress.spent / progress.budgetAmount;
  if (pctSoFar >= 1) return null; // already over -- the actual bar already shows this

  const projectedTotal = (progress.spent / elapsedDays) * totalDays;
  const overBy = projectedTotal - progress.budgetAmount;
  if (overBy < progress.budgetAmount * 0.1) return null;

  return {
    projectedTotal: Math.round(projectedTotal * 100) / 100,
    overBy: Math.round(overBy * 100) / 100,
  };
}

// fetchIncomeProgress (the income_settings-based version of this) is
// retired -- see getIncomeSourceProgress in income-sources.ts, which reads
// the primary income source's cycle/budget_amount instead.
