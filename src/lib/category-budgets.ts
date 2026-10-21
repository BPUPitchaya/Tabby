// Optional per-category budget caps -- no category starts with one; the
// user adds a cap to whichever categories they want to track, and a
// category with none just shows spend with no bar. See
// 0026_add_category_budgets.sql for why this lives in its own table.
import type { DashboardRow } from '@/lib/dashboard';
import { supabase } from '@/lib/supabase';

export type CategoryBudget = {
  categoryId: string;
  amount: number;
};

export async function fetchCategoryBudgets(userId: string): Promise<CategoryBudget[]> {
  const { data, error } = await supabase
    .from('category_budgets')
    .select('category_id, amount')
    .eq('user_id', userId);

  if (error) throw error;
  return (data ?? []).map((row) => ({ categoryId: row.category_id, amount: row.amount }));
}

export async function setCategoryBudget(userId: string, categoryId: string, amount: number): Promise<void> {
  const { error } = await supabase
    .from('category_budgets')
    .upsert(
      { user_id: userId, category_id: categoryId, amount, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,category_id' },
    );
  if (error) throw error;
}

export async function clearCategoryBudget(userId: string, categoryId: string): Promise<void> {
  const { error } = await supabase
    .from('category_budgets')
    .delete()
    .eq('user_id', userId)
    .eq('category_id', categoryId);
  if (error) throw error;
}

// One-tap opt-out of category budgeting entirely -- clears every cap at
// once so Home falls back to the manual overall figure, rather than
// clearing each category one at a time.
export async function clearAllCategoryBudgets(userId: string): Promise<void> {
  const { error } = await supabase.from('category_budgets').delete().eq('user_id', userId);
  if (error) throw error;
}

export type CategoryBudgetProgress = {
  categoryId: string;
  name: string;
  icon: string | null;
  budgetAmount: number;
  spent: number;
};

// Merges budget caps with category names/icons and this cycle's per-
// category spend -- a category with a cap but no spend yet still appears
// (at $0), never dropped just because nothing's been logged against it
// this cycle. `categories` is the full list (names/icons never change by
// cycle); `categoryTotals` is this cycle's spend (only categories with
// at least one transaction appear in it).
export function mergeCategoryBudgetProgress(
  budgets: CategoryBudget[],
  categories: { id: string; name: string; icon: string | null }[],
  categoryTotals: { categoryId: string | null; total: number }[],
): CategoryBudgetProgress[] {
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const spendByCategory = new Map(
    categoryTotals.filter((c) => c.categoryId !== null).map((c) => [c.categoryId as string, c.total]),
  );

  return budgets.flatMap((b) => {
    const category = categoryById.get(b.categoryId);
    if (!category) return []; // category was deleted since the cap was set
    return [
      {
        categoryId: b.categoryId,
        name: category.name,
        icon: category.icon,
        budgetAmount: b.amount,
        spent: spendByCategory.get(b.categoryId) ?? 0,
      },
    ];
  });
}

export type CategorySpendAverage = {
  categoryId: string | null;
  monthlyAverage: number;
  // How many of the last `months` complete calendar months actually had
  // spend in this category -- lets a suggestion say "based on 1 month"
  // when history is thin, instead of implying 3 months of real pattern.
  monthsWithSpend: number;
};

// Average monthly spend per category over the last `months` COMPLETE
// calendar months -- excludes the current, still-in-progress month so a
// suggestion made on the 3rd doesn't get skewed low by 2 days of data.
// Averages over monthsWithSpend (months that actually had a transaction),
// not the fixed window -- dividing a single $50 month by a 3-month window
// instead of by 1 would suggest $16.67 for a category that really runs
// $50/month, just silently understating it because the other 2 months
// hadn't been logged yet. Pure calculation (same split-for-testability
// pattern as computeDashboardFromRows in dashboard.ts), expense rows only.
export function computeCategorySpendAverages(
  rows: DashboardRow[],
  months: number = 3,
  now: Date = new Date(),
): CategorySpendAverage[] {
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const cutoffDate = new Date(now.getFullYear(), now.getMonth() - months, 1);
  const cutoffKey = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}`;

  const totalsByCategory = new Map<string, number>();
  const monthsSeenByCategory = new Map<string, Set<string>>();

  for (const row of rows) {
    if (row.is_income) continue;
    const monthKey = row.occurred_at.slice(0, 7);
    if (monthKey === currentMonthKey || monthKey < cutoffKey) continue;

    const key = row.category_id ?? 'uncategorized';
    totalsByCategory.set(key, (totalsByCategory.get(key) ?? 0) + row.amount);
    const seen = monthsSeenByCategory.get(key) ?? new Set<string>();
    seen.add(monthKey);
    monthsSeenByCategory.set(key, seen);
  }

  return Array.from(totalsByCategory.entries()).map(([key, total]) => {
    const monthsWithSpend = monthsSeenByCategory.get(key)?.size ?? 1;
    return {
      categoryId: key === 'uncategorized' ? null : key,
      monthlyAverage: Math.round((total / monthsWithSpend) * 100) / 100,
      monthsWithSpend,
    };
  });
}

export async function fetchCategorySpendAverages(
  userId: string,
  months: number = 3,
): Promise<CategorySpendAverage[]> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  cutoff.setDate(1);

  const { data, error } = await supabase
    .from('transactions')
    .select('amount, occurred_at, category_id, is_income, categories(name, icon)')
    .eq('user_id', userId)
    .eq('skipped', false)
    .gte('occurred_at', cutoff.toISOString().slice(0, 10));

  if (error) throw error;
  return computeCategorySpendAverages((data ?? []) as unknown as DashboardRow[], months);
}

// Average real monthly income over months that actually had income, same
// "don't dilute with silent months" logic as computeCategorySpendAverages --
// used to sanity-check a category budget suggestion against what the
// person actually earns, not just what they've historically spent.
export function computeAverageMonthlyIncome(
  rows: DashboardRow[],
  months: number = 3,
  now: Date = new Date(),
): number {
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const cutoffDate = new Date(now.getFullYear(), now.getMonth() - months, 1);
  const cutoffKey = `${cutoffDate.getFullYear()}-${String(cutoffDate.getMonth() + 1).padStart(2, '0')}`;

  let total = 0;
  const monthsSeen = new Set<string>();
  for (const row of rows) {
    if (!row.is_income) continue;
    const monthKey = row.occurred_at.slice(0, 7);
    if (monthKey === currentMonthKey || monthKey < cutoffKey) continue;
    total += row.amount;
    monthsSeen.add(monthKey);
  }

  if (monthsSeen.size === 0) return 0;
  return Math.round((total / monthsSeen.size) * 100) / 100;
}

export async function fetchAverageMonthlyIncome(userId: string, months: number = 3): Promise<number> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  cutoff.setDate(1);

  const { data, error } = await supabase
    .from('transactions')
    .select('amount, occurred_at, category_id, is_income, categories(name, icon)')
    .eq('user_id', userId)
    .eq('is_income', true)
    .eq('skipped', false)
    .gte('occurred_at', cutoff.toISOString().slice(0, 10));

  if (error) throw error;
  return computeAverageMonthlyIncome((data ?? []) as unknown as DashboardRow[], months);
}
