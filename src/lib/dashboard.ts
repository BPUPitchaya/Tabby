import { supabase } from '@/lib/supabase';

export type CategoryTotal = {
  categoryId: string | null;
  name: string;
  icon: string | null;
  total: number;
};

export type MonthlyTotal = {
  month: string; // 'YYYY-MM'
  label: string; // 'Jan', 'Feb', ...
  total: number;
};

export type WeeklyTotal = {
  weekStart: string; // 'YYYY-MM-DD', Monday
  label: string; // 'Oct 6'
  total: number;
};

export type DashboardData = {
  periodTotal: number; // expenses only -- "spend" has always meant this
  periodIncome: number;
  periodNet: number; // income - total, can go negative
  transactionCount: number;
  categoryTotals: CategoryTotal[];
  monthlyTotals: MonthlyTotal[];
  weeklyTotals: WeeklyTotal[];
  // Earliest occurred_at seen across all fetched rows (income + expense),
  // or null with no transactions at all. Used to pick weekly vs. monthly
  // for the trend chart in 'auto' mode (trend-period-preference.ts) --
  // not a reliable "first ever transaction" once it hits the edge of the
  // 6-month fetch window, but at that point the user has 6+ months of
  // history anyway, so auto mode wants monthly either way.
  earliestOccurredAt: string | null;
};

// The hero/flow-row figures' window -- calendar month by default, or the
// user's own pay cycle when they've set one and prefer that (see
// dashboard-period-preference.ts). The 6-month trend chart always stays
// calendar-month-bucketed regardless -- it's a monthly history view, a
// different concern from "the current period."
export type DashboardPeriod = {
  startDate: string; // inclusive, 'YYYY-MM-DD'
  endDate: string; // exclusive, 'YYYY-MM-DD'
};

export type DashboardRow = {
  amount: number;
  occurred_at: string;
  category_id: string | null;
  is_income: boolean;
  categories: { name: string; icon: string | null } | null;
};

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Monday of the week containing the given local-calendar date string.
function mondayOf(dateStr: string): Date {
  const d = new Date(`${dateStr}T00:00:00`);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Pure calculation, split out from fetchDashboardData so it's unit-testable
// without a live Supabase client (same pattern as flats.ts).
//
// Category breakdown and the 6-month chart stay expense-only on purpose --
// mixing income in would make "spending by category" misleading (a salary
// deposit isn't a spending category) and would make the trend chart look
// like spending dropped in months you just happened to earn more.
//
// `period` is null for the calendar-month default; when given (the user's
// pay cycle), it governs periodTotal/periodIncome/categoryTotals -- the
// 6-month trend stays calendar-month-bucketed either way.
export function computeDashboardFromRows(
  rows: DashboardRow[],
  period: DashboardPeriod | null = null,
  now: Date = new Date(),
): DashboardData {
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const inPeriod = (occurredAt: string) =>
    period
      ? occurredAt >= period.startDate && occurredAt < period.endDate
      : occurredAt.slice(0, 7) === currentMonthKey;

  // category totals, for the current period only, expenses only
  const categoryMap = new Map<string, CategoryTotal>();
  // monthly totals, for the last 6 months, expenses only -- always
  // calendar-month buckets, independent of `period`
  const monthlyMap = new Map<string, number>();
  // weekly totals, for the last 6 weeks, expenses only -- Monday-start
  // buckets, same independence from `period` as monthlyMap
  const weeklyMap = new Map<string, number>();

  let periodTotal = 0;
  let periodIncome = 0;
  let transactionCount = 0;
  let earliestOccurredAt: string | null = null;

  for (const row of rows) {
    const monthKey = row.occurred_at.slice(0, 7); // 'YYYY-MM'

    if (earliestOccurredAt === null || row.occurred_at < earliestOccurredAt) {
      earliestOccurredAt = row.occurred_at;
    }

    if (row.is_income) {
      if (inPeriod(row.occurred_at)) {
        periodIncome += row.amount;
        transactionCount += 1;
      }
      continue;
    }

    monthlyMap.set(monthKey, (monthlyMap.get(monthKey) ?? 0) + row.amount);
    const weekKey = toDateKey(mondayOf(row.occurred_at));
    weeklyMap.set(weekKey, (weeklyMap.get(weekKey) ?? 0) + row.amount);

    if (inPeriod(row.occurred_at)) {
      periodTotal += row.amount;
      transactionCount += 1;

      const key = row.category_id ?? 'uncategorized';
      const name = row.categories?.name ?? 'Uncategorized';
      const existing = categoryMap.get(key);
      categoryMap.set(key, {
        categoryId: row.category_id,
        name,
        icon: row.categories?.icon ?? null,
        total: (existing?.total ?? 0) + row.amount,
      });
    }
  }

  // build the full last-6-months list, including months with zero spend
  const monthlyTotals: MonthlyTotal[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthlyTotals.push({
      month: key,
      label: MONTH_LABELS[d.getMonth()],
      total: Math.round((monthlyMap.get(key) ?? 0) * 100) / 100,
    });
  }

  // build the last-6-weeks list, including weeks with zero spend
  const currentWeekMonday = mondayOf(toDateKey(now));
  const weeklyTotals: WeeklyTotal[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(currentWeekMonday);
    d.setDate(d.getDate() - i * 7);
    const key = toDateKey(d);
    weeklyTotals.push({
      weekStart: key,
      label: `${MONTH_LABELS[d.getMonth()]} ${d.getDate()}`,
      total: Math.round((weeklyMap.get(key) ?? 0) * 100) / 100,
    });
  }

  const categoryTotals = Array.from(categoryMap.values())
    .map((c) => ({ ...c, total: Math.round(c.total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);

  periodTotal = Math.round(periodTotal * 100) / 100;
  periodIncome = Math.round(periodIncome * 100) / 100;

  return {
    periodTotal,
    periodIncome,
    periodNet: Math.round((periodIncome - periodTotal) * 100) / 100,
    transactionCount,
    categoryTotals,
    monthlyTotals,
    weeklyTotals,
    earliestOccurredAt,
  };
}

export async function fetchDashboardData(
  userId: string,
  period: DashboardPeriod | null = null,
): Promise<DashboardData> {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  // The 6-month chart always needs 6 calendar months back regardless of
  // `period` -- but if the pay cycle itself starts earlier than that (only
  // possible right at a month boundary), widen the fetch so period totals
  // aren't silently missing rows.
  const sinceDate = [sixMonthsAgo.toISOString().slice(0, 10), period?.startDate].filter(Boolean).sort()[0]!;

  const { data, error } = await supabase
    .from('transactions')
    .select('amount, occurred_at, category_id, is_income, categories(name, icon)')
    .eq('user_id', userId)
    .eq('skipped', false) // a skipped bill is logged for history, not counted as real spend
    .gte('occurred_at', sinceDate);

  if (error) throw error;

  const rows = (data ?? []) as unknown as DashboardRow[];
  return computeDashboardFromRows(rows, period);
}
