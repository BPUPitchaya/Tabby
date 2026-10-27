// These scenarios aren't invented -- they're the exact cases manually
// verified against the live database earlier in development (see commit
// history for "Add Flat Health Score" and the balance-calculation QA
// pass). Codifying them here turns "I checked this once by hand" into a
// permanent regression test.

import {
  computeBalancesFromData,
  computeFlatHealthFromData,
  computeFlatMonthlyTotalsFromRows,
  computeFlatSpendTrendFromRows,
  type FlatMember,
  type SettlementRow,
  type SplitRow,
  type HealthSplitRow,
} from './flats';

// flats.ts imports the real Supabase client (for its non-pure functions),
// which side-effect-imports expo-sqlite for session storage -- that tries
// to open a native database that doesn't exist in Jest's environment.
// Stubbed out here since these tests only touch the pure calculation
// functions above, which never call supabase at all. (jest.mock calls are
// hoisted above imports by Jest's babel transform regardless of where
// they're written, so this works despite appearing after the import.)
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const FLAT_ID = 'flat-1';
const A = 'user-a';
const B = 'user-b';

function member(userId: string, displayName: string): FlatMember {
  return { user_id: userId, role: 'member', profiles: { display_name: displayName } };
}

describe('computeBalancesFromData', () => {
  it('shows B owing A $50 after A pays $100 split equally', () => {
    const splits: SplitRow[] = [
      { user_id: A, share_amount: 50, shared_expenses: { paid_by: A, flat_id: FLAT_ID } },
      { user_id: B, share_amount: 50, shared_expenses: { paid_by: A, flat_id: FLAT_ID } },
    ];
    const members = [member(A, 'Alice'), member(B, 'Bob')];

    const fromB = computeBalancesFromData(FLAT_ID, B, splits, [], members);
    expect(fromB).toEqual([{ userId: A, displayName: 'Alice', netAmount: -50 }]);

    const fromA = computeBalancesFromData(FLAT_ID, A, splits, [], members);
    expect(fromA).toEqual([{ userId: B, displayName: 'Bob', netAmount: 50 }]);
  });

  it('nets a settlement to zero after it fully covers the debt', () => {
    const splits: SplitRow[] = [
      { user_id: A, share_amount: 50, shared_expenses: { paid_by: A, flat_id: FLAT_ID } },
      { user_id: B, share_amount: 50, shared_expenses: { paid_by: A, flat_id: FLAT_ID } },
    ];
    const settlements: SettlementRow[] = [{ from_user: B, to_user: A, amount: 50 }];
    const members = [member(A, 'Alice'), member(B, 'Bob')];

    const fromB = computeBalancesFromData(FLAT_ID, B, splits, settlements, members);
    expect(fromB[0].netAmount).toBe(0);
  });

  it('consolidates cross-directional expenses to a single net amount', () => {
    // A pays $100 (split 50/50), B pays $60 (split 30/30) -> B owes A net $20
    const splits: SplitRow[] = [
      { user_id: A, share_amount: 50, shared_expenses: { paid_by: A, flat_id: FLAT_ID } },
      { user_id: B, share_amount: 50, shared_expenses: { paid_by: A, flat_id: FLAT_ID } },
      { user_id: A, share_amount: 30, shared_expenses: { paid_by: B, flat_id: FLAT_ID } },
      { user_id: B, share_amount: 30, shared_expenses: { paid_by: B, flat_id: FLAT_ID } },
    ];
    const members = [member(A, 'Alice'), member(B, 'Bob')];

    const fromA = computeBalancesFromData(FLAT_ID, A, splits, [], members);
    expect(fromA).toEqual([{ userId: B, displayName: 'Bob', netAmount: 20 }]);
  });

  it('excluding a member from a split means zero balance impact for them', () => {
    // A logs a solo $40 expense, only including themselves
    const splits: SplitRow[] = [
      { user_id: A, share_amount: 40, shared_expenses: { paid_by: A, flat_id: FLAT_ID } },
    ];
    const members = [member(A, 'Alice'), member(B, 'Bob')];

    const fromB = computeBalancesFromData(FLAT_ID, B, splits, [], members);
    expect(fromB).toEqual([{ userId: A, displayName: 'Alice', netAmount: 0 }]);
  });

  it('ignores splits belonging to a different flat', () => {
    const splits: SplitRow[] = [
      { user_id: B, share_amount: 999, shared_expenses: { paid_by: A, flat_id: 'some-other-flat' } },
    ];
    const members = [member(A, 'Alice'), member(B, 'Bob')];

    const fromB = computeBalancesFromData(FLAT_ID, B, splits, [], members);
    expect(fromB).toEqual([{ userId: A, displayName: 'Alice', netAmount: 0 }]);
  });

  // A deleted flatmate's profile is gone, but 0036's ON DELETE SET NULL
  // means the split/expense/settlement ROWS survive with that pointer
  // nulled out -- these cover the merged "Deleted User" bucket that
  // results (see Balance's own comment for why it's merged rather than
  // per-person).
  describe('a flatmate who has since deleted their account', () => {
    it('shows what you still owe a deleted payer as a "Deleted User" balance', () => {
      const splits: SplitRow[] = [
        { user_id: B, share_amount: 50, shared_expenses: { paid_by: null, flat_id: FLAT_ID } },
      ];
      const members = [member(B, 'Bob')];

      const fromB = computeBalancesFromData(FLAT_ID, B, splits, [], members);
      expect(fromB).toEqual([{ userId: null, displayName: 'Deleted User', netAmount: -50 }]);
    });

    it('shows what a deleted flatmate owed you as a "Deleted User" balance', () => {
      const splits: SplitRow[] = [
        { user_id: null, share_amount: 30, shared_expenses: { paid_by: A, flat_id: FLAT_ID } },
      ];
      const members = [member(A, 'Alice')];

      const fromA = computeBalancesFromData(FLAT_ID, A, splits, [], members);
      expect(fromA).toEqual([{ userId: null, displayName: 'Deleted User', netAmount: 30 }]);
    });

    it('omits the "Deleted User" bucket once a settlement zeroes it out', () => {
      const splits: SplitRow[] = [
        { user_id: B, share_amount: 50, shared_expenses: { paid_by: null, flat_id: FLAT_ID } },
      ];
      const settlements: SettlementRow[] = [{ from_user: B, to_user: null, amount: 50 }];
      const members = [member(B, 'Bob')];

      const fromB = computeBalancesFromData(FLAT_ID, B, splits, settlements, members);
      expect(fromB).toEqual([]);
    });

    it("never attributes a deleted flatmate's history to a real member of the same name", () => {
      // A still a real member, B deleted -- A's own balance must stay
      // untouched by B's now-nulled rows.
      const splits: SplitRow[] = [
        { user_id: A, share_amount: 20, shared_expenses: { paid_by: A, flat_id: FLAT_ID } },
        { user_id: null, share_amount: 20, shared_expenses: { paid_by: A, flat_id: FLAT_ID } },
      ];
      const members = [member(A, 'Alice')];

      const fromA = computeBalancesFromData(FLAT_ID, A, splits, [], members);
      expect(fromA).toEqual([{ userId: null, displayName: 'Deleted User', netAmount: 20 }]);
    });
  });
});

