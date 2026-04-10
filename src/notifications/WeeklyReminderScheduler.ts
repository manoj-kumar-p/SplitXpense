import notifee, {TriggerType, RepeatFrequency, TimestampTrigger} from '@notifee/react-native';
import {
  CHANNEL_REMINDERS,
  NOTIFICATION_ID_WEEKLY_REMINDER,
  SETTING_WEEKLY_REMINDER,
} from './notificationConstants';
import {formatDebtNotificationBody} from './debtSummary';
import {getSetting} from '../db/queries/settingsQueries';

export async function scheduleWeeklyReminder(): Promise<void> {
  const enabled = getSetting(SETTING_WEEKLY_REMINDER);
  if (enabled === 'false') {
    await cancelWeeklyReminder();
    return;
  }

  // Calculate next Sunday 10:00 AM
  const now = new Date();
  const nextSunday = new Date(now);
  const daysUntilSunday = (7 - now.getDay()) % 7;
  nextSunday.setDate(now.getDate() + daysUntilSunday);
  nextSunday.setHours(10, 0, 0, 0);

  if (nextSunday.getTime() <= Date.now()) {
    nextSunday.setDate(nextSunday.getDate() + 7);
  }

  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: nextSunday.getTime(),
    repeatFrequency: RepeatFrequency.WEEKLY,
  };

  const body = formatDebtNotificationBody() || 'Check your balances in SplitXpense';

  await notifee.createTriggerNotification(
    {
      id: NOTIFICATION_ID_WEEKLY_REMINDER,
      title: 'Weekly Balance Reminder',
      body,
      android: {
        channelId: CHANNEL_REMINDERS,
        smallIcon: 'ic_notification',
        pressAction: {id: 'default'},
      },
    },
    trigger,
  );
}

export async function cancelWeeklyReminder(): Promise<void> {
  await notifee.cancelTriggerNotification(NOTIFICATION_ID_WEEKLY_REMINDER);
}

export async function refreshWeeklyReminder(): Promise<void> {
  await cancelWeeklyReminder();
  await scheduleWeeklyReminder();
}
