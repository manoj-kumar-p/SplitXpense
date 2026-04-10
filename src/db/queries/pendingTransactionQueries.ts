import {getDatabase} from '../database';
import {generateId} from '../../utils/uuid';
import type {PendingTransaction, TxnSource, PaymentMode} from '../../models/PendingTransaction';

export function insertPendingTransaction(
  source: TxnSource,
  rawText: string,
  amount: number,
  currency: string,
  merchant: string,
  paymentMode: PaymentMode,
  instrumentId: string,
  transactionType: 'debit' | 'credit',
  dedupKey: string,
  mappedGroupId: string,
  note?: string,
): PendingTransaction {
  const db = getDatabase();
  const id = generateId();
  const now = new Date().toISOString();
  const resolvedNote = note ?? merchant;

  db.executeSync(
    `INSERT INTO pending_transactions
      (id, source, raw_text, amount, currency, merchant, note, payment_mode, instrument_id,
       transaction_type, detected_at, dedup_key, status, mapped_group_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?);`,
    [id, source, rawText, amount, currency, merchant, resolvedNote, paymentMode, instrumentId,
     transactionType, now, dedupKey, mappedGroupId, now],
  );

  return {
    id, source, raw_text: rawText, amount, currency, merchant,
    note: resolvedNote,
    payment_mode: paymentMode, instrument_id: instrumentId,
    transaction_type: transactionType, detected_at: now,
    dedup_key: dedupKey, status: 'pending',
    mapped_group_id: mappedGroupId, created_at: now,
  };
}

export function findDuplicate(dedupKey: string): PendingTransaction | null {
  const db = getDatabase();
  const result = db.executeSync(
    `SELECT * FROM pending_transactions WHERE dedup_key = ? AND status IN ('pending', 'added') LIMIT 1;`,
    [dedupKey],
  );
  if (result.rows && result.rows.length > 0) {
    return result.rows[0] as unknown as PendingTransaction;
  }
  return null;
}

export function getPendingTransactions(): PendingTransaction[] {
  const db = getDatabase();
  const result = db.executeSync(
    `SELECT * FROM pending_transactions WHERE status = 'pending' ORDER BY detected_at DESC;`,
  );
  return (result.rows || []) as unknown as PendingTransaction[];
}

export function getPendingTransaction(id: string): PendingTransaction | null {
  const db = getDatabase();
  const result = db.executeSync(
    `SELECT * FROM pending_transactions WHERE id = ?;`,
    [id],
  );
  if (result.rows && result.rows.length > 0) {
    return result.rows[0] as unknown as PendingTransaction;
  }
  return null;
}

export function markTransactionAdded(id: string): void {
  const db = getDatabase();
  db.executeSync(
    `UPDATE pending_transactions SET status = 'added' WHERE id = ?;`,
    [id],
  );
}

export function dismissTransaction(id: string): void {
  const db = getDatabase();
  db.executeSync(
    `UPDATE pending_transactions SET status = 'dismissed' WHERE id = ?;`,
    [id],
  );
}

export function cleanOldTransactions(): void {
  const db = getDatabase();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  db.executeSync(
    `DELETE FROM pending_transactions WHERE status != 'pending' AND created_at < ?;`,
    [sevenDaysAgo],
  );
}
