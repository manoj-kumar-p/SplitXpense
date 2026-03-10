import {getDatabase} from '../database';
import {generateId} from '../../utils/uuid';
import type {Settlement} from '../../models/Settlement';

export function getGroupSettlements(groupId: string): Settlement[] {
  const db = getDatabase();
  const result = db.executeSync(
    'SELECT * FROM settlements WHERE group_id = ? AND is_deleted = 0 ORDER BY settled_at DESC;',
    [groupId],
  );
  return (result.rows || []) as unknown as Settlement[];
}

export function createSettlement(
  groupId: string,
  paidBy: string,
  paidTo: string,
  amount: number,
  currency: string,
  settledAt: string,
  hlcTimestamp: string,
): Settlement {
  const db = getDatabase();
  const now = new Date().toISOString();
  const id = generateId();

  db.executeSync(
    'INSERT INTO settlements (id, group_id, paid_by, paid_to, amount, currency, settled_at, hlc_timestamp, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?);',
    [id, groupId, paidBy, paidTo, amount, currency, settledAt, hlcTimestamp, now, now],
  );

  return {
    id, group_id: groupId, paid_by: paidBy, paid_to: paidTo, amount, currency,
    settled_at: settledAt, hlc_timestamp: hlcTimestamp, is_deleted: 0,
    created_at: now, updated_at: now,
  };
}

export function deleteSettlement(id: string, hlcTimestamp: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.executeSync(
    'UPDATE settlements SET is_deleted = 1, hlc_timestamp = ?, updated_at = ? WHERE id = ?;',
    [hlcTimestamp, now, id],
  );
}
