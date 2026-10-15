// Only the pure hash function is tested here -- wasRecentlyScanned/
// recordScan depend on AsyncStorage, same reasoning as other lib tests in
// this project that stick to pure helpers. AsyncStorage itself still needs
// stubbing just to let the module load (it reaches for native code at
// import time), same pattern as the supabase mock elsewhere.
jest.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: jest.fn(), setItem: jest.fn() },
}));

import { hashBase64 } from './receipt-dedup';

describe('hashBase64', () => {
  it('is deterministic for the same input', () => {
    expect(hashBase64('abc123')).toBe(hashBase64('abc123'));
  });

  it('differs for different input', () => {
    expect(hashBase64('abc123')).not.toBe(hashBase64('abc124'));
  });

  it('handles an empty string without throwing', () => {
    expect(() => hashBase64('')).not.toThrow();
  });
});
