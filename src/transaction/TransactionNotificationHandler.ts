import notifee, {EventType} from '@notifee/react-native';
import {navigationRef} from '../app/NavigationRef';

export function setupTransactionNotificationHandlers(): void {
  notifee.onForegroundEvent(({type, detail}) => {
    if (type !== EventType.PRESS) {
      return;
    }

    const data = detail.notification?.data;
    if (!data || data.type !== 'transaction') {
      return;
    }

    const transactionId = data.transactionId as string | undefined;
    if (transactionId) {
      navigateToQuickAdd(transactionId);
    }
  });
}

export function navigateToQuickAdd(transactionId: string): void {
  if (!navigationRef.isReady()) {
    return;
  }

  (navigationRef as any).navigate('Groups', {
    screen: 'QuickAddExpense',
    params: {transactionId},
  });
}
