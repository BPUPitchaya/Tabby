// dashboard.ts imports the real Supabase client for fetchDashboardData,
// which side-effect-imports expo-sqlite -- same Jest/native-module problem
// as flats.test.ts. Stubbed out since these tests only touch the pure
// computeDashboardFromRows function, which never calls supabase.
import {
  computeDashboardFromRows,
  findNotableCategorySwing,
  type CategoryTotal,
  type DashboardRow,
} from './dashboard';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const NOW = new Date('2026-10-15T00:00:00Z');

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

describe('computeDashboardFromRows', () => {
  it('separates this month income from expenses and computes net', () => {
    const result = computeDashboardFromRows(
      [
        row({ amount: 2500, is_income: true, occurred_at: '2026-10-03' }),
        row({ amount: 84.2, occurred_at: '2026-10-05' }),
        row({ amount: 65, occurred_at: '2026-10-04' }),
      ],
      null,
      NOW,
    );

    expect(result.periodIncome).toBe(2500);
    expect(result.periodTotal).toBe(149.2);
    expect(result.periodNet).toBe(2350.8);
    expect(result.transactionCount).toBe(3);
  });

  it('excludes income rows from category breakdown', () => {
    const result = computeDashboardFromRows(
      [
        row({ amount: 2500, is_income: true, categories: { name: 'Salary', icon: 'briefcase' } }),
        row({ amount: 40, categories: { name: 'Groceries', icon: 'shopping-cart' }, category_id: 'cat-1' }),
      ],
      null,
      NOW,
    );

    expect(result.categoryTotals).toHaveLength(1);
    expect(result.categoryTotals[0].name).toBe('Groceries');
  });

  it('excludes income rows from the 6-month chart', () => {
    const result = computeDashboardFromRows(
      [
        row({ amount: 2500, is_income: true, occurred_at: '2026-10-03' }),
        row({ amount: 50, occurred_at: '2026-10-05' }),
      ],
      null,
      NOW,
    );

    const octMonth = result.monthlyTotals.find((m) => m.month === '2026-10');
    expect(octMonth?.total).toBe(50);
  });

  it('allows net to go negative when spend exceeds income', () => {
    const result = computeDashboardFromRows(
      [row({ amount: 100, is_income: true }), row({ amount: 400 })],
      null,
      NOW,
    );

    expect(result.periodNet).toBe(-300);
  });

  it('ignores transactions from months other than the current one for totals', () => {
    const result = computeDashboardFromRows(
      [
        row({ amount: 2500, is_income: true, occurred_at: '2026-09-15' }),
        row({ amount: 40, occurred_at: '2026-09-20' }),
      ],
      null,
      NOW,
    );

    expect(result.periodIncome).toBe(0);
    expect(result.periodTotal).toBe(0);
    expect(result.transactionCount).toBe(0);
    // but the expense still shows up in the 6-month chart
    const sepMonth = result.monthlyTotals.find((m) => m.month === '2026-09');
    expect(sepMonth?.total).toBe(40);
  });

  it('uses a custom period instead of the calendar month when given', () => {
    const result = computeDashboardFromRows(
      [
        // within the pay-cycle window, but spans a month boundary
        row({ amount: 100, occurred_at: '2026-09-29' }),
        row({ amount: 50, occurred_at: '2026-10-02' }),
        // outside the window
        row({ amount: 999, occurred_at: '2026-09-20' }),
        row({ amount: 999, occurred_at: '2026-10-06' }),
      ],
      { startDate: '2026-09-29', endDate: '2026-10-06' },
      NOW,
    );

    expect(result.periodTotal).toBe(150);
    expect(result.transactionCount).toBe(2);
  });

  it('buckets the 6-week trend by Monday-start week and tracks the earliest date', () => {
    const result = computeDashboardFromRows(
      [
        // NOW is 2026-10-15, a Thursday -- that week's Monday is 2026-10-12
        row({ amount: 20, occurred_at: '2026-10-13' }),
        row({ amount: 5, occurred_at: '2026-10-12' }),
        // previous week (Monday 2026-10-05)
        row({ amount: 30, occurred_at: '2026-10-06' }),
      ],
      null,
      NOW,
    );

    const thisWeek = result.weeklyTotals.find((w) => w.weekStart === '2026-10-12');
    const lastWeek = result.weeklyTotals.find((w) => w.weekStart === '2026-10-05');
    expect(thisWeek?.total).toBe(25);
    expect(lastWeek?.total).toBe(30);
    expect(result.weeklyTotals).toHaveLength(6);
    expect(result.earliestOccurredAt).toBe('2026-10-06');
  });
});

describe('findNotableCategorySwing', () => {
  function cat(partial: Partial<CategoryTotal>): CategoryTotal {
    return { categoryId: 'cat-1', name: 'Dining Out', icon: null, total: 0, ...partial };
  }

  it('flags a category that swung by at least $20 and 15%', () => {
    const result = findNotableCategorySwing(
      [cat({ categoryId: 'cat-1', name: 'Dining Out', total: 140 })],
      [cat({ categoryId: 'cat-1', name: 'Dining Out', total: 100 })],
    );
    expect(result).toEqual({ name: 'Dining Out', thisMonthTotal: 140, lastMonthTotal: 100 });
  });

  it('ignores a swing under the $20 floor even if the percentage is large', () => {
    const result = findNotableCategorySwing(
      [cat({ categoryId: 'cat-1', total: 15 })],
      [cat({ categoryId: 'cat-1', total: 5 })],
    );
    expect(result).toBeNull();
  });

  it('ignores a swing under 15% even if the dollar amount is large', () => {
    const result = findNotableCategorySwing(
      [cat({ categoryId: 'cat-1', total: 1050 })],
      [cat({ categoryId: 'cat-1', total: 1000 })],
    );
    expect(result).toBeNull();
  });

  it('treats a brand-new category (nothing spent last month) as notable once past the $20 floor', () => {
    const result = findNotableCategorySwing(
      [cat({ categoryId: 'cat-2', name: 'Entertainment', total: 45 })],
      [],
    );
    expect(result).toEqual({ name: 'Entertainment', thisMonthTotal: 45, lastMonthTotal: 0 });
  });

  it('picks the single biggest swing, not just the biggest category', () => {
    const result = findNotableCategorySwing(
      [
        cat({ categoryId: 'cat-1', name: 'Rent', total: 1000 }), // unchanged, not a swing
        cat({ categoryId: 'cat-2', name: 'Dining Out', total: 140 }), // +$40
      ],
      [
        cat({ categoryId: 'cat-1', name: 'Rent', total: 1000 }),
        cat({ categoryId: 'cat-2', name: 'Dining Out', total: 100 }),
      ],
    );
    expect(result?.name).toBe('Dining Out');
  });

  it('returns null when nothing swings enough to be notable', () => {
    const result = findNotableCategorySwing(
      [cat({ categoryId: 'cat-1', total: 100 })],
      [cat({ categoryId: 'cat-1', total: 100 })],
    );
    expect(result).toBeNull();
  });
});
