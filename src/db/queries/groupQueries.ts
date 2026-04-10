import {getDatabase} from '../database';
import {generateId} from '../../utils/uuid';
import {logInsert, logUpdate, logDelete} from '../../sync/syncLogger';
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

  logInsert('groups', id, hlcTimestamp);

  return {id, name, description, icon, simplify_debts: 1, delete_votes: '', created_by: createdBy, hlc_timestamp: hlcTimestamp, is_deleted: 0, created_at: now, updated_at: now};
}

export function updateGroup(id: string, name: string, description: string, hlcTimestamp: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.executeSync(
    'UPDATE groups SET name = ?, description = ?, hlc_timestamp = ?, updated_at = ? WHERE id = ?;',
    [name, description, hlcTimestamp, now, id],
  );

  logUpdate('groups', id, 'name', null, name, hlcTimestamp);
  logUpdate('groups', id, 'description', null, description, hlcTimestamp);
}

export function updateGroupSimplifyDebts(id: string, simplify: boolean, hlcTimestamp: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.executeSync(
    'UPDATE groups SET simplify_debts = ?, hlc_timestamp = ?, updated_at = ? WHERE id = ?;',
    [simplify ? 1 : 0, hlcTimestamp, now, id],
  );

  logUpdate('groups', id, 'simplify_debts', null, simplify ? '1' : '0', hlcTimestamp);
}

export function deleteGroup(id: string, hlcTimestamp: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();

  // Before transaction: fetch all affected row IDs for sync logging
  const expenseRows = db.executeSync('SELECT id FROM expenses WHERE group_id = ?;', [id]);
  const expenseIds = (expenseRows.rows || []).map((r: any) => r.id);
  const splitIds: string[] = [];
  const payerIds: string[] = [];
  for (const eid of expenseIds) {
    const splits = db.executeSync('SELECT id FROM expense_splits WHERE expense_id = ? AND is_deleted = 0;', [eid]);
    splitIds.push(...(splits.rows || []).map((r: any) => r.id));
    const payers = db.executeSync('SELECT id FROM expense_payers WHERE expense_id = ? AND is_deleted = 0;', [eid]);
    payerIds.push(...(payers.rows || []).map((r: any) => r.id));
  }
  const settlementRows = db.executeSync('SELECT id FROM settlements WHERE group_id = ? AND is_deleted = 0;', [id]);
  const settlementIds = (settlementRows.rows || []).map((r: any) => r.id);
  const memberRows = db.executeSync('SELECT id FROM group_members WHERE group_id = ? AND is_deleted = 0;', [id]);
  const memberIds = (memberRows.rows || []).map((r: any) => r.id);

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

  // After COMMIT: log sync DELETE operations for all affected sub-entities
  for (const eid of expenseIds) logDelete('expenses', eid, hlcTimestamp);
  for (const sid of splitIds) logDelete('expense_splits', sid, hlcTimestamp);
  for (const pid of payerIds) logDelete('expense_payers', pid, hlcTimestamp);
  for (const sid of settlementIds) logDelete('settlements', sid, hlcTimestamp);
  for (const mid of memberIds) logDelete('group_members', mid, hlcTimestamp);
  logDelete('groups', id, hlcTimestamp);
}

export function voteDeleteGroup(id: string, phoneNumber: string, hlcTimestamp: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.executeSync('BEGIN TRANSACTION;');
  try {
    // Get current votes
    const result = db.executeSync('SELECT delete_votes FROM groups WHERE id = ?;', [id]);
    const currentVotes = (result.rows && result.rows.length > 0)
      ? ((result.rows[0] as any).delete_votes || '')
      : '';
    const votes = currentVotes ? currentVotes.split(',').filter((v: string) => v) : [];
    if (!votes.includes(phoneNumber)) {
      votes.push(phoneNumber);
    }
    const newVotes = votes.join(',');
    db.executeSync(
      'UPDATE groups SET delete_votes = ?, hlc_timestamp = ?, updated_at = ? WHERE id = ?;',
      [newVotes, hlcTimestamp, now, id],
    );
    db.executeSync('COMMIT;');

    logUpdate('groups', id, 'delete_votes', currentVotes, newVotes, hlcTimestamp);
  } catch (error) {
    db.executeSync('ROLLBACK;');
    throw error;
  }
}

export function clearDeleteVotes(id: string, hlcTimestamp: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.executeSync(
    "UPDATE groups SET delete_votes = '', hlc_timestamp = ?, updated_at = ? WHERE id = ?;",
    [hlcTimestamp, now, id],
  );

  logUpdate('groups', id, 'delete_votes', null, '', hlcTimestamp);
}

export function removeDeleteVote(groupId: string, phoneNumber: string, hlcTimestamp: string): void {
  const db = getDatabase();
  const group = getGroup(groupId);
  if (!group) return;
  const votes = group.delete_votes.split(',').filter(v => v && v !== phoneNumber).join(',');
  db.executeSync(
    'UPDATE groups SET delete_votes = ?, hlc_timestamp = ?, updated_at = ? WHERE id = ?;',
    [votes, hlcTimestamp, new Date().toISOString(), groupId],
  );

  logUpdate('groups', groupId, 'delete_votes', null, votes, hlcTimestamp);
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

  // Check if member was previously soft-deleted
  const existing = db.executeSync(
    'SELECT id, is_deleted FROM group_members WHERE group_id = ? AND phone_number = ?;',
    [groupId, phoneNumber],
  );
  if (existing.rows && existing.rows.length > 0) {
    const row = existing.rows[0] as any;
    if (row.is_deleted === 1) {
      // Reactivate soft-deleted member
      db.executeSync(
        'UPDATE group_members SET is_deleted = 0, display_name = ?, hlc_timestamp = ?, updated_at = ? WHERE group_id = ? AND phone_number = ?;',
        [displayName, hlcTimestamp, now, groupId, phoneNumber],
      );
      logInsert('group_members', row.id, hlcTimestamp);
      return {id: row.id, group_id: groupId, phone_number: phoneNumber, display_name: displayName, added_by: addedBy, hlc_timestamp: hlcTimestamp, is_deleted: 0, created_at: now, updated_at: now};
    }
    // Already active, return existing
    return existing.rows[0] as unknown as GroupMember;
  }

  // New member
  const id = generateId();
  db.executeSync(
    'INSERT INTO group_members (id, group_id, phone_number, display_name, added_by, hlc_timestamp, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?);',
    [id, groupId, phoneNumber, displayName, addedBy, hlcTimestamp, now, now],
  );

  logInsert('group_members', id, hlcTimestamp);

  return {id, group_id: groupId, phone_number: phoneNumber, display_name: displayName, added_by: addedBy, hlc_timestamp: hlcTimestamp, is_deleted: 0, created_at: now, updated_at: now};
}

export function removeGroupMember(groupId: string, phoneNumber: string, hlcTimestamp: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();

  // Fetch row ID for sync logging
  const existing = db.executeSync(
    'SELECT id FROM group_members WHERE group_id = ? AND phone_number = ? AND is_deleted = 0;',
    [groupId, phoneNumber],
  );

  db.executeSync(
    'UPDATE group_members SET is_deleted = 1, hlc_timestamp = ?, updated_at = ? WHERE group_id = ? AND phone_number = ?;',
    [hlcTimestamp, now, groupId, phoneNumber],
  );

  if (existing.rows && existing.rows.length > 0) {
    logDelete('group_members', (existing.rows[0] as any).id, hlcTimestamp);
  }
}
