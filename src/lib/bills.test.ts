// Same native-module problem as profile.test.ts -- bills.ts imports the
// real Supabase client for its network functions, so it's stubbed out here;
// these tests only touch the pure getPendingBillDue/getNextBillDueDate
// helpers, which never call supabase.
import { formatDueLabel, getNextBillDueDate, getPendingBillDue, getRelevantBillDate } from './bills';

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

describe('getRelevantBillDate', () => {
  const now = new Date(2026, 9, 15); // Thu Oct 15, 2026

  it('prefers an unresolved pending date over the next scheduled one', () => {
    const result = getRelevantBillDate(
      { frequency: 'weekly', payWeekday: 1, dayOfMonth: null, lastConfirmedDate: null },
      now,
    );
    expect(result).toBe('2026-10-12'); // the overdue cycle, not next week's
  });

  it('falls back to the next scheduled date once the current cycle is resolved', () => {
    const result = getRelevantBillDate(
      { frequency: 'weekly', payWeekday: 1, dayOfMonth: null, lastConfirmedDate: '2026-10-12' },
      now,
    );
    expect(result).toBe('2026-10-19');
  });
});

describe('formatDueLabel', () => {
  const now = new Date(2026, 9, 15); // Thu Oct 15, 2026

  it('labels a past date as overdue', () => {
    expect(formatDueLabel('2026-10-12', now)).toBe('Overdue');
  });

  it('labels today', () => {
    expect(formatDueLabel('2026-10-15', now)).toBe('Due today');
  });

  it('labels tomorrow', () => {
    expect(formatDueLabel('2026-10-16', now)).toBe('Due tomorrow');
  });

  it('labels a day within the next week by weekday name', () => {
    expect(formatDueLabel('2026-10-19', now)).toBe('Due Monday');
  });

  it('labels a farther date with a short date', () => {
    expect(formatDueLabel('2026-11-02', now)).toBe('Due Nov 2');
  });
});
