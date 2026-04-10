import {getDatabase} from '../../db/database';
import {insertSyncOperation, getOperationsSince} from '../../db/queries/syncQueries';
import {HLC} from './HLC';
import type {VectorClock} from './VectorClock';
import type {SyncOperation} from '../../models/SyncOperation';

const VALID_TABLES = new Set([
  'groups', 'group_members', 'expenses', 'expense_splits', 'expense_payers',
  'settlements', 'known_users', 'local_user', 'pending_transactions', 'account_group_map',
]);

const VALID_COLUMNS = new Set([
  'name', 'description', 'icon', 'simplify_debts', 'delete_votes', 'created_by',
  'phone_number', 'display_name', 'added_by', 'group_id',
  'amount', 'currency', 'paid_by', 'split_type', 'category', 'expense_date',
  'expense_id', 'percentage', 'paid_to', 'settled_at',
  'hlc_timestamp', 'is_deleted', 'created_at', 'updated_at',
]);

function validateTableName(table: string): boolean {
  return VALID_TABLES.has(table);
}

function validateColumnName(column: string): boolean {
  return VALID_COLUMNS.has(column);
}

export class CRDTEngine {
  private hlc: HLC;

  constructor(nodeId: string) {
    this.hlc = new HLC(nodeId);
  }

  /**
   * Record a local mutation. Should wrap every INSERT/UPDATE/DELETE.
   */
  applyLocal(
    tableName: string,
    rowId: string,
    operationType: 'INSERT' | 'UPDATE' | 'DELETE',
    changes: Array<{column: string; oldValue: string | null; newValue: string | null}>,
  ): string {
    const ts = this.hlc.now();
    const hlcStr = HLC.serialize(ts);

    for (const change of changes) {
      insertSyncOperation(
        hlcStr,
        ts.nodeId,
        tableName,
        rowId,
        operationType,
        change.column,
        change.oldValue,
        change.newValue,
      );
    }

    return hlcStr;
  }

  /**
   * Apply a remote operation received during sync.
   * Uses LWW per-column conflict resolution.
   * Returns true if the operation was applied, false if skipped.
   */
  applyRemote(op: SyncOperation): boolean {
    const db = getDatabase();
    const remoteTs = HLC.deserialize(op.hlc_timestamp);
    this.hlc.receive(remoteTs);

    if (op.operation_type === 'INSERT') {
      return this.applyRemoteInsert(db, op);
    } else if (op.operation_type === 'UPDATE') {
      return this.applyRemoteUpdate(db, op);
    } else if (op.operation_type === 'DELETE') {
      return this.applyRemoteDelete(db, op);
    }

    return false;
  }

  private applyRemoteInsert(db: any, op: SyncOperation): boolean {
    if (!validateTableName(op.table_name)) return false;
    if (op.column_name && !validateColumnName(op.column_name)) return false;

    // Check if row already exists
    const existing = db.executeSync(
      `SELECT hlc_timestamp FROM ${op.table_name} WHERE id = ?;`,
      [op.row_id],
    );

    if (existing.rows && existing.rows.length > 0) {
      // Row exists — treat as update if remote is newer
      const localHlc = (existing.rows[0] as any).hlc_timestamp;
      if (HLC.compareStr(op.hlc_timestamp, localHlc) <= 0) {
        // Local is newer or same, skip
        insertSyncOperation(
          op.hlc_timestamp, op.origin_peer, op.table_name, op.row_id,
          op.operation_type, op.column_name, op.old_value, op.new_value, 0,
        );
        return false;
      }
    }

    // Apply the insert by setting the column value
    if (op.column_name && op.new_value !== null) {
      const now = new Date().toISOString();
      try {
        // Try to insert a minimal row with the column value
        db.executeSync(
          `INSERT INTO ${op.table_name} (id, ${op.column_name}, hlc_timestamp, is_deleted, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?);`,
          [op.row_id, op.new_value, op.hlc_timestamp, now, now],
        );
      } catch (e) {
        // Row may already exist (UNIQUE violation) or NOT NULL violation for missing columns
        // In either case, fall back to UPDATE
        try {
          db.executeSync(
            `UPDATE ${op.table_name} SET ${op.column_name} = ?, hlc_timestamp = ?, updated_at = ? WHERE id = ?;`,
            [op.new_value, op.hlc_timestamp, now, op.row_id],
          );
        } catch (e2) {
          console.warn('CRDT apply failed (insert):', op.table_name, op.column_name, e2);
          // Don't mark as applied=1 on failure - leave for retry
          insertSyncOperation(
            op.hlc_timestamp, op.origin_peer, op.table_name, op.row_id,
            op.operation_type, op.column_name, op.old_value, op.new_value, 0,
          );
          return false;
        }
      }
    }

    insertSyncOperation(
      op.hlc_timestamp, op.origin_peer, op.table_name, op.row_id,
      op.operation_type, op.column_name, op.old_value, op.new_value, 1,
    );
    return true;
  }

