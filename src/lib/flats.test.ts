// These scenarios aren't invented -- they're the exact cases manually
// verified against the live database earlier in development (see commit
// history for "Add Flat Health Score" and the balance-calculation QA
// pass). Codifying them here turns "I checked this once by hand" into a
// permanent regression test.

import {
  computeBalancesFromData,
  computeFlatHealthFromData,
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
