import {getDatabase} from '../database';
import type {AccountGroupMap, InstrumentType} from '../../models/PendingTransaction';

export function getAllMappings(): AccountGroupMap[] {
  const db = getDatabase();
  const result = db.executeSync(
    `SELECT * FROM account_group_map ORDER BY updated_at DESC;`,
  );
  return (result.rows || []) as unknown as AccountGroupMap[];
}

export function getMappingForInstrument(instrumentId: string): AccountGroupMap | null {
  const db = getDatabase();
  const result = db.executeSync(
    `SELECT * FROM account_group_map WHERE instrument_id = ?;`,
    [instrumentId],
  );
  if (result.rows && result.rows.length > 0) {
    return result.rows[0] as unknown as AccountGroupMap;
  }
  return null;
}

export function upsertMapping(
  instrumentId: string,
  instrumentType: InstrumentType,
  groupId: string,
  label: string,
): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT OR REPLACE INTO account_group_map
      (instrument_id, instrument_type, group_id, label, created_at, updated_at)
     VALUES (?, ?, ?, ?, COALESCE((SELECT created_at FROM account_group_map WHERE instrument_id = ?), ?), ?);`,
    [instrumentId, instrumentType, groupId, label, instrumentId, now, now],
  );
}

export function deleteMapping(instrumentId: string): void {
  const db = getDatabase();
  db.executeSync(
    `DELETE FROM account_group_map WHERE instrument_id = ?;`,
    [instrumentId],
  );
}