describe('computeFlatHealthFromData', () => {
  it('defaults to a perfect score when there is no spend yet', () => {
    const health = computeFlatHealthFromData(FLAT_ID, [], [], 0);
    expect(health).toEqual({ score: 100, label: 'Excellent', totalOutstanding: 0, totalSpend: 0 });
  });

  it('computes 88/Good for $20 outstanding of $160 total spend', () => {
    const splits: HealthSplitRow[] = [
      { user_id: A, share_amount: 50, shared_expenses: { paid_by: A, flat_id: FLAT_ID, amount: 100 } },
      { user_id: B, share_amount: 50, shared_expenses: { paid_by: A, flat_id: FLAT_ID, amount: 100 } },
      { user_id: A, share_amount: 30, shared_expenses: { paid_by: B, flat_id: FLAT_ID, amount: 60 } },
      { user_id: B, share_amount: 30, shared_expenses: { paid_by: B, flat_id: FLAT_ID, amount: 60 } },
    ];

    const health = computeFlatHealthFromData(FLAT_ID, splits, [], 160);
    expect(health.totalOutstanding).toBe(20);
    expect(health.score).toBe(88);
    expect(health.label).toBe('Good');
  });

  it('returns to a perfect 100 once the outstanding amount is settled', () => {
    const splits: HealthSplitRow[] = [
      { user_id: A, share_amount: 50, shared_expenses: { paid_by: A, flat_id: FLAT_ID, amount: 100 } },
      { user_id: B, share_amount: 50, shared_expenses: { paid_by: A, flat_id: FLAT_ID, amount: 100 } },
      { user_id: A, share_amount: 30, shared_expenses: { paid_by: B, flat_id: FLAT_ID, amount: 60 } },
      { user_id: B, share_amount: 30, shared_expenses: { paid_by: B, flat_id: FLAT_ID, amount: 60 } },
    ];
    const settlements: SettlementRow[] = [{ from_user: B, to_user: A, amount: 20 }];

    const health = computeFlatHealthFromData(FLAT_ID, splits, settlements, 160);
    expect(health).toEqual({ score: 100, label: 'Excellent', totalOutstanding: 0, totalSpend: 160 });
  });

  it('labels a flat with heavy unsettled spend as Needs attention', () => {
    const splits: HealthSplitRow[] = [
      { user_id: A, share_amount: 0, shared_expenses: { paid_by: A, flat_id: FLAT_ID, amount: 100 } },
      { user_id: B, share_amount: 100, shared_expenses: { paid_by: A, flat_id: FLAT_ID, amount: 100 } },
    ];

    const health = computeFlatHealthFromData(FLAT_ID, splits, [], 100);
    expect(health.score).toBe(0);
    expect(health.label).toBe('Needs attention');
  });
});

