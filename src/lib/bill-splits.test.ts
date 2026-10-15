// Same native-module problem as profile.test.ts -- bill-splits.ts imports
// the real Supabase client for its network functions, so it's stubbed out
// here; this only touches the pure matchKnownParticipant helper.
import { matchKnownParticipant } from './bill-splits';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('matchKnownParticipant', () => {
  const known = [
    { userId: 'u1', label: 'Sarah Jones' },
    { userId: 'u2', label: 'Tom' },
  ];

  it('matches an exact full label, case-insensitive', () => {
    expect(matchKnownParticipant('sarah jones', known)).toEqual({ userId: 'u1', label: 'Sarah Jones' });
  });

  it('matches on first name alone', () => {
    expect(matchKnownParticipant('Sarah', known)).toEqual({ userId: 'u1', label: 'Sarah Jones' });
  });

  it('matches a single-word label directly', () => {
    expect(matchKnownParticipant('tom', known)).toEqual({ userId: 'u2', label: 'Tom' });
  });

  it('returns null for no match', () => {
    expect(matchKnownParticipant('Alex', known)).toBeNull();
  });

  it('returns null for an ambiguous match (two people share a first name)', () => {
    const ambiguous = [...known, { userId: 'u3', label: 'Sarah Smith' }];
    expect(matchKnownParticipant('Sarah', ambiguous)).toBeNull();
  });

  it('returns null for an empty name', () => {
    expect(matchKnownParticipant('  ', known)).toBeNull();
  });
});
