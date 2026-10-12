// Whether the dashboard's "current period" figures (hero net, Earned,
// Spent, category breakdown) follow the user's pay cycle or always use
// the calendar month -- same local-only persistence pattern as theme and
// font preference. The 6-month trend chart is unaffected either way (see
// dashboard.ts).
import AsyncStorage from '@react-native-async-storage/async-storage';

export type DashboardPeriodPreference = 'pay-cycle' | 'calendar-month';

const STORAGE_KEY = 'tabby.dashboard-period-preference';

export async function loadDashboardPeriodPreference(): Promise<DashboardPeriodPreference> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === 'pay-cycle' || stored === 'calendar-month') {
      return stored;
    }
  } catch {
    // fall through to the default below -- a storage read failure
    // shouldn't block the app from rendering
  }
  return 'pay-cycle';
}

export async function setDashboardPeriodPreference(preference: DashboardPeriodPreference): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // the caller already updated in-memory state -- losing the persisted
    // value just means it won't survive an app restart
  }
}
