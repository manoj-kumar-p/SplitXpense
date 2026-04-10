import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

let fcmInitialized = false;

/**
 * Initialize Firebase Admin SDK for Cloud Messaging.
 * Uses the service account JSON file specified in FCM_SERVICE_ACCOUNT_PATH.
 */
export function initFCM(): void {
  if (fcmInitialized) return;

  const serviceAccountPath = process.env.FCM_SERVICE_ACCOUNT_PATH || './firebase-service-account.json';
  const resolvedPath = path.resolve(serviceAccountPath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Firebase service account file not found at: ${resolvedPath}`);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  fcmInitialized = true;
}

/**
 * Send a push notification for a detected transaction.
 * The payload matches what the SplitXpense mobile app expects.
 */
export async function sendTransactionPush(
  fcmToken: string,
  transaction: {amount: number; merchant: string; instrumentId: string},
): Promise<void> {
  if (!fcmInitialized) {
    console.warn('FCM not initialized, skipping push notification');
    return;
  }

  // Amount is in paisa, convert to rupees for display (preserve paise)
  const amountRupees = (transaction.amount / 100).toFixed(2);
  const displayAmount = Number(amountRupees).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const message: admin.messaging.Message = {
    token: fcmToken,
    notification: {
      title: `Spent \u20B9${displayAmount}`,
      body: `${transaction.merchant} \u2022 Tap to add to group`,
    },
    data: {
      type: 'transaction',
      source: 'api',
      amount: String(transaction.amount),
      merchant: transaction.merchant,
      instrumentId: transaction.instrumentId,
    },
    android: {
      priority: 'high',
      notification: {
        channelId: 'transactions',
        icon: 'ic_notification',
      },
    },
  };

  try {
    const messageId = await admin.messaging().send(message);
    console.log(`Push sent: ${messageId} (${transaction.merchant}, \u20B9${displayAmount})`);
  } catch (err) {
    console.error('Failed to send FCM push:', err);
    throw err;
  }
}
