import {getSetting} from '../../db/queries/settingsQueries';
import {fetchServerTransactions} from './ServerSync';
import {
  insertPendingTransaction,
  findDuplicate,
} from '../../db/queries/pendingTransactionQueries';
import {getMappingForInstrument} from '../../db/queries/accountGroupMapQueries';
import {showTransactionNotification} from '../TransactionNotifier';
import {generateDedupKey} from '../TransactionParser';
import type {PaymentMode} from '../../models/PendingTransaction';

let intervalId: ReturnType<typeof setInterval> | null = null;

export async function pollServerTransactions(): Promise<void> {
  const serverUrl = getSetting('server_url');
  if (!serverUrl) return;

  try {
    const transactions = await fetchServerTransactions();

    for (const txn of transactions) {
      // Only process debits
      if (txn.transactionType !== 'debit') continue;

      // Generate dedup key and check locally
      const dedupKey = generateDedupKey(txn.amount, txn.date || new Date().toISOString());
      if (findDuplicate(dedupKey)) continue;

      // Check account-group mapping
      let mappedGroupId = '';
      if (txn.instrumentId) {
        const mapping = getMappingForInstrument(txn.instrumentId);
        if (mapping) mappedGroupId = mapping.group_id;
      }

      // Insert into local pending_transactions
      const note = txn.merchant || 'Bank transaction';
      const pending = insertPendingTransaction(
        'api',
        `Server: ${txn.merchant || 'Bank transaction'}`,
        txn.amount,
        txn.currency || 'INR',
        txn.merchant || '',
        (txn.paymentMode || '') as PaymentMode,
        txn.instrumentId || '',
        'debit',
        dedupKey,
        mappedGroupId,
        note,
      );

      // Show local notification
      await showTransactionNotification(pending);
    }
  } catch (err) {
    // Silent fail — will retry next interval
  }
}

export function startServerPoller(intervalMinutes: number = 5): void {
  if (intervalId !== null) return;

  // Run immediately
  pollServerTransactions().catch(() => {});

  // Then run on interval
  intervalId = setInterval(() => {
    pollServerTransactions().catch(() => {});
  }, intervalMinutes * 60 * 1000);
}

export function stopServerPoller(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
