// Same native-module problem as bills.test.ts -- savings-goals.ts
// imports the real Supabase client for its network functions, so it's
// stubbed out here; these tests only touch the pure totalSaved/
// daysUntilTarget helpers, which never call supabase.
import { daysUntilTarget, totalSaved, type GoalContribution } from './savings-goals';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

function contribution(partial: Partial<GoalContribution>): GoalContribution {
  return { id: 'c1', goalId: 'g1', amount: 0, occurredAt: '2026-10-01', ...partial };
}

describe('totalSaved', () => {
  it('sums every contribution', () => {
    const result = totalSaved([contribution({ amount: 200 }), contribution({ amount: 300 }), contribution({ amount: 280 })]);
    expect(result).toBe(780);
  });

  it('is zero with no contributions', () => {
    expect(totalSaved([])).toBe(0);
  });

  it('rounds to the nearest cent', () => {
    const result = totalSaved([contribution({ amount: 10.1 }), contribution({ amount: 20.2 })]);
    expect(result).toBe(30.3);
  });
});

describe('daysUntilTarget', () => {
  const now = new Date(2026, 9, 15); // Thu Oct 15, 2026

  it('returns null when there is no target date', () => {
    expect(daysUntilTarget(null, now)).toBeNull();
  });

  it('counts days remaining to a future date', () => {
    expect(daysUntilTarget('2026-12-15', now)).toBe(61);
  });

  it('returns a negative count once the target date has passed', () => {
    expect(daysUntilTarget('2026-10-01', now)).toBe(-14);
  });

  it('is zero on the target date itself', () => {
    expect(daysUntilTarget('2026-10-15', now)).toBe(0);
  });
});
