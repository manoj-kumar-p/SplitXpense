import {getDatabase} from '../database';
import {generateId} from '../../utils/uuid';
import type {LocalUser, KnownUser} from '../../models/User';

export function getLocalUser(): LocalUser | null {
  const db = getDatabase();
  const result = db.executeSync('SELECT * FROM local_user LIMIT 1;');
  if (result.rows && result.rows.length > 0) {
    return result.rows[0] as unknown as LocalUser;
  }
  return null;
}

export function createLocalUser(phoneNumber: string, displayName: string): LocalUser {
  const db = getDatabase();

  const existing = db.executeSync('SELECT id FROM local_user LIMIT 1;');
  if (existing.rows && existing.rows.length > 0) {
    throw new Error('Local user already exists');
  }

  const now = new Date().toISOString();
  const id = generateId();

  db.executeSync(
    'INSERT INTO local_user (id, phone_number, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?);',
    [id, phoneNumber, displayName, now, now],
  );

  return {id, phone_number: phoneNumber, display_name: displayName, created_at: now, updated_at: now};
}

export function updateLocalUserName(displayName: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.executeSync('UPDATE local_user SET display_name = ?, updated_at = ?;', [displayName, now]);
}

export function updateLocalUserPhone(oldPhone: string, newPhone: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.executeSync('BEGIN;');
  try {
    db.executeSync('UPDATE local_user SET phone_number = ?, updated_at = ? WHERE phone_number = ?;', [newPhone, now, oldPhone]);
    db.executeSync('UPDATE group_members SET phone_number = ? WHERE phone_number = ?;', [newPhone, oldPhone]);
    // Update single-payer expenses (exact match)
    db.executeSync('UPDATE expenses SET paid_by = ? WHERE paid_by = ?;', [newPhone, oldPhone]);
    // Update multi-payer expenses (comma-separated) with exact phone match
    const multiPayer = db.executeSync(
      `SELECT id, paid_by FROM expenses WHERE paid_by LIKE ? AND paid_by != ?;`,
      [`%${oldPhone}%`, oldPhone],
    );
    for (const row of ((multiPayer.rows || []) as any[])) {
      const phones = row.paid_by.split(',');
      const updated = phones.map((p: string) => p === oldPhone ? newPhone : p).join(',');
      if (updated !== row.paid_by) {
        db.executeSync('UPDATE expenses SET paid_by = ? WHERE id = ?;', [updated, row.id]);
      }
    }
    db.executeSync('UPDATE expense_splits SET phone_number = ? WHERE phone_number = ?;', [newPhone, oldPhone]);
    db.executeSync('UPDATE expense_payers SET phone_number = ? WHERE phone_number = ?;', [newPhone, oldPhone]);
    db.executeSync('UPDATE settlements SET paid_by = ? WHERE paid_by = ?;', [newPhone, oldPhone]);
    db.executeSync('UPDATE settlements SET paid_to = ? WHERE paid_to = ?;', [newPhone, oldPhone]);
    db.executeSync('COMMIT;');
  } catch (e) {
    db.executeSync('ROLLBACK;');
    throw e;
  }
}

export function getKnownUser(phoneNumber: string): KnownUser | null {
  const db = getDatabase();
  const result = db.executeSync(
    'SELECT * FROM known_users WHERE phone_number = ? AND is_deleted = 0;',
    [phoneNumber],
  );
  if (result.rows && result.rows.length > 0) {
    return result.rows[0] as unknown as KnownUser;
  }
  return null;
}

export function upsertKnownUser(
  phoneNumber: string,
  displayName: string,
  hlcTimestamp: string,
): KnownUser {
  const db = getDatabase();
  const now = new Date().toISOString();
  const existing = getKnownUser(phoneNumber);

  if (existing) {
    db.executeSync(
      'UPDATE known_users SET display_name = ?, hlc_timestamp = ?, updated_at = ? WHERE phone_number = ?;',
      [displayName, hlcTimestamp, now, phoneNumber],
    );
    return {...existing, display_name: displayName, hlc_timestamp: hlcTimestamp, updated_at: now};
  }

  const id = generateId();
  db.executeSync(
    'INSERT INTO known_users (id, phone_number, display_name, hlc_timestamp, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?);',
    [id, phoneNumber, displayName, hlcTimestamp, now, now],
  );

  return {id, phone_number: phoneNumber, display_name: displayName, hlc_timestamp: hlcTimestamp, is_deleted: 0, created_at: now, updated_at: now};
}

export function getAllKnownUsers(): KnownUser[] {
  const db = getDatabase();
  const result = db.executeSync('SELECT * FROM known_users WHERE is_deleted = 0 ORDER BY display_name;');
  return (result.rows || []) as unknown as KnownUser[];
}
