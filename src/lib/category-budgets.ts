// Optional per-category budget caps -- no category starts with one; the
// user adds a cap to whichever categories they want to track, and a
// category with none just shows spend with no bar. See
// 0026_add_category_budgets.sql for why this lives in its own table.
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
