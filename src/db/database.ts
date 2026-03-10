import {open, type DB} from '@op-engineering/op-sqlite';
import {CREATE_TABLES_SQL} from './schema';

const DB_NAME = 'splittracker.db';

let db: DB | null = null;

export function getDatabase(): DB {
  if (!db) {
    db = open({name: DB_NAME});
    db.executeSync('PRAGMA journal_mode = WAL;');
    db.executeSync('PRAGMA foreign_keys = ON;');
    initializeSchema();
  }
  return db;
}

function initializeSchema(): void {
  if (!db) return;

  const statements = CREATE_TABLES_SQL.split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  db.executeSync('BEGIN TRANSACTION;');
  try {
    for (const stmt of statements) {
      db.executeSync(stmt + ';');
    }
    db.executeSync('COMMIT;');

    // Migrations - add columns that may not exist in older schemas
    runMigrations();
  } catch (error) {
    db.executeSync('ROLLBACK;');
    throw error;
  }
}

function runMigrations(): void {
  if (!db) return;
  const migrations = [
    "ALTER TABLE groups ADD COLUMN icon TEXT DEFAULT '';",
    "ALTER TABLE expenses ADD COLUMN category TEXT DEFAULT 'general';",
    "ALTER TABLE groups ADD COLUMN simplify_debts INTEGER DEFAULT 1;",
    "ALTER TABLE groups ADD COLUMN delete_votes TEXT DEFAULT '';",
    "ALTER TABLE peers ADD COLUMN last_ble_sync TEXT;",
  ];
  for (const sql of migrations) {
    try {
      db.executeSync(sql);
    } catch (_) {
      // Column already exists, ignore
    }
  }
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
