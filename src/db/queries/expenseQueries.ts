import {getDatabase} from '../database';
import {generateId} from '../../utils/uuid';
import type {Expense, ExpenseSplit, ExpensePayer, SplitType} from '../../models/Expense';

export function getGroupExpenses(groupId: string): Expense[] {
  const db = getDatabase();
  const result = db.executeSync(
    'SELECT * FROM expenses WHERE group_id = ? AND is_deleted = 0 ORDER BY expense_date DESC, created_at DESC;',
    [groupId],
  );
  return (result.rows || []) as unknown as Expense[];
}

export function getExpense(id: string): Expense | null {
  const db = getDatabase();
  const result = db.executeSync('SELECT * FROM expenses WHERE id = ? AND is_deleted = 0;', [id]);
  if (result.rows && result.rows.length > 0) {
    return result.rows[0] as unknown as Expense;
  }
  return null;
}

export function createExpense(
  groupId: string,
  description: string,
  amount: number,
  currency: string,
  paidBy: string,
  splitType: SplitType,
  expenseDate: string,
  hlcTimestamp: string,
  category: string = 'general',
): Expense {
  const db = getDatabase();
  const now = new Date().toISOString();
  const id = generateId();

  db.executeSync(
    'INSERT INTO expenses (id, group_id, description, amount, currency, paid_by, split_type, category, expense_date, hlc_timestamp, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?);',
    [id, groupId, description, amount, currency, paidBy, splitType, category, expenseDate, hlcTimestamp, now, now],
  );

  return {
    id, group_id: groupId, description, amount, currency, paid_by: paidBy,
    split_type: splitType, category, expense_date: expenseDate, hlc_timestamp: hlcTimestamp,
    is_deleted: 0, created_at: now, updated_at: now,
  };
}

export function updateExpense(
  id: string,
  description: string,
  amount: number,
  currency: string,
  paidBy: string,
  splitType: SplitType,
  expenseDate: string,
  hlcTimestamp: string,
  category: string = 'general',
): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.executeSync(
    'UPDATE expenses SET description = ?, amount = ?, currency = ?, paid_by = ?, split_type = ?, category = ?, expense_date = ?, hlc_timestamp = ?, updated_at = ? WHERE id = ?;',
    [description, amount, currency, paidBy, splitType, category, expenseDate, hlcTimestamp, now, id],
  );
}

export function deleteExpense(id: string, hlcTimestamp: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.executeSync(
    'UPDATE expenses SET is_deleted = 1, hlc_timestamp = ?, updated_at = ? WHERE id = ?;',
    [hlcTimestamp, now, id],
  );
}

export function getExpenseSplits(expenseId: string): ExpenseSplit[] {
  const db = getDatabase();
  const result = db.executeSync(
    'SELECT * FROM expense_splits WHERE expense_id = ? AND is_deleted = 0;',
    [expenseId],
  );
  return (result.rows || []) as unknown as ExpenseSplit[];
}

export function createExpenseSplit(
  expenseId: string,
  phoneNumber: string,
  amount: number,
  percentage: number | null,
  hlcTimestamp: string,
): ExpenseSplit {
  const db = getDatabase();
  const now = new Date().toISOString();
  const id = generateId();

  db.executeSync(
    'INSERT INTO expense_splits (id, expense_id, phone_number, amount, percentage, hlc_timestamp, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?);',
    [id, expenseId, phoneNumber, amount, percentage, hlcTimestamp, now, now],
  );

  return {
    id, expense_id: expenseId, phone_number: phoneNumber, amount, percentage,
    hlc_timestamp: hlcTimestamp, is_deleted: 0, created_at: now, updated_at: now,
  };
}

export function deleteExpenseSplits(expenseId: string, hlcTimestamp: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.executeSync(
    'UPDATE expense_splits SET is_deleted = 1, hlc_timestamp = ?, updated_at = ? WHERE expense_id = ?;',
    [hlcTimestamp, now, expenseId],
  );
}

// --- Expense Payers (multi-payer support) ---

export function getExpensePayers(expenseId: string): ExpensePayer[] {
  const db = getDatabase();
  const result = db.executeSync(
    'SELECT * FROM expense_payers WHERE expense_id = ? AND is_deleted = 0;',
    [expenseId],
  );
  return (result.rows || []) as unknown as ExpensePayer[];
}

export function createExpensePayer(
  expenseId: string,
  phoneNumber: string,
  amount: number,
  hlcTimestamp: string,
): ExpensePayer {
  const db = getDatabase();
  const now = new Date().toISOString();
  const id = generateId();

  db.executeSync(
    'INSERT INTO expense_payers (id, expense_id, phone_number, amount, hlc_timestamp, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?);',
    [id, expenseId, phoneNumber, amount, hlcTimestamp, now, now],
  );

  return {
    id, expense_id: expenseId, phone_number: phoneNumber, amount,
    hlc_timestamp: hlcTimestamp, is_deleted: 0, created_at: now, updated_at: now,
  };
}

export function deleteExpensePayers(expenseId: string, hlcTimestamp: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.executeSync(
    'UPDATE expense_payers SET is_deleted = 1, hlc_timestamp = ?, updated_at = ? WHERE expense_id = ?;',
    [hlcTimestamp, now, expenseId],
  );
}
