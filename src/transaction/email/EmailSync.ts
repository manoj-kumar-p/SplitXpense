import {isGmailConnected} from './GmailAuth';
import {fetchRecentBankEmails, updateLastCheckTimestamp} from './GmailReader';
import {parseEmailTransaction} from './EmailParser';
import {
  insertPendingTransaction,
  findDuplicate,
} from '../../db/queries/pendingTransactionQueries';
import {getMappingForInstrument} from '../../db/queries/accountGroupMapQueries';
import {generateDedupKey} from '../TransactionParser';
import {showTransactionNotification} from '../TransactionNotifier';
import {getSetting} from '../../db/queries/settingsQueries';
import {SETTING_TXN_DETECTION} from '../../notifications/notificationConstants';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Check interval: 15 minutes (in ms). */
const CHECK_INTERVAL_MS = 15 * 60 * 1000;

// ---------------------------------------------------------------------------
// Sync orchestrator
// ---------------------------------------------------------------------------

/**
 * Fetch recent bank emails from Gmail, parse them, de-duplicate, and insert
 * as pending transactions.
 */
export async function syncBankEmails(): Promise<void> {
  // Guard: feature must be enabled
  const enabled = getSetting(SETTING_TXN_DETECTION);
  if (enabled !== 'true') {
    return;
  }

  // Guard: Gmail must be connected
  if (!isGmailConnected()) {
    return;
  }

  try {
    const emails = await fetchRecentBankEmails();

    for (const email of emails) {
      const parsed = parseEmailTransaction(email);
      if (!parsed) {
        continue;
      }

      // Only process debits (same policy as SMS/notification pipeline)
      if (parsed.transactionType !== 'debit') {
        continue;
      }

      // Dedup using amount + time window
      const dedupKey = generateDedupKey(parsed.amount, email.date || new Date().toISOString());
      const existing = findDuplicate(dedupKey);
      if (existing) {
        continue;
      }

      // Check for auto-routing mapping
      let mappedGroupId = '';
      if (parsed.instrumentId) {
        const mapping = getMappingForInstrument(parsed.instrumentId);
        if (mapping) {
          mappedGroupId = mapping.group_id;
        }
      }

      // Build raw text representation for storage
      const rawText = `[Email] ${email.subject}\n${email.body}`.slice(0, 2000);

      // Insert pending transaction with source 'email'
      const note = parsed.merchant || 'Bank transaction';
      const txn = insertPendingTransaction(
        'email',
        rawText,
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

      // Show notification
      showTransactionNotification(txn).catch(() => {});
    }

    // Update the last-check timestamp so next run only fetches newer emails
    updateLastCheckTimestamp();
  } catch (err) {
    // Silently swallow errors — email sync is best-effort and should never
    // crash the app. The next interval will retry automatically.
    console.warn('[EmailSync] sync failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Periodic sync
// ---------------------------------------------------------------------------

let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Start periodic email sync. Runs immediately once, then every 15 minutes.
 */
export function startEmailSync(): void {
  if (intervalId !== null) {
    return; // already running
  }

  // Run once immediately (async, fire-and-forget)
  syncBankEmails().catch(() => {});

  // Schedule recurring checks
  intervalId = setInterval(() => {
    syncBankEmails().catch(() => {});
  }, CHECK_INTERVAL_MS);
}

/**
 * Stop periodic email sync.
 */
export function stopEmailSync(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
