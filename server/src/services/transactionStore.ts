import {getPool} from '../db/postgres';
import {v4 as uuid} from 'uuid';

export interface ServerTransaction {
  id: string;
  phone: string;
  amount: number;
  currency: string;
  merchant: string;
  instrument_id: string;
  transaction_type: 'debit' | 'credit';
  payment_mode: string;
  date: string;
  source: string;
  status: 'pending' | 'pushed' | 'dismissed';
  created_at: string;
}

export async function addTransaction(
  txn: Omit<ServerTransaction, 'id' | 'created_at' | 'status'>,
): Promise<ServerTransaction> {
  const id = uuid();
  const result = await getPool().query(
    `INSERT INTO server_transactions (id, phone, amount, currency, merchant, instrument_id, transaction_type, payment_mode, date, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      id,
      txn.phone,
      txn.amount,
      txn.currency,
      txn.merchant,
      txn.instrument_id,
      txn.transaction_type,
      txn.payment_mode,
      txn.date,
      txn.source,
    ],
  );
  return result.rows[0];
}

export async function getTransactionsForPhone(
  phone: string,
): Promise<ServerTransaction[]> {
  const result = await getPool().query(
    `SELECT * FROM server_transactions WHERE phone = $1 AND status = 'pending' ORDER BY created_at DESC LIMIT 50`,
    [phone],
  );
  return result.rows;
}

export async function getTransaction(
  id: string,
): Promise<ServerTransaction | null> {
  const result = await getPool().query(
    'SELECT * FROM server_transactions WHERE id = $1',
    [id],
  );
  return result.rows[0] || null;
}

export async function updateTransactionStatus(
  id: string,
  status: 'pending' | 'pushed' | 'dismissed',
): Promise<void> {
  await getPool().query(
    'UPDATE server_transactions SET status = $1 WHERE id = $2',
    [status, id],
  );
}

export async function dismissTransaction(id: string): Promise<void> {
  await updateTransactionStatus(id, 'dismissed');
}
