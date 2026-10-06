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
  thisMonthTotal: number;
  transactionCount: number;
  categoryTotals: CategoryTotal[];
  monthlyTotals: MonthlyTotal[];
};

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export async function fetchDashboardData(userId: string): Promise<DashboardData> {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  const sinceDate = sixMonthsAgo.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('transactions')
    .select('amount, occurred_at, category_id, categories(name, icon)')
    .eq('user_id', userId)
    .gte('occurred_at', sinceDate);

  if (error) throw error;

  const rows = (data ?? []) as unknown as {
    amount: number;
    occurred_at: string;
    category_id: string | null;
    categories: { name: string; icon: string | null } | null;
  }[];

  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // category totals, for the current month only
  const categoryMap = new Map<string, CategoryTotal>();
  // monthly totals, for the last 6 months
  const monthlyMap = new Map<string, number>();

  let thisMonthTotal = 0;
  let transactionCount = 0;

  for (const row of rows) {
    const monthKey = row.occurred_at.slice(0, 7); // 'YYYY-MM'
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

  return {
    thisMonthTotal: Math.round(thisMonthTotal * 100) / 100,
    transactionCount,
    categoryTotals,
    monthlyTotals,
  };
}
