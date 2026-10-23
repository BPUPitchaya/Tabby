// Which flat is "active" right now, for a user who belongs to more than
// one -- a per-device UI preference, not account data, same persistence
// pattern as theme/dashboard-period/trend-period.
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'tabby.active-flat-id';

export async function loadActiveFlatId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function saveActiveFlatId(flatId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, flatId);
  } catch {
    // the caller already updated in-memory state -- losing the persisted
    // value just means it won't survive an app restart
  }
}
