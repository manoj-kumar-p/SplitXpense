import {Router, Request, Response} from 'express';
import {setuClient as aaClient} from '../services/setuAAInstance';
import {sendTransactionPush} from '../services/pushNotification';
import {addTransaction, updateTransactionStatus} from '../services/transactionStore';
import {getFcmTokenForPhone} from './auth';
import {isDuplicate, isRateLimited} from '../db/redis';
import {getPool} from '../db/postgres';

export const aaRouter = Router();

function isValidPhone(phone: string): boolean {
  return /^\+?\d{10,15}$/.test(phone.replace(/\s/g, ''));
}

/**
 * POST /api/aa/consent/create
 * Create an AA consent request for a user.
 * Body: { phone: string, dateRange: { from: string, to: string } }
 * Returns: { consentHandle: string, redirectUrl: string }
 */
aaRouter.post('/consent/create', async (req: Request, res: Response) => {
  try {
    const {phone, dateRange} = req.body;

    if (!phone || typeof phone !== 'string') {
      return res.status(400).json({error: 'phone is required'});
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({error: 'Invalid phone number format'});
    }
    if (!dateRange?.from || !dateRange?.to) {
      return res
        .status(400)
        .json({error: 'dateRange with from and to is required'});
    }

    // Validate date range format
    const fromDate = new Date(dateRange.from);
    const toDate = new Date(dateRange.to);
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return res.status(400).json({error: 'Invalid date range format'});
    }

    // Rate limit: 3 requests per minute per phone
    const rateLimitKey = `rl:consent:create:${phone}`;
    if (await isRateLimited(rateLimitKey, 3, 60)) {
      return res.status(429).json({error: 'Too many requests. Try again later.'});
    }

    // Check for existing active consent
    const existing = await getPool().query(
      `SELECT id FROM aa_consents WHERE phone = $1 AND status IN ('PENDING', 'APPROVED') LIMIT 1`,
      [phone]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({error: 'Active consent already exists', consentId: existing.rows[0].id});
    }

    const consent = await aaClient.createConsent(phone, dateRange);

    // Store the consent in the database for webhook/scheduler tracking
    await getPool().query(
      `INSERT INTO aa_consents (id, phone, consent_handle, status) VALUES ($1, $2, $3, 'PENDING')`,
      [consent.consentId, phone, consent.consentHandle],
    );

    return res.json({
      consentHandle: consent.consentHandle,
      redirectUrl: consent.redirectUrl,
      consentId: consent.consentId,
    });
  } catch (err) {
    console.error('Consent creation failed:', err);
    return res.status(500).json({error: 'Failed to create consent request'});
  }
});

/**
 * POST /api/aa/consent/status
 * Check the status of an AA consent request.
 * Body: { consentId: string }
 * Returns: { status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED' | 'EXPIRED' }
 */
aaRouter.post('/consent/status', async (req: Request, res: Response) => {
  try {
    const {consentId} = req.body;

    if (!consentId || typeof consentId !== 'string') {
      return res.status(400).json({error: 'consentId is required'});
    }

    const status = await aaClient.getConsentStatus(consentId);

    return res.json({status: status.status, consentId});
  } catch (err) {
    console.error('Consent status check failed:', err);
    return res.status(500).json({error: 'Failed to check consent status'});
  }
});

/**
 * POST /api/aa/fi/fetch
 * Fetch Financial Information (bank statement) using an approved consent.
 * Body: { phone: string, consentId: string }
 * Returns: { transactionCount: number, transactions: ServerTransaction[] }
 */
aaRouter.post('/fi/fetch', async (req: Request, res: Response) => {
  try {
    const {phone, consentId} = req.body;

    if (!phone || typeof phone !== 'string') {
      return res.status(400).json({error: 'phone is required'});
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({error: 'Invalid phone number format'});
    }
    if (!consentId || typeof consentId !== 'string') {
      return res.status(400).json({error: 'consentId is required'});
    }

    // Rate limit: 5 requests per minute per phone
    const rateLimitKey = `rl:fi:fetch:${phone}`;
    if (await isRateLimited(rateLimitKey, 5, 60)) {
      return res.status(429).json({error: 'Too many requests. Try again later.'});
    }

    // Create FI data session
    const session = await aaClient.createFISession(consentId);

    // Store the session_id on the consent for FI webhook lookup
    await getPool().query(
      `UPDATE aa_consents SET session_id = $1 WHERE id = $2`,
      [session.sessionId, consentId],
    );

    // Fetch the actual financial data
    const fiData = await aaClient.fetchFIData(session.sessionId);

    // Parse transactions from FI data and store them
    const transactions = [];
    for (const account of fiData.accounts) {
      for (const txn of account.transactions) {
        // Dedup: skip if this transaction was already ingested recently
        const dedupKey = `txn:${phone}:${txn.txnId || txn.reference}`;
        const duplicate = await isDuplicate(dedupKey, 600);
        if (duplicate) {
          continue;
        }

        const serverTxn = await addTransaction({
          phone,
          amount: txn.amount,
          currency: 'INR',
          merchant: txn.narration || 'Unknown',
          instrument_id: txn.txnId || '',
          transaction_type: txn.type === 'DEBIT' ? 'debit' : 'credit',
          payment_mode: '',
          date: txn.transactionTimestamp,
          source: 'aa',
        });
        transactions.push(serverTxn);

        // Send push notification for debit transactions
        if (txn.type === 'DEBIT') {
          const fcmToken = await getFcmTokenForPhone(phone);
          if (fcmToken) {
            try {
              await sendTransactionPush(fcmToken, {
                amount: txn.amount,
                merchant: txn.narration || 'Unknown',
                instrumentId: txn.txnId || '',
              });
              await updateTransactionStatus(serverTxn.id, 'pushed');
            } catch (pushErr) {
              console.warn('Failed to send push notification:', pushErr);
            }
          }
        }
      }
    }

    return res.json({
      transactionCount: transactions.length,
      transactions,
    });
  } catch (err) {
    console.error('FI fetch failed:', err);
    return res
      .status(500)
      .json({error: 'Failed to fetch financial information'});
  }
});
