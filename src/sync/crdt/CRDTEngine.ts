import {getDatabase} from '../../db/database';
import {insertSyncOperation, getOperationsSince} from '../../db/queries/syncQueries';
import {HLC} from './HLC';
import type {VectorClock} from './VectorClock';
import type {SyncOperation} from '../../models/SyncOperation';

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
      try {
        db.executeSync(
          `INSERT OR REPLACE INTO ${op.table_name} (id, ${op.column_name}, hlc_timestamp) VALUES (?, ?, ?);`,
          [op.row_id, op.new_value, op.hlc_timestamp],
        );
      } catch {
        // Table may require more columns — this is handled during full-row sync
      }
    }

    insertSyncOperation(
      op.hlc_timestamp, op.origin_peer, op.table_name, op.row_id,
      op.operation_type, op.column_name, op.old_value, op.new_value, 1,
    );
    return true;
  }

  private applyRemoteUpdate(db: any, op: SyncOperation): boolean {
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
    } catch {
      // Column might not exist in older schema versions
    }

    insertSyncOperation(
      op.hlc_timestamp, op.origin_peer, op.table_name, op.row_id,
      op.operation_type, op.column_name, op.old_value, op.new_value, 1,
    );
    return true;
  }

  private applyRemoteDelete(db: any, op: SyncOperation): boolean {
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
    } catch {
      // Row might not exist
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

    // Get all operations after each peer's last known HLC
    const allOps: SyncOperation[] = [];
    const seenIds = new Set<string>();

    for (const [_peer, lastHlc] of Object.entries(vectorClock)) {
      const ops = getOperationsSince(lastHlc);
      for (const op of ops) {
        if (!seenIds.has(op.id)) {
          seenIds.add(op.id);
          allOps.push(op);
        }
      }
    }

    // Sort by HLC
    allOps.sort((a, b) => HLC.compareStr(a.hlc_timestamp, b.hlc_timestamp));
    return allOps;
  }
}
