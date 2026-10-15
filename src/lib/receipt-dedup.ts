// Warns when a receipt/statement photo looks like one scanned recently --
// catches the actual common mistake (fat-fingering the same photo twice)
// without trying to fuzzy-match amount/merchant/date after the fact, which
// can't tell a re-scanned receipt apart from a legitimate repeat purchase
// (see session notes: same cafe, same $4.50 latte, different day). Hashing
// the image itself sidesteps that -- identical bytes in means it really is
// the same photo, no ambiguity.
//
// Non-cryptographic hash (FNV-1a) is deliberate -- this only needs to catch
// accidental duplicates, not resist someone deliberately crafting a
// collision, so there's no reason to reach for expo-crypto (a native
// module that would need a prebuild) over a plain JS loop.
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'tabby.recent-receipt-scans';
const RECENT_WINDOW_MS = 48 * 60 * 60 * 1000; // 48h -- long enough to catch "wait, didn't I just scan this?"

export function hashBase64(data: string): string {
  let hash = 0x811c9dc5; // FNV-1a 32-bit offset basis
  for (let i = 0; i < data.length; i++) {
    hash ^= data.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

type ScanRecord = { hash: string; scannedAt: number };

async function loadRecentScans(): Promise<ScanRecord[]> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as ScanRecord[];
    const cutoff = Date.now() - RECENT_WINDOW_MS;
    return parsed.filter((r) => r.scannedAt > cutoff);
  } catch {
    return [];
  }
}

export async function wasRecentlyScanned(hash: string): Promise<boolean> {
  const recent = await loadRecentScans();
  return recent.some((r) => r.hash === hash);
}

export async function recordScan(hash: string): Promise<void> {
  try {
    const recent = await loadRecentScans();
    const next = [...recent, { hash, scannedAt: Date.now() }];
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // losing this just means a future duplicate check misses one entry --
    // not worth surfacing an error for
  }
}
