// Same native-module problem as profile.test.ts -- category-budgets.ts
// imports the real Supabase client for its network functions, so it's
// stubbed out here; this only touches the pure mergeCategoryBudgetProgress
// helper.
import { mergeCategoryBudgetProgress } from './category-budgets';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('mergeCategoryBudgetProgress', () => {
  const categories = [
    { id: 'c1', name: 'Groceries', icon: 'shopping-cart' },
    { id: 'c2', name: 'Eating Out', icon: 'coffee' },
  ];

  it('includes a budgeted category at $0 spend when it has no transactions this cycle', () => {
    const result = mergeCategoryBudgetProgress([{ categoryId: 'c1', amount: 300 }], categories, []);
    expect(result).toEqual([
      { categoryId: 'c1', name: 'Groceries', icon: 'shopping-cart', budgetAmount: 300, spent: 0 },
    ]);
  });

  it('matches spend to the right category', () => {
    const result = mergeCategoryBudgetProgress(
      [
        { categoryId: 'c1', amount: 300 },
        { categoryId: 'c2', amount: 150 },
      ],
      categories,
      [
        { categoryId: 'c1', total: 120 },
        { categoryId: 'c2', total: 200 },
        { categoryId: null, total: 40 }, // uncategorized -- never matched to a budget
      ],
    );
    expect(result).toEqual([
      { categoryId: 'c1', name: 'Groceries', icon: 'shopping-cart', budgetAmount: 300, spent: 120 },
      { categoryId: 'c2', name: 'Eating Out', icon: 'coffee', budgetAmount: 150, spent: 200 },
    ]);
  });

  it('drops a budget whose category no longer exists', () => {
    const result = mergeCategoryBudgetProgress([{ categoryId: 'deleted', amount: 50 }], categories, []);
    expect(result).toEqual([]);
  });
});
