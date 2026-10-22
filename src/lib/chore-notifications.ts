// Local (on-device) notifications for chores -- same mechanism as
// bill-notifications.ts/income-source-notifications.ts, IDs keyed per
// chore id. Scoped to a single due-date reminder, no overdue nudges --
// unlike a bill, a chore's assignee can change every cycle (rotating
// mode), so repeatedly nagging about a chore that may no longer even be
// this person's turn risks more confusion than bills' fixed-cadence
// nudges solve.
//
// Crucially, a chore is FLAT-scoped (shared across members) while a
// bill is USER-scoped -- scheduling can't just happen unconditionally
// whenever this device loads the chore list, or every flatmate's phone
// would buzz for a chore that isn't theirs. The caller (flat.tsx) is
// responsible for only calling scheduleChoreReminder for chores where
// currentAssigneeId(chore) === the user on THIS device, and cancelling
// otherwise -- see the "whose turn" check in load().
import * as Notifications from 'expo-notifications';

export async function requestChoreNotificationPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

function reminderId(choreId: string): string {
  return `chore-reminder-${choreId}`;
}

// `dueDate` is 'YYYY-MM-DD' -- interpreted as noon local time, same
// convention as bill/income reminders.
export async function scheduleChoreReminder(choreId: string, choreName: string, dueDate: string): Promise<void> {
  const id = reminderId(choreId);
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  const target = new Date(`${dueDate}T12:00:00`);
  if (target.getTime() <= Date.now()) return;
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: {
      title: `${choreName} is due today`,
      body: "It's your turn -- mark it done in Tabby once it's sorted.",
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: target },
  });
}

export async function cancelChoreReminder(choreId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(reminderId(choreId)).catch(() => {});
}
