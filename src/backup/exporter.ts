/**
 * Backup exporter — serializes user data tables to a JSON document.
 *
 * Tables included: user-facing data + CRDT state needed to keep peer sync
 * working after a restore. Excluded: transient transport tables (sms_outbox,
 * sms_inbox_fragments) and discovered peer state (peers), which are rebuilt
 * automatically.
 */
import {getDatabase} from '../db/database';

export const BACKUP_FORMAT_VERSION = 1;

const BACKUP_TABLES = [
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
  'app_settings',
  'pending_transactions',
  'account_group_map',
] as const;

export interface BackupDocument {
  formatVersion: number;
  exportedAt: string;
  appVersion: string;
  tables: Record<string, any[]>;
}

export function exportBackup(appVersion: string = '0.0.1'): BackupDocument {
  const db = getDatabase();
  const tables: Record<string, any[]> = {};
  for (const name of BACKUP_TABLES) {
    const result = db.executeSync(`SELECT * FROM ${name};`);
    tables[name] = (result.rows || []) as any[];
  }
  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion,
    tables,
  };
}

export function serializeBackup(doc: BackupDocument): string {
  return JSON.stringify(doc);
}
