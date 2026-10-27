// Whether the Flat screen's spend-trend chart shows weekly, biweekly, or
// monthly bars. 'auto' picks weekly for a brand-new flat (thin history),
// biweekly once there's a couple months of it, and monthly once there's
// enough history (~6 months) for that to be the more useful view -- same
// local-only persistence pattern as the personal dashboard's own
// trend-period-preference.ts, with an extra biweekly tier since a flat's
// shared costs (rent/power/internet) are logged far less often than
// personal transactions, so the weekly->monthly jump alone left a gap.
import AsyncStorage from '@react-native-async-storage/async-storage';

export type FlatTrendPeriodPreference = 'auto' | 'weekly' | 'biweekly' | 'monthly';

const STORAGE_KEY = 'tabby.flat-trend-period-preference';

export async function loadFlatTrendPeriodPreference(): Promise<FlatTrendPeriodPreference> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === 'auto' || stored === 'weekly' || stored === 'biweekly' || stored === 'monthly') {
      return stored;
    }
  } catch {
    // fall through to the default below -- a storage read failure
    // shouldn't block the app from rendering
  }
  return 'auto';
}

export async function setFlatTrendPeriodPreference(preference: FlatTrendPeriodPreference): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // the caller already updated in-memory state -- losing the persisted
    // value just means it won't survive an app restart
  }
}
