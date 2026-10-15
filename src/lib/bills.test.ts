// Same native-module problem as profile.test.ts -- bills.ts imports the
// real Supabase client for its network functions, so it's stubbed out here;
// these tests only touch the pure getPendingBillDue/getNextBillDueDate
// helpers, which never call supabase.
import { getNextBillDueDate, getPendingBillDue } from './bills';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('getPendingBillDue', () => {
  const now = new Date(2026, 9, 15); // Thu Oct 15, 2026

  it('returns the latest due date when never confirmed', () => {
    const result = getPendingBillDue(
      { frequency: 'weekly', payWeekday: 1, dayOfMonth: null, lastConfirmedDate: null },
      now,
    );
    expect(result).toBe('2026-10-12');
  });

  it('returns null once that cycle has been resolved', () => {
    const result = getPendingBillDue(
      { frequency: 'weekly', payWeekday: 1, dayOfMonth: null, lastConfirmedDate: '2026-10-12' },
      now,
    );
    expect(result).toBeNull();
  });

  it('returns the new due date once a cycle has moved on past an old resolution', () => {
    const result = getPendingBillDue(
      { frequency: 'weekly', payWeekday: 1, dayOfMonth: null, lastConfirmedDate: '2026-10-05' },
      now,
    );
    expect(result).toBe('2026-10-12');
  });
});

describe('getNextBillDueDate', () => {
  it('returns the next occurrence after now', () => {
    const now = new Date(2026, 9, 15); // Thu Oct 15, 2026
    const result = getNextBillDueDate({ frequency: 'weekly', payWeekday: 1, dayOfMonth: null }, now);
    expect(result).toBe('2026-10-19');
  });
});
