// profile.ts imports the real Supabase client for its network functions,
// which side-effect-imports expo-sqlite -- same Jest/native-module problem
// as flats.test.ts and dashboard.test.ts. Stubbed out since these tests
// only touch the pure computeIncomeCycle function, which never calls
// supabase.
import { computeIncomeCycle } from './profile';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('computeIncomeCycle', () => {
  it('returns null when no frequency is set', () => {
    expect(
      computeIncomeCycle({
        frequency: undefined as never,
        payWeekday: null,
        payDayOfMonth: null,
      })
    ).toBeNull();
  });

  describe('weekly', () => {
    it('starts today when today is the pay weekday', () => {
      const now = new Date(2026, 9, 8); // some Thursday-or-other in Oct 2026
      const result = computeIncomeCycle(
        { frequency: 'weekly', payWeekday: now.getDay(), payDayOfMonth: null },
        now
      );
      expect(result?.startDate).toBe('2026-10-08');
      expect(result?.endDate).toBe('2026-10-15'); // +7 days
    });

    it('rolls back to the most recent occurrence of the pay weekday', () => {
      const now = new Date(2026, 9, 8);
      const payWeekday = (now.getDay() - 3 + 7) % 7; // 3 days before "now"
      const result = computeIncomeCycle({ frequency: 'weekly', payWeekday, payDayOfMonth: null }, now);
      expect(result?.startDate).toBe('2026-10-05');
      expect(result?.endDate).toBe('2026-10-12');
    });
  });

  describe('biweekly', () => {
    it('uses a rolling 14-day window from the most recent matching weekday', () => {
      const now = new Date(2026, 9, 8);
      const result = computeIncomeCycle(
        { frequency: 'biweekly', payWeekday: now.getDay(), payDayOfMonth: null },
        now
      );
      expect(result?.startDate).toBe('2026-10-08');
      expect(result?.endDate).toBe('2026-10-22'); // +14 days, not +7
    });
  });

  describe('monthly', () => {
    it("uses this month's pay day when it has already happened", () => {
      const now = new Date(2026, 9, 20); // Oct 20
      const result = computeIncomeCycle(
        { frequency: 'monthly', payWeekday: null, payDayOfMonth: 15 },
        now
      );
      expect(result?.startDate).toBe('2026-10-15');
      expect(result?.endDate).toBe('2026-11-15');
    });

    it("falls back to last month's pay day when this month's hasn't happened yet", () => {
      const now = new Date(2026, 9, 5); // Oct 5, before the 15th
      const result = computeIncomeCycle(
        { frequency: 'monthly', payWeekday: null, payDayOfMonth: 15 },
        now
      );
      expect(result?.startDate).toBe('2026-09-15');
      expect(result?.endDate).toBe('2026-10-15');
    });

    it('clamps a day-of-month that overflows a shorter month', () => {
      // paid on the 31st -- February only has 28 days in 2026 (not a leap year)
      const now = new Date(2026, 2, 5); // Mar 5, before the 31st-clamped-to-28th
      const result = computeIncomeCycle(
        { frequency: 'monthly', payWeekday: null, payDayOfMonth: 31 },
        now
      );
      expect(result?.startDate).toBe('2026-02-28');
      expect(result?.endDate).toBe('2026-03-31');
    });
  });
});
