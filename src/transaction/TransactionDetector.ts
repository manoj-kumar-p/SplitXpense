import {NativeModules, NativeEventEmitter, Platform} from 'react-native';
import {getSetting} from '../db/queries/settingsQueries';
import {
  insertPendingTransaction,
  findDuplicate,
} from '../db/queries/pendingTransactionQueries';
import {getMappingForInstrument} from '../db/queries/accountGroupMapQueries';
import {parseTransaction, generateDedupKey} from './TransactionParser';
import {showTransactionNotification} from './TransactionNotifier';
import {startEmailSync, stopEmailSync} from './email/EmailSync';
import {startServerPoller, stopServerPoller} from './api/ServerPoller';
import {SETTING_TXN_DETECTION} from '../notifications/notificationConstants';
import type {TxnSource} from '../models/PendingTransaction';

const SmsListenerModule = require('@ernestbies/react-native-android-sms-listener');
const {TransactionNotificationModule, TransactionWorkerModule} = NativeModules;

class TransactionDetector {
  private smsSubscription: {remove: () => void} | null = null;
  private notificationSubscription: {remove: () => void} | null = null;
  private backgroundSmsSubscription: any = null;
  private notificationEmitter: NativeEventEmitter | null = null;
  private running = false;

  start(): void {
    if (this.running) {
      return;
    }
    if (getSetting(SETTING_TXN_DETECTION) !== 'true') {
      return;
    }
    this.running = true;

    // SMS source
    this.smsSubscription = SmsListenerModule.addListener(
      (message: {body: string}) => {
        const body = message.body || '';
        // Skip sync protocol messages
        if (body.startsWith('ST1')) {
          return;
        }
        this.handleRawText(body, 'sms');
      },
    );

    // Notification source
    if (TransactionNotificationModule) {
      if (!this.notificationEmitter) {
        this.notificationEmitter = new NativeEventEmitter(TransactionNotificationModule);
      }
      this.notificationSubscription = this.notificationEmitter.addListener(
        'onTransactionNotification',
        (event: {text: string}) => {
          this.handleRawText(event.text, 'notification');
        },
      );
    }

    // Email source (Gmail API periodic sync)
    startEmailSync();

    // Start server polling for AA transactions
    startServerPoller(5);

    // Start background worker for when app is in background
    if (Platform.OS === 'android') {
      TransactionWorkerModule?.startBackgroundCheck();
    }

    // Listen for background SMS detections from WorkManager
    if (TransactionNotificationModule) {
      if (!this.notificationEmitter) {
        this.notificationEmitter = new NativeEventEmitter(TransactionNotificationModule);
      }
      this.backgroundSmsSubscription = this.notificationEmitter.addListener(
        'onBackgroundSmsDetected',
        (event: {body: string; sender: string; timestamp: number}) => {
          this.handleRawText(event.body, 'sms');
        },
      );
    }
  }

  stop(): void {
    if (this.smsSubscription) {
      this.smsSubscription.remove();
      this.smsSubscription = null;
    }
    if (this.notificationSubscription) {
      this.notificationSubscription.remove();
      this.notificationSubscription = null;
    }
    if (Platform.OS === 'android') {
      TransactionWorkerModule?.stopBackgroundCheck();
    }
    this.backgroundSmsSubscription?.remove();
    this.backgroundSmsSubscription = null;
    stopEmailSync();
    stopServerPoller();
    this.running = false;
  }

  private handleRawText(text: string, source: TxnSource): void {
    // 1. Check if transaction detection is enabled
    const enabled = getSetting(SETTING_TXN_DETECTION);
    if (enabled !== 'true') {
      return;
    }

    // 2. Parse the transaction
    const parsed = parseTransaction(text);
    if (!parsed) {
      return;
    }

    // 3. Only process debits
    if (parsed.transactionType !== 'debit') {
      return;
    }

    // 4. Generate dedup key
    const dedupKey = generateDedupKey(parsed.amount, new Date().toISOString());

    // 5. Check for duplicates
    const existing = findDuplicate(dedupKey);
    if (existing) {
      return;
    }

    // 6. Check for auto-routing mapping
    let mappedGroupId = '';
    if (parsed.instrumentId) {
      const mapping = getMappingForInstrument(parsed.instrumentId);
      if (mapping) {
        mappedGroupId = mapping.group_id;
      }
    }

    // 7. Insert pending transaction
    const note = parsed.merchant || 'Bank transaction';
    const txn = insertPendingTransaction(
      source,
      text,
      parsed.amount,
      parsed.currency,
      parsed.merchant,
      parsed.paymentMode,
      parsed.instrumentId,
      parsed.transactionType,
      dedupKey,
      mappedGroupId,
      note,
    );

    // 8. Show notification
    showTransactionNotification(txn).catch(() => {});
  }
}

let instance: TransactionDetector | null = null;

export function getTransactionDetector(): TransactionDetector {
  if (!instance) {
    instance = new TransactionDetector();
  }
  return instance;
}
