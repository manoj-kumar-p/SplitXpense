import type {VectorClock} from '../crdt/VectorClock';
import type {SyncOperation} from '../../models/SyncOperation';

/**
 * Compact JSON-based encoding for SMS payloads.
 * Uses short keys to minimize size.
 *
 * We use a compact JSON format rather than true binary+base91
 * for readability and debugging. The overhead is acceptable
 * given the delta-sync approach (small payloads).
 */

interface CompactOperation {
  h: string;  // hlc_timestamp
  o: string;  // origin_peer
  t: string;  // table_name (abbreviated)
  r: string;  // row_id
  p: string;  // operation_type: I/U/D
  c: string | null;  // column_name
  v: string | null;  // new_value
}

const TABLE_ABBREV: Record<string, string> = {
  groups: 'g',
  group_members: 'gm',
  expenses: 'e',
  expense_splits: 'es',
  settlements: 's',
  known_users: 'ku',
  expense_payers: 'ep',
};

const TABLE_EXPAND: Record<string, string> = Object.fromEntries(
  Object.entries(TABLE_ABBREV).map(([k, v]) => [v, k]),
);

const OP_ABBREV: Record<string, string> = {
  INSERT: 'I',
  UPDATE: 'U',
  DELETE: 'D',
};

const OP_EXPAND: Record<string, string> = {
  I: 'INSERT',
  U: 'UPDATE',
  D: 'DELETE',
};

export function encodeVectorClock(vc: VectorClock): string {
  // Compact: {phone: hlc, phone: hlc, ...}
  return JSON.stringify(vc);
}

export function decodeVectorClock(data: string): VectorClock {
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
}

export function encodeOperations(ops: SyncOperation[]): string {
  const compact: CompactOperation[] = ops.map(op => ({
    h: op.hlc_timestamp,
    o: op.origin_peer,
    t: TABLE_ABBREV[op.table_name] || op.table_name,
    r: op.row_id,
    p: OP_ABBREV[op.operation_type] || op.operation_type,
    c: op.column_name,
    v: op.new_value,
  }));
  return JSON.stringify(compact);
}

export function decodeOperations(data: string): SyncOperation[] {
  try {
    const compact: CompactOperation[] = JSON.parse(data);
    return compact.map(c => ({
      id: '',
      hlc_timestamp: c.h,
      origin_peer: c.o,
      table_name: TABLE_EXPAND[c.t] || c.t,
      row_id: c.r,
      operation_type: (OP_EXPAND[c.p] || c.p) as any,
      column_name: c.c,
      old_value: null,
      new_value: c.v,
      applied: 0,
      created_at: '',
    }));
  } catch {
    return [];
  }
}

export function encodeAck(sequenceId: string): string {
  return sequenceId;
}

export function decodeAck(data: string): string {
  return data;
}
