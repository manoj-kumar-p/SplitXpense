import notifee from '@notifee/react-native';
import {formatCurrency} from '../utils/currency';
import {CHANNEL_TRANSACTIONS} from '../notifications/notificationConstants';
import type {PendingTransaction} from '../models/PendingTransaction';

const PAYMENT_MODE_LABELS: Record<string, string> = {
  upi: 'UPI',
  debit_card: 'Debit Card',
  credit_card: 'Credit Card',
  net_banking: 'Net Banking',
  wallet: 'Wallet',
};

export async function showTransactionNotification(
  txn: PendingTransaction,
): Promise<void> {
  // Title: "Spent ₹500.00" or "Spent ₹500.00 via UPI"
  let title = `Spent ${formatCurrency(txn.amount, txn.currency)}`;
  if (txn.payment_mode) {
    const modeLabel = PAYMENT_MODE_LABELS[txn.payment_mode] || txn.payment_mode;
    title += ` via ${modeLabel}`;
  }

  // Body: note/merchant + instrument + tap prompt
  const parts: string[] = [];
  if (txn.note || txn.merchant) {
    parts.push(txn.note || txn.merchant);
  }
  if (txn.instrument_id) {
    parts.push(txn.instrument_id);
  }
  const body =
    (parts.length > 0 ? parts.join(' \u2022 ') + ' \u2014 ' : '') +
    'Tap to add to group';

  await notifee.displayNotification({
    title,
    body,
    android: {
      channelId: CHANNEL_TRANSACTIONS,
      smallIcon: 'ic_notification',
      pressAction: {
        id: 'quick_add',
        launchActivity: 'default',
      },
    },
    data: {
      type: 'transaction',
      transactionId: txn.id,
    },
  });
}