  private applyRemoteUpdate(db: any, op: SyncOperation): boolean {
    if (!validateTableName(op.table_name)) return false;
    if (op.column_name && !validateColumnName(op.column_name)) return false;

    if (!op.column_name) return false;

    // Check current HLC for this specific column on this row
    // We use the sync_operations log to find the latest HLC for this column
    const latestOp = db.executeSync(
      `SELECT hlc_timestamp FROM sync_operations
       WHERE table_name = ? AND row_id = ? AND column_name = ? AND applied = 1
       ORDER BY hlc_timestamp DESC LIMIT 1;`,
      [op.table_name, op.row_id, op.column_name],
    );

    if (latestOp.rows && latestOp.rows.length > 0) {
      const localHlc = (latestOp.rows[0] as any).hlc_timestamp;
      if (HLC.compareStr(op.hlc_timestamp, localHlc) <= 0) {
        insertSyncOperation(
          op.hlc_timestamp, op.origin_peer, op.table_name, op.row_id,
          op.operation_type, op.column_name, op.old_value, op.new_value, 0,
        );
        return false;
      }
    }

    // Apply the update
    try {
      db.executeSync(
        `UPDATE ${op.table_name} SET ${op.column_name} = ?, hlc_timestamp = ?, updated_at = ? WHERE id = ?;`,
        [op.new_value, op.hlc_timestamp, new Date().toISOString(), op.row_id],
      );
    } catch (e) {
      console.warn('CRDT apply failed (update):', op.table_name, op.column_name, e);
      // Don't mark as applied=1 on failure - leave for retry
      insertSyncOperation(
        op.hlc_timestamp, op.origin_peer, op.table_name, op.row_id,
        op.operation_type, op.column_name, op.old_value, op.new_value, 0,
      );
      return false;
    }

    insertSyncOperation(
      op.hlc_timestamp, op.origin_peer, op.table_name, op.row_id,
      op.operation_type, op.column_name, op.old_value, op.new_value, 1,
    );
    return true;
  }

  private applyRemoteDelete(db: any, op: SyncOperation): boolean {
    if (!validateTableName(op.table_name)) return false;
    if (op.column_name && !validateColumnName(op.column_name)) return false;

    // Soft delete: set is_deleted = 1
    const existing = db.executeSync(
      `SELECT hlc_timestamp FROM ${op.table_name} WHERE id = ?;`,
      [op.row_id],
    );

    if (existing.rows && existing.rows.length > 0) {
      const localHlc = (existing.rows[0] as any).hlc_timestamp;
      if (HLC.compareStr(op.hlc_timestamp, localHlc) <= 0) {
        insertSyncOperation(
          op.hlc_timestamp, op.origin_peer, op.table_name, op.row_id,
          op.operation_type, op.column_name, op.old_value, op.new_value, 0,
        );
        return false;
      }
    }

    try {
      db.executeSync(
        `UPDATE ${op.table_name} SET is_deleted = 1, hlc_timestamp = ?, updated_at = ? WHERE id = ?;`,
        [op.hlc_timestamp, new Date().toISOString(), op.row_id],
      );
    } catch (e) {
      console.warn('CRDT apply failed (delete):', op.table_name, op.column_name, e);
      // Don't mark as applied=1 on failure - leave for retry
      insertSyncOperation(
        op.hlc_timestamp, op.origin_peer, op.table_name, op.row_id,
        op.operation_type, op.column_name, op.old_value, op.new_value, 0,
      );
      return false;
    }

    insertSyncOperation(
      op.hlc_timestamp, op.origin_peer, op.table_name, op.row_id,
      op.operation_type, op.column_name, op.old_value, op.new_value, 1,
    );
    return true;
  }

  /**
   * Get all operations that the remote peer hasn't seen yet.
   */
  getDeltasSince(vectorClock: VectorClock): SyncOperation[] {
    // If vector clock is empty, send all operations
    if (Object.keys(vectorClock).length === 0) {
      return getOperationsSince('');
    }

    // Find the minimum HLC across all known peers
    const hlcValues = Object.values(vectorClock);
    const minHlc = hlcValues.sort()[0] || '';

    // Single query: get all ops since the minimum
    const allOps = getOperationsSince(minHlc);

    // Filter: include ops that are newer than the specific peer's clock entry,
    // OR from peers not in the clock at all
    const knownPeers = new Set(Object.keys(vectorClock));
    return allOps.filter(op => {
      if (!knownPeers.has(op.origin_peer)) return true; // Unknown peer, include all
      const peerHlc = vectorClock[op.origin_peer];
      return op.hlc_timestamp > peerHlc; // Only include if newer than what peer has seen
    });
  }
}
