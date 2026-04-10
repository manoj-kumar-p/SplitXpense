import {Router, Request, Response} from 'express';
import {getPool} from '../db/postgres';
import {setuClient as aaClient} from '../services/setuAAInstance';
import {addTransaction, updateTransactionStatus} from '../services/transactionStore';
import {getFcmTokenForPhone} from './auth';
import {sendTransactionPush} from '../services/pushNotification';
import {isDuplicate} from '../db/redis';
import {maskPhone} from '../utils/mask';

export const webhookRouter = Router();

/**
 * POST /api/webhook/consent/notification
 * Called by Setu AA when consent status changes (ACTIVE, REJECTED, REVOKED, PAUSED, EXPIRED).
 *
 * Body shape (Setu AA v2):
 * {
 *   "ver": "2.0.0",
 *   "timestamp": "2024-01-01T00:00:00.000Z",
 *   "txnid": "...",
 *   "Notifier": { "type": "AA", "id": "..." },
 *   "ConsentStatusNotification": {
 *     "consentId": "...",
 *     "consentHandle": "...",
 *     "consentStatus": "ACTIVE" | "REJECTED" | "REVOKED" | "PAUSED" | "EXPIRED"
 *   }
 * }
 */
webhookRouter.post('/consent/notification', async (req: Request, res: Response) => {
  try {
    // TODO: Verify webhook signature from x-jws-signature header
    // const signature = req.headers['x-jws-signature'];
    // Implement JWS verification with Setu's public key

    const {ConsentStatusNotification} = req.body;

    if (!ConsentStatusNotification) {
      return res.status(400).json({error: 'Missing ConsentStatusNotification'});
    }

    const {consentId, consentHandle, consentStatus} = ConsentStatusNotification;

    if (!consentId || !consentStatus) {
      return res.status(400).json({error: 'Missing consentId or consentStatus'});
    }

    console.log(`Consent webhook: ${consentId} -> ${consentStatus}`);

    const pool = getPool();

    // Update consent status in the database
    // Setu uses "ACTIVE" for approved consents, map to our internal "APPROVED"
    const mappedStatus = consentStatus === 'ACTIVE' ? 'APPROVED' : consentStatus;

    await pool.query(
      `UPDATE aa_consents SET status = $1, updated_at = NOW() WHERE id = $2 OR consent_handle = $3`,
      [mappedStatus, consentId, consentHandle],
    );

    // If consent is approved/active, automatically trigger FI data fetch
    if (consentStatus === 'ACTIVE') {
      // Look up the phone number for this consent
      const consentResult = await pool.query(
        `SELECT phone FROM aa_consents WHERE id = $1 OR consent_handle = $2 LIMIT 1`,
        [consentId, consentHandle],
      );

      if (consentResult.rows.length > 0) {
        const phone = consentResult.rows[0].phone;

        try {
          // Create FI session and fetch data
          const session = await aaClient.createFISession(consentId);

          // Store session_id on the consent for later FI webhook lookup
          await pool.query(
            `UPDATE aa_consents SET session_id = $1 WHERE id = $2 OR consent_handle = $3`,
            [session.sessionId, consentId, consentHandle],
          );

          const fiData = await aaClient.fetchFIData(session.sessionId);

          // Fetch FCM token once before the loop (avoid N+1)
          const fcmToken = await getFcmTokenForPhone(phone);

          // Process transactions from all accounts
          for (const account of fiData.accounts) {
            for (const txn of account.transactions) {
              // Only process debits for push notifications
              if (txn.type !== 'DEBIT') continue;

              // Dedup check
              const dedupKey = `aa_txn_${phone}_${txn.txnId || txn.reference}`;
              if (await isDuplicate(dedupKey, 86400)) continue; // 24hr dedup window

              // Store transaction
              const stored = await addTransaction({
                phone,
                amount: txn.amount, // already in paisa from SetuAAClient
                currency: 'INR',
                merchant: txn.narration || 'Unknown',
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
                  await updateTransactionStatus(stored.id, 'pushed');
                } catch (pushErr) {
                  console.warn('Webhook: failed to send push:', pushErr);
                }
              }
            }
          }

          console.log(`Consent webhook: auto-fetched FI data for ${maskPhone(phone)}`);
        } catch (fiErr) {
          console.error(`Consent webhook: FI fetch failed for consent ${consentId}:`, fiErr);
        }
      }
    }

    return res.status(200).json({ok: true});
  } catch (err) {
    console.error('Consent webhook error:', err);
    return res.status(500).json({error: 'Internal server error'});
  }
});

/**
 * POST /api/webhook/fi/notification
 * Called by Setu AA when FI data is ready for a session.
 *
 * Body shape (Setu AA v2):
 * {
 *   "ver": "2.0.0",
 *   "timestamp": "...",
 *   "txnid": "...",
 *   "Notifier": { "type": "AA", "id": "..." },
 *   "FIStatusNotification": {
 *     "sessionId": "...",
 *     "sessionStatus": "ACTIVE" | "COMPLETED" | "EXPIRED" | "FAILED",
 *     "FIStatusResponse": [...]
 *   }
 * }
 */
webhookRouter.post('/fi/notification', async (req: Request, res: Response) => {
  try {
    // TODO: Verify webhook signature from x-jws-signature header

    const {FIStatusNotification} = req.body;

    if (!FIStatusNotification) {
      return res.status(400).json({error: 'Missing FIStatusNotification'});
    }

    const {sessionId, sessionStatus} = FIStatusNotification;

    if (!sessionId) {
      return res.status(400).json({error: 'Missing sessionId'});
    }

    console.log(`FI webhook: session ${sessionId} -> ${sessionStatus}`);

    // Only fetch data when session is ACTIVE or COMPLETED
    if (sessionStatus !== 'ACTIVE' && sessionStatus !== 'COMPLETED') {
      console.log(`FI webhook: ignoring session status ${sessionStatus}`);
      return res.status(200).json({ok: true});
    }

    // Fetch FI data from Setu
    const fiData = await aaClient.fetchFIData(sessionId);

    const pool = getPool();

    // Look up the phone number for this session via the stored session_id
    const consentResult = await pool.query(
      `SELECT phone FROM aa_consents WHERE session_id = $1`,
      [sessionId],
    );

    if (consentResult.rows.length === 0) {
      console.warn(`FI webhook: no consent found for session ${sessionId}`);
      return res.status(200).json({ok: true});
    }

    const phone = consentResult.rows[0].phone;

    // Fetch FCM token once before the loop (avoid N+1)
    const fcmToken = await getFcmTokenForPhone(phone);

    // Process each account's transactions
    for (const account of fiData.accounts) {
      for (const txn of account.transactions) {
        // Only process debits
        if (txn.type !== 'DEBIT') continue;

        // Dedup check
        const dedupKey = `aa_fi_${phone}_${txn.txnId || txn.reference}`;
        if (await isDuplicate(dedupKey, 86400)) continue;

        // Store transaction
        const stored = await addTransaction({
          phone,
          amount: txn.amount, // already in paisa from SetuAAClient
          currency: 'INR',
          merchant: txn.narration || 'Unknown',
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
            await updateTransactionStatus(stored.id, 'pushed');
          } catch (pushErr) {
            console.warn('FI webhook: failed to send push:', pushErr);
          }
        }
      }
    }

    return res.status(200).json({ok: true});
  } catch (err) {
    console.error('FI webhook error:', err);
    return res.status(500).json({error: 'Internal server error'});
  }
});
