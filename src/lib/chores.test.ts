// Same native-module problem as bills.test.ts -- chores.ts imports the
// real Supabase client for its network functions, so it's stubbed out
// here; these tests only touch the pure currentAssigneeId/
// isChoreDoneThisCycle helpers, which never call supabase.
import { currentAssigneeId, isChoreDoneThisCycle } from './chores';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('currentAssigneeId', () => {
  it('returns null when no one is assigned yet', () => {
    expect(currentAssigneeId({ assigneeOrder: [], rotationIndex: 0 })).toBeNull();
  });

  it('returns the single person for a fixed assignment regardless of rotationIndex', () => {
    expect(currentAssigneeId({ assigneeOrder: ['a'], rotationIndex: 7 })).toBe('a');
  });

  it('wraps around the list as rotationIndex advances past the end', () => {
    const order = ['a', 'b', 'c'];
    expect(currentAssigneeId({ assigneeOrder: order, rotationIndex: 0 })).toBe('a');
    expect(currentAssigneeId({ assigneeOrder: order, rotationIndex: 1 })).toBe('b');
    expect(currentAssigneeId({ assigneeOrder: order, rotationIndex: 4 })).toBe('b'); // 4 % 3 = 1
  });
});

describe('isChoreDoneThisCycle', () => {
  const now = new Date(2026, 9, 15); // Thu Oct 15, 2026 -- same fixture date as bills.test.ts

  it('is not done when never confirmed', () => {
    const result = isChoreDoneThisCycle(
      { frequency: 'weekly', payWeekday: 1, dayOfMonth: null, lastConfirmedDate: null },
      now,
    );
    expect(result).toBe(false);
  });

  it('is done once confirmed for the current cycle', () => {
    const result = isChoreDoneThisCycle(
      { frequency: 'weekly', payWeekday: 1, dayOfMonth: null, lastConfirmedDate: '2026-10-12' },
      now,
    );
    expect(result).toBe(true);
  });

  it('is not done when the confirm was for an older cycle that has since moved on', () => {
    const result = isChoreDoneThisCycle(
      { frequency: 'weekly', payWeekday: 1, dayOfMonth: null, lastConfirmedDate: '2026-10-05' },
      now,
    );
    expect(result).toBe(false);
  });
});
