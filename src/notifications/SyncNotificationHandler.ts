import {getNotificationService} from './NotificationService';
import {CHANNEL_SYNC, SETTING_SYNC_NOTIFICATIONS} from './notificationConstants';
import {getSetting} from '../db/queries/settingsQueries';

export type SyncMethod = 'wifi' | 'sms' | 'ble';

const METHOD_LABELS: Record<SyncMethod, string> = {
  wifi: 'WiFi',
  sms: 'SMS',
  ble: 'Bluetooth',
};

const NOTIFICATION_DEBOUNCE_MS = 60_000;
let lastSyncNotifTime = 0;

export async function notifySyncComplete(
  method: SyncMethod,
  operationsSynced: number,
  peerName?: string,
): Promise<void> {
  const enabled = getSetting(SETTING_SYNC_NOTIFICATIONS);
  if (enabled === 'false') return;

  if (operationsSynced <= 0) return;

  const now = Date.now();
  if (now - lastSyncNotifTime < NOTIFICATION_DEBOUNCE_MS) return;
  lastSyncNotifTime = now;

  const methodLabel = METHOD_LABELS[method];
  const opLabel = operationsSynced === 1 ? 'change' : 'changes';
  const peerSuffix = peerName ? ` with ${peerName}` : '';

  await getNotificationService().display({
    title: 'Sync Complete',
    body: `${operationsSynced} ${opLabel} synced via ${methodLabel}${peerSuffix}`,
    channelId: CHANNEL_SYNC,
  });
}
