import { guessCategoryIcon } from './category-icon';

describe('guessCategoryIcon', () => {
  it('matches a known keyword, case-insensitively', () => {
    expect(guessCategoryIcon('Movie Night')).toBe('film');
    expect(guessCategoryIcon('Gym Membership')).toBe('heart');
  });

  it('matches a keyword anywhere in the name, not just as a whole word', () => {
    expect(guessCategoryIcon('Netflix Subscription')).toBe('film');
  });

  it('returns null when nothing matches, leaving the caller to fall back to AI', () => {
    expect(guessCategoryIcon('Xyzzy')).toBeNull();
  });
});
