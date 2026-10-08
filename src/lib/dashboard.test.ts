// dashboard.ts imports the real Supabase client for fetchDashboardData,
// which side-effect-imports expo-sqlite -- same Jest/native-module problem
// as flats.test.ts. Stubbed out since these tests only touch the pure
// computeDashboardFromRows function, which never calls supabase.
import { computeDashboardFromRows, type DashboardRow } from './dashboard';

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
      NOW
    );

    expect(result.thisMonthIncome).toBe(2500);
    expect(result.thisMonthTotal).toBe(149.2);
    expect(result.thisMonthNet).toBe(2350.8);
    expect(result.transactionCount).toBe(3);
  });

  it('excludes income rows from category breakdown', () => {
    const result = computeDashboardFromRows(
      [
        row({ amount: 2500, is_income: true, categories: { name: 'Salary', icon: 'briefcase' } }),
        row({ amount: 40, categories: { name: 'Groceries', icon: 'shopping-cart' }, category_id: 'cat-1' }),
      ],
      NOW
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
      NOW
    );

    const octMonth = result.monthlyTotals.find((m) => m.month === '2026-10');
    expect(octMonth?.total).toBe(50);
  });

  it('allows net to go negative when spend exceeds income', () => {
    const result = computeDashboardFromRows(
      [row({ amount: 100, is_income: true }), row({ amount: 400 })],
      NOW
    );

    expect(result.thisMonthNet).toBe(-300);
  });

  it('ignores transactions from months other than the current one for totals', () => {
    const result = computeDashboardFromRows(
      [
        row({ amount: 2500, is_income: true, occurred_at: '2026-09-15' }),
        row({ amount: 40, occurred_at: '2026-09-20' }),
      ],
      NOW
    );

    expect(result.thisMonthIncome).toBe(0);
    expect(result.thisMonthTotal).toBe(0);
    expect(result.transactionCount).toBe(0);
    // but the expense still shows up in the 6-month chart
    const sepMonth = result.monthlyTotals.find((m) => m.month === '2026-09');
    expect(sepMonth?.total).toBe(40);
  });
});
