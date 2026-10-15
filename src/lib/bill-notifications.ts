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

// Days after the due date a quiet "still overdue" nudge fires, while the
// bill remains unresolved -- bounded (not a daily nag forever), same
// reasoning as Money Owing's own fixed reminder cadence. Not an OS
// repeating trigger: that can't be told to stop after day 3 while still
// starting exactly on the due date, so these are pre-scheduled one-shots
// instead, replaced (via scheduleBillReminder's own cancel-then-reschedule)
// every time the bill's cycle advances, and all cancelled together the
// moment it's resolved (see cancelAllBillReminders).
const OVERDUE_NUDGE_DAYS = [1, 2, 3];

function overdueNudgeId(billId: string, dayOffset: number): string {
  return `bill-overdue-${billId}-${dayOffset}`;
}

// `dueDate` is 'YYYY-MM-DD' -- interpreted as noon local time, same
// convention as payday reminders.
export async function scheduleBillReminder(billId: string, billName: string, dueDate: string): Promise<void> {
  const reminderId = `bill-reminder-${billId}`;
  await Notifications.cancelScheduledNotificationAsync(reminderId).catch(() => {});
  const target = new Date(`${dueDate}T12:00:00`);
  if (target.getTime() > Date.now()) {
    await Notifications.scheduleNotificationAsync({
      identifier: reminderId,
      content: {
        title: `${billName} is due today`,
        body: 'Tap to log it, or confirm later from Tabby.',
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: target },
    });
  }

  for (const dayOffset of OVERDUE_NUDGE_DAYS) {
    const nudgeId = overdueNudgeId(billId, dayOffset);
    await Notifications.cancelScheduledNotificationAsync(nudgeId).catch(() => {});
    const nudgeDate = new Date(target.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    if (nudgeDate.getTime() <= Date.now()) continue; // already past -- the in-app bell prompt covers this case instead

    await Notifications.scheduleNotificationAsync({
      identifier: nudgeId,
      content: {
        title: `${billName} is still overdue`,
        body: 'Tap to log it, or skip this cycle, in Tabby.',
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: nudgeDate },
    });
  }
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

// Every scheduled notification for one bill -- used on delete, since
// there's no longer a schedule to remind anyone about.
export async function cancelAllBillReminders(billId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(`bill-reminder-${billId}`).catch(() => {});
  await Notifications.cancelScheduledNotificationAsync(`bill-followup-${billId}`).catch(() => {});
  for (const dayOffset of OVERDUE_NUDGE_DAYS) {
    await Notifications.cancelScheduledNotificationAsync(overdueNudgeId(billId, dayOffset)).catch(() => {});
  }
}
