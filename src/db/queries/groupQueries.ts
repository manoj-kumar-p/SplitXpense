import {getDatabase} from '../database';
import {generateId} from '../../utils/uuid';
import type {Group, GroupMember} from '../../models/Group';

export function getAllGroups(): Group[] {
  const db = getDatabase();
  const result = db.executeSync(
    'SELECT * FROM groups WHERE is_deleted = 0 ORDER BY created_at DESC;',
  );
  return (result.rows || []) as unknown as Group[];
}

export function getGroup(id: string): Group | null {
  const db = getDatabase();
  const result = db.executeSync('SELECT * FROM groups WHERE id = ? AND is_deleted = 0;', [id]);
  if (result.rows && result.rows.length > 0) {
    return result.rows[0] as unknown as Group;
  }
  return null;
}

export function createGroup(
  name: string,
  description: string,
  createdBy: string,
  hlcTimestamp: string,
  icon: string = '',
): Group {
  const db = getDatabase();
  const now = new Date().toISOString();
  const id = generateId();

  db.executeSync(
    'INSERT INTO groups (id, name, description, icon, created_by, hlc_timestamp, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?);',
    [id, name, description, icon, createdBy, hlcTimestamp, now, now],
  );

  return {id, name, description, icon, simplify_debts: 1, delete_votes: '', created_by: createdBy, hlc_timestamp: hlcTimestamp, is_deleted: 0, created_at: now, updated_at: now};
}

export function updateGroup(id: string, name: string, description: string, hlcTimestamp: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.executeSync(
    'UPDATE groups SET name = ?, description = ?, hlc_timestamp = ?, updated_at = ? WHERE id = ?;',
    [name, description, hlcTimestamp, now, id],
  );
}

export function updateGroupSimplifyDebts(id: string, simplify: boolean, hlcTimestamp: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.executeSync(
    'UPDATE groups SET simplify_debts = ?, hlc_timestamp = ?, updated_at = ? WHERE id = ?;',
    [simplify ? 1 : 0, hlcTimestamp, now, id],
  );
}

export function deleteGroup(id: string, hlcTimestamp: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  // Cascade soft-delete: group + all expenses, splits, payers, settlements
  db.executeSync('BEGIN TRANSACTION;');
  try {
    db.executeSync(
      'UPDATE groups SET is_deleted = 1, hlc_timestamp = ?, updated_at = ? WHERE id = ?;',
      [hlcTimestamp, now, id],
    );
    db.executeSync(
      'UPDATE expenses SET is_deleted = 1, hlc_timestamp = ?, updated_at = ? WHERE group_id = ?;',
      [hlcTimestamp, now, id],
    );
    db.executeSync(
      "UPDATE expense_splits SET is_deleted = 1, hlc_timestamp = ?, updated_at = ? WHERE expense_id IN (SELECT id FROM expenses WHERE group_id = ?);",
      [hlcTimestamp, now, id],
    );
    db.executeSync(
      "UPDATE expense_payers SET is_deleted = 1, hlc_timestamp = ?, updated_at = ? WHERE expense_id IN (SELECT id FROM expenses WHERE group_id = ?);",
      [hlcTimestamp, now, id],
    );
    db.executeSync(
      'UPDATE settlements SET is_deleted = 1, hlc_timestamp = ?, updated_at = ? WHERE group_id = ?;',
      [hlcTimestamp, now, id],
    );
    db.executeSync(
      'UPDATE group_members SET is_deleted = 1, hlc_timestamp = ?, updated_at = ? WHERE group_id = ?;',
      [hlcTimestamp, now, id],
    );
    db.executeSync('COMMIT;');
  } catch (error) {
    db.executeSync('ROLLBACK;');
    throw error;
  }
}

export function voteDeleteGroup(id: string, phoneNumber: string, hlcTimestamp: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  // Get current votes
  const result = db.executeSync('SELECT delete_votes FROM groups WHERE id = ?;', [id]);
  const currentVotes = (result.rows && result.rows.length > 0)
    ? ((result.rows[0] as any).delete_votes || '')
    : '';
  const votes = currentVotes ? currentVotes.split(',').filter((v: string) => v) : [];
  if (!votes.includes(phoneNumber)) {
    votes.push(phoneNumber);
  }
  db.executeSync(
    'UPDATE groups SET delete_votes = ?, hlc_timestamp = ?, updated_at = ? WHERE id = ?;',
    [votes.join(','), hlcTimestamp, now, id],
  );
}

export function clearDeleteVotes(id: string, hlcTimestamp: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.executeSync(
    "UPDATE groups SET delete_votes = '', hlc_timestamp = ?, updated_at = ? WHERE id = ?;",
    [hlcTimestamp, now, id],
  );
}

export function getGroupMembers(groupId: string): GroupMember[] {
  const db = getDatabase();
  const result = db.executeSync(
    'SELECT * FROM group_members WHERE group_id = ? AND is_deleted = 0 ORDER BY display_name;',
    [groupId],
  );
  return (result.rows || []) as unknown as GroupMember[];
}

export function addGroupMember(
  groupId: string,
  phoneNumber: string,
  displayName: string,
  addedBy: string,
  hlcTimestamp: string,
): GroupMember {
  const db = getDatabase();
  const now = new Date().toISOString();
  const id = generateId();

  db.executeSync(
    'INSERT OR IGNORE INTO group_members (id, group_id, phone_number, display_name, added_by, hlc_timestamp, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?);',
    [id, groupId, phoneNumber, displayName, addedBy, hlcTimestamp, now, now],
  );

  return {id, group_id: groupId, phone_number: phoneNumber, display_name: displayName, added_by: addedBy, hlc_timestamp: hlcTimestamp, is_deleted: 0, created_at: now, updated_at: now};
}

export function removeGroupMember(groupId: string, phoneNumber: string, hlcTimestamp: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.executeSync(
    'UPDATE group_members SET is_deleted = 1, hlc_timestamp = ?, updated_at = ? WHERE group_id = ? AND phone_number = ?;',
    [hlcTimestamp, now, groupId, phoneNumber],
  );
}
