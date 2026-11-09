// expo-notifications can't even be imported on Android in Expo Go (SDK 53+
// removed remote push support from the Expo Go sandbox there, and merely
// importing the module throws synchronously as a result) even though
// every use in this app is local-only reminders. Every *-notifications.ts
// file loads the real module through this lazy, cached,
// environment-guarded helper instead of importing it directly at module
// scope, so an unsupported environment gets null back at call time
// instead of crashing the whole app at import time.
//
// require(), not a dynamic import() -- Metro's eager/production bundle
// step (used by EAS builds, not the Expo Go dev bundle this was first
// caught on) doesn't handle a dynamic import() of a native module here;
// it fails bundling entirely with an opaque "Cannot read properties of
// undefined (reading 'match')". require() is the conventional React
// Native pattern for an optional native dependency and bundles fine in
// both dev and production.
import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');

let cached: NotificationsModule | null | undefined;

export async function getNotifications(): Promise<NotificationsModule | null> {
  if (cached !== undefined) return cached;
  if (Platform.OS === 'android' && isRunningInExpoGo()) {
    cached = null;
    return cached;
  }
  let loaded: NotificationsModule | null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('expo-notifications');
  } catch {
    loaded = null;
  }
  cached = loaded;
  return cached;
}
