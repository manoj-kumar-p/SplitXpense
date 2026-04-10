/**
 * @format
 */

import 'react-native-get-random-values';
import notifee, {EventType} from '@notifee/react-native';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

notifee.onBackgroundEvent(async ({type, detail}) => {
  if (type === EventType.PRESS && detail.notification?.data?.type === 'transaction') {
    global.__pendingQuickAddTxnId = detail.notification.data.transactionId;
  }
});

AppRegistry.registerComponent(appName, () => App);
