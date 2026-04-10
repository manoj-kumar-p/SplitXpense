/**
 * Backup importer — restores a serialized BackupDocument into the local DB.
 *
 * Strategy: wipe the user-data tables in a single transaction, then re-insert
 * every row from the backup. We do NOT touch the schema itself — the existing
 * migrations are assumed to have run before this is called.
 */
import {getDatabase} from '../db/database';
import {BACKUP_FORMAT_VERSION, BackupDocument} from './exporter';

const RESTORE_ORDER = [
  'app_settings',
  'local_user',
  'known_users',
  'groups',
  'group_members',
  'expenses',
  'expense_splits',
  'expense_payers',
  'settlements',
  'sync_operations',
  'vector_clocks',
  'pending_transactions',
  'account_group_map',
] as const;

export interface RestoreResult {
  tablesRestored: number;
  rowsRestored: number;
}

export function importBackup(doc: BackupDocument): RestoreResult {
  if (doc.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new Error(
      `Unsupported backup format version: ${doc.formatVersion} (expected ${BACKUP_FORMAT_VERSION})`,
    );
  }
  if (!doc.tables || typeof doc.tables !== 'object') {
    throw new Error('Backup is missing tables data');
  }

  const db = getDatabase();
  let rowsRestored = 0;
  let tablesRestored = 0;

  db.executeSync('BEGIN TRANSACTION;');
  try {
    // Clear in reverse FK order to avoid constraint violations.
    for (const table of [...RESTORE_ORDER].reverse()) {
      db.executeSync(`DELETE FROM ${table};`);
    }

    for (const table of RESTORE_ORDER) {
      const rows = doc.tables[table];
      if (!Array.isArray(rows) || rows.length === 0) continue;

      const columns = Object.keys(rows[0]);
      const placeholders = columns.map(() => '?').join(', ');
      const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders});`;

      for (const row of rows) {
        const values = columns.map(col => (row as any)[col] ?? null);
        db.executeSync(sql, values);
        rowsRestored++;
      }
      tablesRestored++;
    }

    db.executeSync('COMMIT;');
  } catch (err) {
    db.executeSync('ROLLBACK;');
    throw err;
  }

  return {tablesRestored, rowsRestored};
}

export function parseBackup(json: string): BackupDocument {
  const parsed = JSON.parse(json);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Backup is not a valid JSON object');
  }
  if (typeof parsed.formatVersion !== 'number') {
    throw new Error('Backup is missing formatVersion');
  }
  return parsed as BackupDocument;
}
