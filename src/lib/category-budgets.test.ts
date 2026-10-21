// Same native-module problem as profile.test.ts -- category-budgets.ts
// imports the real Supabase client for its network functions, so it's
// stubbed out here; this only touches the pure mergeCategoryBudgetProgress,
// computeCategorySpendAverages, and computeAverageMonthlyIncome helpers.
import type { DashboardRow } from './dashboard';
import {
  computeAverageMonthlyIncome,
  computeCategorySpendAverages,
  mergeCategoryBudgetProgress,
} from './category-budgets';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

function row(partial: Partial<DashboardRow>): DashboardRow {
  return {
    amount: 0,
    occurred_at: '2026-10-05',
    category_id: null,
    is_income: false,
    categories: null,
    ...partial,
  };
}

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

describe('computeCategorySpendAverages', () => {
  const now = new Date('2026-10-20');

  it('averages spend over the last 3 complete months, excluding the current month', () => {
    const result = computeCategorySpendAverages(
      [
        row({ amount: 60, category_id: 'c1', occurred_at: '2026-09-10' }),
        row({ amount: 90, category_id: 'c1', occurred_at: '2026-08-10' }),
        row({ amount: 30, category_id: 'c1', occurred_at: '2026-07-10' }),
        row({ amount: 999, category_id: 'c1', occurred_at: '2026-10-05' }), // current month -- excluded
      ],
      3,
      now,
    );
    expect(result).toEqual([{ categoryId: 'c1', monthlyAverage: 60, monthsWithSpend: 3 }]);
  });

  it('ignores income rows', () => {
    const result = computeCategorySpendAverages(
      [row({ amount: 2500, category_id: 'c1', is_income: true, occurred_at: '2026-09-10' })],
      3,
      now,
    );
    expect(result).toEqual([]);
  });

  it('excludes rows older than the window', () => {
    const result = computeCategorySpendAverages(
      [
        row({ amount: 60, category_id: 'c1', occurred_at: '2026-09-10' }),
        row({ amount: 500, category_id: 'c1', occurred_at: '2026-06-10' }), // outside 3-month window
      ],
      3,
      now,
    );
    expect(result).toEqual([{ categoryId: 'c1', monthlyAverage: 60, monthsWithSpend: 1 }]);
  });

  it('averages a sparse category over months it actually had spend, not the full window', () => {
    // One real $50 month shouldn't get diluted into $16.67 just because
    // the other 2 months of the window had nothing logged yet -- a
    // suggested budget should reflect "what a normal month looks like",
    // not punish thin history.
    const result = computeCategorySpendAverages(
      [row({ amount: 50, category_id: 'c1', occurred_at: '2026-09-10' })],
      3,
      now,
    );
    expect(result).toEqual([{ categoryId: 'c1', monthlyAverage: 50, monthsWithSpend: 1 }]);
  });

  it('maps an uncategorized transaction to a null categoryId', () => {
    const result = computeCategorySpendAverages(
      [row({ amount: 40, category_id: null, occurred_at: '2026-09-10' })],
      3,
      now,
    );
    expect(result).toEqual([{ categoryId: null, monthlyAverage: 40, monthsWithSpend: 1 }]);
  });
});

describe('computeAverageMonthlyIncome', () => {
  const now = new Date('2026-10-20');

  it('averages income over months that actually had income', () => {
    const result = computeAverageMonthlyIncome(
      [
        row({ amount: 2000, is_income: true, occurred_at: '2026-09-05' }),
        row({ amount: 2200, is_income: true, occurred_at: '2026-08-05' }),
        row({ amount: 500, occurred_at: '2026-09-10' }), // expense -- ignored
      ],
      3,
      now,
    );
    expect(result).toBe(2100);
  });

  it('excludes the current, still-in-progress month', () => {
    const result = computeAverageMonthlyIncome(
      [
        row({ amount: 2000, is_income: true, occurred_at: '2026-09-05' }),
        row({ amount: 9999, is_income: true, occurred_at: '2026-10-05' }),
      ],
      3,
      now,
    );
    expect(result).toBe(2000);
  });

  it('returns 0 when there is no income in the window', () => {
    const result = computeAverageMonthlyIncome([row({ amount: 500, occurred_at: '2026-09-10' })], 3, now);
    expect(result).toBe(0);
  });
});
