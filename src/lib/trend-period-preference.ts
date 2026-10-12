// Whether the dashboard's history chart shows weekly or monthly bars.
// 'auto' picks weekly when the user's data is thin (under ~2 months of
// history, per DashboardData.earliestOccurredAt in dashboard.ts) and
// monthly once there's enough history for 6 months to be meaningful --
// same local-only persistence pattern as theme/font/dashboard-period.
import AsyncStorage from '@react-native-async-storage/async-storage';

export type TrendPeriodPreference = 'auto' | 'weekly' | 'monthly';

const STORAGE_KEY = 'tabby.trend-period-preference';

export async function loadTrendPeriodPreference(): Promise<TrendPeriodPreference> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === 'auto' || stored === 'weekly' || stored === 'monthly') {
      return stored;
    }
  } catch {
    // fall through to the default below -- a storage read failure
    // shouldn't block the app from rendering
  }
  return 'auto';
}

export async function setTrendPeriodPreference(preference: TrendPeriodPreference): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // the caller already updated in-memory state -- losing the persisted
    // value just means it won't survive an app restart
  }
}
