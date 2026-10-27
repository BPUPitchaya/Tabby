// Local (on-device) notifications for recurring flat bills -- same
// mechanism as chore-notifications.ts/bill-notifications.ts, IDs keyed
// by bill id. Unlike a chore, a flat bill has no single "assignee" --
// any member can confirm it once it's paid -- so every member's own
// device independently schedules its own reminder for an unconfirmed,
// due cycle; there's no "whose turn" check to gate it the way chores
// have (see the caller in flat.tsx's load()).
import * as Notifications from 'expo-notifications';

export async function requestFlatBillNotificationPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

function reminderId(billId: string): string {
  return `flat-bill-reminder-${billId}`;
}

// `dueDate` is 'YYYY-MM-DD' -- interpreted as noon local time, same
// convention as chore/bill/income reminders.
export async function scheduleFlatBillReminder(billId: string, billName: string, dueDate: string): Promise<void> {
  const id = reminderId(billId);
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  const target = new Date(`${dueDate}T12:00:00`);
  if (target.getTime() <= Date.now()) return;
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: {
      title: `${billName} is due`,
      body: "Log it in Tabby once it's paid -- it splits automatically among the flat.",
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: target },
  });
}

export async function cancelFlatBillReminder(billId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(reminderId(billId)).catch(() => {});
}
