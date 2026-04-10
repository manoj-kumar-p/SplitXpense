import {getPool} from '../db/postgres';
import {setuClient} from './setuAAInstance';
import {addTransaction} from './transactionStore';
import {getFcmTokenForPhone} from '../routes/auth';
import {sendTransactionPush} from './pushNotification';
import {isDuplicate} from '../db/redis';
import {maskPhone} from '../utils/mask';

let intervalId: NodeJS.Timeout | null = null;

export function startScheduler(intervalMinutes: number = 15): void {
  // Run immediately on start
  pollAllConsents().catch(console.error);

  // Then run every intervalMinutes
  intervalId = setInterval(() => {
    pollAllConsents().catch(console.error);
  }, intervalMinutes * 60 * 1000);

  console.log(`Scheduler started: polling every ${intervalMinutes} minutes`);
}

export function stopScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

async function pollAllConsents(): Promise<void> {
  const pool = getPool();

  // Get all APPROVED consents
  const result = await pool.query(
    `SELECT * FROM aa_consents WHERE status = 'APPROVED'`,
  );

  for (const consent of result.rows) {
    try {
      // Check if consent is still valid before creating FI session
      const status = await setuClient.getConsentStatus(consent.id);
      if (status.status !== 'ACTIVE' && status.status !== 'APPROVED') {
        await pool.query('UPDATE aa_consents SET status = $1, updated_at = NOW() WHERE id = $2', [status.status, consent.id]);
        continue;
      }

      // Create a new FI session for this consent
      const session = await setuClient.createFISession(consent.id);

      // Fetch the FI data
      const fiData = await setuClient.fetchFIData(session.sessionId);

      // Process transactions
      if (fiData && fiData.accounts) {
        // Fetch FCM token once per consent (avoid N+1 queries)
        const fcmToken = await getFcmTokenForPhone(consent.phone);

        for (const account of fiData.accounts) {
          for (const txn of account.transactions) {
            // Only process debits
            if (txn.type !== 'DEBIT') continue;

            // Dedup check
            const dedupKey = `aa_txn_${consent.phone}_${txn.txnId || txn.reference}`;
            if (await isDuplicate(dedupKey, 86400)) continue; // 24hr dedup window

            // Store transaction (amount is already in paisa from SetuAAClient)
            const stored = await addTransaction({
              phone: consent.phone,
              amount: txn.amount,
              currency: 'INR',
              merchant: txn.narration || txn.reference || '',
              instrument_id: txn.txnId || '',
              transaction_type: 'debit',
              payment_mode: '',
              date: txn.transactionTimestamp || new Date().toISOString(),
              source: 'aa',
            });

            // Send push notification
            if (fcmToken) {
              try {
                await sendTransactionPush(fcmToken, {
                  amount: stored.amount,
                  merchant: stored.merchant,
                  instrumentId: stored.instrument_id,
                });
              } catch (pushErr) {
                console.warn(`Scheduler: failed to send push for ${maskPhone(consent.phone)}:`, pushErr);
              }
            }
          }
        }
      }

      // Update last_polled_at
      await pool.query(
        `UPDATE aa_consents SET last_polled_at = NOW() WHERE id = $1`,
        [consent.id],
      );
    } catch (err) {
      console.error(`Failed to poll consent ${consent.id}:`, err);
    }
  }
}

export {pollAllConsents};
