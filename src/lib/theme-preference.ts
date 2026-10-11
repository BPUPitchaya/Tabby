// Manual theme override (Settings screen) on top of NativeWind's dark:
// variants. `colorScheme.set()` calls React Native's own
// `Appearance.setColorScheme()` under the hood, which is why every
// `useColorScheme()` call already scattered through the app (icon colors,
// spinner colors) picks up a manual override automatically -- no need to
// touch those call sites.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colorScheme } from 'nativewind';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'tabby.theme-preference';

export async function loadThemePreference(): Promise<ThemePreference> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // fall through to the default below -- a storage read failure
    // shouldn't block the app from rendering
  }
  return 'system';
}

// Called once at app startup to re-apply whatever was last saved, before
// the first real screen renders -- read-only, unlike setThemePreference,
// so it doesn't re-write the same value it just read.
export async function restoreThemePreference(): Promise<void> {
  const preference = await loadThemePreference();
  colorScheme.set(preference);
}

export async function setThemePreference(preference: ThemePreference): Promise<void> {
  colorScheme.set(preference);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // the in-memory colorScheme is already set -- losing the persisted
    // value just means it won't survive an app restart, not worth
    // surfacing an error for
  }
}
