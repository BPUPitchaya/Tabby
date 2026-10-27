// Same native-module problem as bills.test.ts/chores.test.ts -- flat-bills.ts
// imports the real Supabase client for its network functions, so it's
// stubbed out here; these tests only touch the pure isFlatBillDoneThisCycle
// helper, which never calls supabase.
import { isFlatBillDoneThisCycle } from './flat-bills';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('isFlatBillDoneThisCycle', () => {
  const now = new Date(2026, 9, 15); // Thu Oct 15, 2026 -- same fixture date as bills.test.ts/chores.test.ts

  it('is not done when never confirmed', () => {
    const result = isFlatBillDoneThisCycle(
      { frequency: 'monthly', payWeekday: null, dayOfMonth: 1, lastConfirmedDate: null },
      now,
    );
    expect(result).toBe(false);
  });

  it('is done once confirmed for the current cycle', () => {
    const result = isFlatBillDoneThisCycle(
      { frequency: 'monthly', payWeekday: null, dayOfMonth: 1, lastConfirmedDate: '2026-10-01' },
      now,
    );
    expect(result).toBe(true);
  });

  it('is not done when the confirm was for an older cycle that has since moved on', () => {
    const result = isFlatBillDoneThisCycle(
      { frequency: 'monthly', payWeekday: null, dayOfMonth: 1, lastConfirmedDate: '2026-09-01' },
      now,
    );
    expect(result).toBe(false);
  });
});
