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

export type DashboardData = {
  thisMonthTotal: number; // expenses only -- "spend" has always meant this
  thisMonthIncome: number;
  thisMonthNet: number; // income - total, can go negative
  transactionCount: number;
  categoryTotals: CategoryTotal[];
  monthlyTotals: MonthlyTotal[];
};

export type DashboardRow = {
  amount: number;
  occurred_at: string;
  category_id: string | null;
  is_income: boolean;
  categories: { name: string; icon: string | null } | null;
};

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// Pure calculation, split out from fetchDashboardData so it's unit-testable
// without a live Supabase client (same pattern as flats.ts).
//
// Category breakdown and the 6-month chart stay expense-only on purpose --
// mixing income in would make "spending by category" misleading (a salary
// deposit isn't a spending category) and would make the trend chart look
// like spending dropped in months you just happened to earn more.
export function computeDashboardFromRows(rows: DashboardRow[], now: Date = new Date()): DashboardData {
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // category totals, for the current month only, expenses only
  const categoryMap = new Map<string, CategoryTotal>();
  // monthly totals, for the last 6 months, expenses only
  const monthlyMap = new Map<string, number>();

  let thisMonthTotal = 0;
  let thisMonthIncome = 0;
  let transactionCount = 0;

  for (const row of rows) {
    const monthKey = row.occurred_at.slice(0, 7); // 'YYYY-MM'

    if (row.is_income) {
      if (monthKey === currentMonthKey) {
        thisMonthIncome += row.amount;
        transactionCount += 1;
      }
      continue;
    }

    monthlyMap.set(monthKey, (monthlyMap.get(monthKey) ?? 0) + row.amount);

    if (monthKey === currentMonthKey) {
      thisMonthTotal += row.amount;
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

  const categoryTotals = Array.from(categoryMap.values())
    .map((c) => ({ ...c, total: Math.round(c.total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);

  thisMonthTotal = Math.round(thisMonthTotal * 100) / 100;
  thisMonthIncome = Math.round(thisMonthIncome * 100) / 100;

  return {
    thisMonthTotal,
    thisMonthIncome,
    thisMonthNet: Math.round((thisMonthIncome - thisMonthTotal) * 100) / 100,
    transactionCount,
    categoryTotals,
    monthlyTotals,
  };
}

export async function fetchDashboardData(userId: string): Promise<DashboardData> {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  const sinceDate = sixMonthsAgo.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('transactions')
    .select('amount, occurred_at, category_id, is_income, categories(name, icon)')
    .eq('user_id', userId)
    .gte('occurred_at', sinceDate);

  if (error) throw error;

  const rows = (data ?? []) as unknown as DashboardRow[];
  return computeDashboardFromRows(rows);
}
