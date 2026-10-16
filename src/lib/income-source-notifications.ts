// Local (on-device) notifications for income_sources paydays -- same
// mechanism as payday-notifications.ts, but IDs are keyed per source id
// rather than a single fixed string, since a user can now have several
// jobs paying on different days (see bill-notifications.ts for the same
// per-id pattern already established for bills).
import * as Notifications from 'expo-notifications';

export async function requestIncomeSourceNotificationPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

// `paydayDate` is 'YYYY-MM-DD' -- interpreted as noon local time, same
// convention as the old singleton payday reminder.
export async function scheduleIncomeSourceReminder(
  sourceId: string,
  label: string,
  paydayDate: string,
): Promise<void> {
  const reminderId = `income-source-reminder-${sourceId}`;
  await Notifications.cancelScheduledNotificationAsync(reminderId).catch(() => {});
  const target = new Date(`${paydayDate}T12:00:00`);
  if (target.getTime() <= Date.now()) return; // already past -- the in-app bell prompt covers this case instead

  await Notifications.scheduleNotificationAsync({
    identifier: reminderId,
    content: {
      title: `Did you get paid by ${label} today?`,
      body: 'Tap to log it, or confirm later from Tabby.',
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: target },
  });
}

// One follow-up, 12 hours after "not yet" -- not a repeating nag.
export async function scheduleIncomeSourceFollowUp(sourceId: string, label: string): Promise<void> {
  const followupId = `income-source-followup-${sourceId}`;
  await Notifications.cancelScheduledNotificationAsync(followupId).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: followupId,
    content: {
      title: `Still waiting to hear from ${label}`,
      body: 'Tap to log it in Tabby.',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(Date.now() + 12 * 60 * 60 * 1000),
    },
  });
}

export async function cancelIncomeSourceFollowUp(sourceId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(`income-source-followup-${sourceId}`).catch(() => {});
}

// Every scheduled notification for one source -- used on delete, since
// there's no longer a schedule to remind anyone about.
export async function cancelAllIncomeSourceReminders(sourceId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(`income-source-reminder-${sourceId}`).catch(() => {});
  await Notifications.cancelScheduledNotificationAsync(`income-source-followup-${sourceId}`).catch(() => {});
}
