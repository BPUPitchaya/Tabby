// Local (on-device) notifications for recurring bills -- same mechanism as
// payday-notifications.ts, but IDs are keyed per bill id rather than a
// single fixed string, since a user can have many bills due on different
// (or the same) days at once.
import * as Notifications from 'expo-notifications';

export async function requestBillNotificationPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

// `dueDate` is 'YYYY-MM-DD' -- interpreted as noon local time, same
// convention as payday reminders.
export async function scheduleBillReminder(billId: string, billName: string, dueDate: string): Promise<void> {
  const reminderId = `bill-reminder-${billId}`;
  await Notifications.cancelScheduledNotificationAsync(reminderId).catch(() => {});
  const target = new Date(`${dueDate}T12:00:00`);
  if (target.getTime() <= Date.now()) return; // already past -- the in-app bell prompt covers this case instead

  await Notifications.scheduleNotificationAsync({
    identifier: reminderId,
    content: {
      title: `${billName} is due today`,
      body: 'Tap to log it, or confirm later from Tabby.',
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: target },
  });
}

// One follow-up, 12 hours after "not yet" -- not a repeating nag.
export async function scheduleBillFollowUp(billId: string, billName: string): Promise<void> {
  const followupId = `bill-followup-${billId}`;
  await Notifications.cancelScheduledNotificationAsync(followupId).catch(() => {});
  await Notifications.scheduleNotificationAsync({
    identifier: followupId,
    content: {
      title: `Still waiting on ${billName}`,
      body: 'Tap to log it in Tabby.',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(Date.now() + 12 * 60 * 60 * 1000),
    },
  });
}

export async function cancelBillFollowUp(billId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(`bill-followup-${billId}`).catch(() => {});
}

// Both reminders for one bill -- used on delete, since there's no longer a
// schedule to remind anyone about.
export async function cancelAllBillReminders(billId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(`bill-reminder-${billId}`).catch(() => {});
  await Notifications.cancelScheduledNotificationAsync(`bill-followup-${billId}`).catch(() => {});
}
