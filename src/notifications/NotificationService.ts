import notifee, {AndroidImportance} from '@notifee/react-native';
import {Platform, PermissionsAndroid} from 'react-native';
import {CHANNEL_SYNC, CHANNEL_REMINDERS} from './notificationConstants';

class NotificationService {
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    await notifee.createChannel({
      id: CHANNEL_SYNC,
      name: 'Sync Events',
      description: 'Notifications when data syncs with other devices',
      importance: AndroidImportance.DEFAULT,
    });

    await notifee.createChannel({
      id: CHANNEL_REMINDERS,
      name: 'Weekly Reminders',
      description: 'Weekly reminder of outstanding debts',
      importance: AndroidImportance.HIGH,
    });

    this.initialized = true;
  }

  async requestPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    const apiLevel = Platform.Version;
    if (typeof apiLevel === 'number' && apiLevel >= 33) {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    }

    return true;
  }

  async display(params: {
    title: string;
    body: string;
    channelId: string;
    id?: string;
  }): Promise<void> {
    await notifee.displayNotification({
      id: params.id,
      title: params.title,
      body: params.body,
      android: {
        channelId: params.channelId,
        smallIcon: 'ic_notification',
        pressAction: {id: 'default'},
      },
    });
  }
}

let instance: NotificationService | null = null;

export function getNotificationService(): NotificationService {
  if (!instance) {
    instance = new NotificationService();
  }
  return instance;
}
