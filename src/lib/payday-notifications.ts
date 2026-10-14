// Local (on-device) notifications for "did you get paid?" -- these fire
// at 12pm local time on the expected payday even if the app isn't open,
// which a bell badge alone can't do. No server/push infra involved: this
// is purely scheduled on-device via expo-notifications.
import * as Notifications from 'expo-notifications';

// Fixed identifiers so re-scheduling replaces the previous one instead of
// stacking duplicates -- at most one "it's payday" and one "still haven't
// heard back" reminder exist at a time.
const PAYDAY_REMINDER_ID = 'payday-reminder';
const PAYDAY_FOLLOWUP_ID = 'payday-followup-reminder';

export async function requestPaydayNotificationPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

// `paydayDate` is 'YYYY-MM-DD' -- interpreted as noon *local* time, not
// UTC, so the 12pm trigger lands on the actual local payday regardless of
// timezone (same local-date convention used throughout the app, see
// toLocalISODate elsewhere).
export async function schedulePaydayReminder(paydayDate: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(PAYDAY_REMINDER_ID).catch(() => {});
  const target = new Date(`${paydayDate}T12:00:00`);
  if (target.getTime() <= Date.now()) return; // already past -- the in-app prompt covers this case instead

  await Notifications.scheduleNotificationAsync({
    identifier: PAYDAY_REMINDER_ID,
    content: {
      title: 'Did you get paid today?',
      body: 'Tap to log it, or confirm later from Tabby.',
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: target },
  });
}

// One follow-up, 12 hours after the user said "not yet" -- not a
// repeating nag, just a single second check-in.
export async function schedulePaydayFollowUp(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(PAYDAY_FOLLOWUP_ID).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: PAYDAY_FOLLOWUP_ID,
    content: {
      title: 'Still waiting to hear -- did that payment come through?',
      body: 'Tap to log it in Tabby.',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(Date.now() + 12 * 60 * 60 * 1000),
    },
  });
}

export async function cancelPaydayFollowUp(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(PAYDAY_FOLLOWUP_ID).catch(() => {});
}

// Both reminders -- used when income tracking itself is turned off, since
// there's no longer a schedule to remind anyone about.
export async function cancelAllPaydayReminders(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(PAYDAY_REMINDER_ID).catch(() => {});
  await Notifications.cancelScheduledNotificationAsync(PAYDAY_FOLLOWUP_ID).catch(() => {});
}