describe('computeFlatMonthlyTotalsFromRows', () => {
  const now = new Date(2026, 9, 15); // Thu Oct 15, 2026 -- same fixture date as dashboard.test.ts

  it('returns 6 months including months with zero spend, oldest first', () => {
    const result = computeFlatMonthlyTotalsFromRows([], now);
    expect(result.map((m) => m.month)).toEqual([
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
    expect(result.every((m) => m.total === 0)).toBe(true);
  });

  it('sums shared expenses into the correct month bucket', () => {
    const result = computeFlatMonthlyTotalsFromRows(
      [
        { amount: 100, occurred_at: '2026-10-01' },
        { amount: 50, occurred_at: '2026-10-20' },
        { amount: 200, occurred_at: '2026-09-15' },
      ],
      now,
    );
    expect(result.find((m) => m.month === '2026-10')?.total).toBe(150);
    expect(result.find((m) => m.month === '2026-09')?.total).toBe(200);
    expect(result.find((m) => m.month === '2026-08')?.total).toBe(0);
  });

  it('ignores expenses older than the 6-month window', () => {
    const result = computeFlatMonthlyTotalsFromRows([{ amount: 999, occurred_at: '2026-01-01' }], now);
    expect(result.every((m) => m.total === 0)).toBe(true);
  });
});

describe('computeFlatSpendTrendFromRows', () => {
  // Thu Oct 15, 2026 -- same fixture date as above; the Monday of this
  // week is Oct 12, the most recent (newest) bucket in every series.
  const now = new Date(2026, 9, 15);

  it('builds 6 weekly buckets ending on the current week’s Monday', () => {
    const { weekly } = computeFlatSpendTrendFromRows([], now);
    expect(weekly.map((p) => p.key)).toEqual([
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
      '2026-09-28',
      '2026-10-05',
      '2026-10-12',
    ]);
    expect(weekly.every((p) => p.total === 0)).toBe(true);
  });

  it('puts a same-week expense in the most recent weekly bucket', () => {
    const { weekly } = computeFlatSpendTrendFromRows([{ amount: 80, occurred_at: '2026-10-14' }], now);
    expect(weekly[5].total).toBe(80); // 2026-10-12, this week
    expect(weekly[4].total).toBe(0);
  });

  it('puts a two-week-old expense two weekly buckets back', () => {
    const { weekly } = computeFlatSpendTrendFromRows([{ amount: 50, occurred_at: '2026-10-01' }], now);
    expect(weekly[3].total).toBe(50); // 2026-09-28 bucket (14 days before this week's Monday)
    expect(weekly[5].total).toBe(0);
  });

  it('builds 6 biweekly buckets, each spanning two calendar weeks', () => {
    const { biweekly } = computeFlatSpendTrendFromRows([], now);
    expect(biweekly.map((p) => p.key)).toEqual([
      '2026-08-03',
      '2026-08-17',
      '2026-08-31',
      '2026-09-14',
      '2026-09-28',
      '2026-10-12',
    ]);
  });

  it('groups two consecutive weeks into the same biweekly bucket', () => {
    const { biweekly } = computeFlatSpendTrendFromRows(
      [
        { amount: 40, occurred_at: '2026-10-14' }, // this week
        { amount: 60, occurred_at: '2026-10-06' }, // last week
      ],
      now,
    );
    expect(biweekly[5].total).toBe(100); // both land in the current fortnight
  });

  it('still computes the same monthly totals as computeFlatMonthlyTotalsFromRows', () => {
    const rows = [{ amount: 500, occurred_at: '2026-10-01' }];
    const { monthly } = computeFlatSpendTrendFromRows(rows, now);
    expect(monthly).toEqual(computeFlatMonthlyTotalsFromRows(rows, now));
  });
});
