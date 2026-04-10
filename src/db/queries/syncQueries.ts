import {getDatabase} from '../database';
import {generateId} from '../../utils/uuid';
import type {
  SyncOperation,
  VectorClockEntry,
  Peer,
  SmsOutboxEntry,
  SmsInboxFragment,
} from '../../models/SyncOperation';

// --- Sync Operations ---

export function insertSyncOperation(
  hlcTimestamp: string,
  originPeer: string,
  tableName: string,
  rowId: string,
  operationType: string,
  columnName: string | null,
  oldValue: string | null,
  newValue: string | null,
  applied: number = 1,
): SyncOperation {
  const db = getDatabase();
  const now = new Date().toISOString();
  const id = generateId();

  db.executeSync(
    'INSERT INTO sync_operations (id, hlc_timestamp, origin_peer, table_name, row_id, operation_type, column_name, old_value, new_value, applied, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);',
    [id, hlcTimestamp, originPeer, tableName, rowId, operationType, columnName, oldValue, newValue, applied, now],
  );

  return {
    id, hlc_timestamp: hlcTimestamp, origin_peer: originPeer, table_name: tableName,
    row_id: rowId, operation_type: operationType as any, column_name: columnName,
    old_value: oldValue, new_value: newValue, applied, created_at: now,
  };
}

export function getOperationsSince(hlcTimestamp: string): SyncOperation[] {
  const db = getDatabase();
  const result = db.executeSync(
    'SELECT * FROM sync_operations WHERE hlc_timestamp > ? AND applied = 1 ORDER BY hlc_timestamp ASC;',
    [hlcTimestamp],
  );
  return (result.rows || []) as unknown as SyncOperation[];
}

export function getOperationsByPeerSince(originPeer: string, hlcTimestamp: string): SyncOperation[] {
  const db = getDatabase();
  const result = db.executeSync(
    'SELECT * FROM sync_operations WHERE origin_peer = ? AND hlc_timestamp > ? AND applied = 1 ORDER BY hlc_timestamp ASC;',
    [originPeer, hlcTimestamp],
  );
  return (result.rows || []) as unknown as SyncOperation[];
}

// --- Vector Clocks ---

export function getVectorClock(peerPhone: string): Record<string, string> {
  const db = getDatabase();
  const result = db.executeSync(
    'SELECT * FROM vector_clocks WHERE peer_phone = ?;',
    [peerPhone],
  );
  const clock: Record<string, string> = {};
  for (const row of (result.rows || []) as unknown as VectorClockEntry[]) {
    clock[row.origin_phone] = row.hlc_value;
  }
  return clock;
}

export function updateVectorClock(peerPhone: string, originPhone: string, hlcValue: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.executeSync(
    `INSERT INTO vector_clocks (peer_phone, origin_phone, hlc_value, updated_at)
VALUES (?, ?, ?, ?)
ON CONFLICT(peer_phone, origin_phone) DO UPDATE SET
  hlc_value = CASE WHEN excluded.hlc_value > vector_clocks.hlc_value THEN excluded.hlc_value ELSE vector_clocks.hlc_value END,
  updated_at = excluded.updated_at;`,
    [peerPhone, originPhone, hlcValue, now],
  );
}

// --- Peers ---

export function getAllPeers(): Peer[] {
  const db = getDatabase();
  const result = db.executeSync('SELECT * FROM peers ORDER BY display_name;');
  return (result.rows || []) as unknown as Peer[];
}

export function getPeer(phoneNumber: string): Peer | null {
  const db = getDatabase();
  const result = db.executeSync('SELECT * FROM peers WHERE phone_number = ?;', [phoneNumber]);
  if (result.rows && result.rows.length > 0) {
    return result.rows[0] as unknown as Peer;
  }
  return null;
}

export function upsertPeer(
  phoneNumber: string,
  displayName: string | null,
  wifiIp?: string | null,
  wifiPort?: number | null,
): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  const existing = getPeer(phoneNumber);

  if (existing) {
    db.executeSync(
      'UPDATE peers SET display_name = COALESCE(?, display_name), wifi_ip = COALESCE(?, wifi_ip), wifi_port = COALESCE(?, wifi_port), updated_at = ? WHERE phone_number = ?;',
      [displayName, wifiIp ?? null, wifiPort ?? null, now, phoneNumber],
    );
  } else {
    db.executeSync(
      'INSERT INTO peers (phone_number, display_name, wifi_ip, wifi_port, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?);',
      [phoneNumber, displayName, wifiIp ?? null, wifiPort ?? null, now, now],
    );
  }
}

export function updatePeerWifiSync(phoneNumber: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.executeSync('UPDATE peers SET last_wifi_sync = ?, updated_at = ? WHERE phone_number = ?;', [now, now, phoneNumber]);
}

export function updatePeerSmsSync(phoneNumber: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.executeSync('UPDATE peers SET last_sms_sync = ?, updated_at = ? WHERE phone_number = ?;', [now, now, phoneNumber]);
}

export function updatePeerBleSync(phoneNumber: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.executeSync('UPDATE peers SET last_ble_sync = ?, updated_at = ? WHERE phone_number = ?;', [now, now, phoneNumber]);
}

// --- SMS Outbox ---

export function enqueueSms(
  recipientPhone: string,
  messageType: string,
  payload: string,
  chunkIndex: number,
  totalChunks: number,
  sequenceId: string,
): SmsOutboxEntry {
  const db = getDatabase();
  const now = new Date().toISOString();
  const id = generateId();

  db.executeSync(
    'INSERT INTO sms_outbox (id, recipient_phone, message_type, payload, chunk_index, total_chunks, sequence_id, status, retry_count, max_retries, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, \'pending\', 0, 3, ?);',
    [id, recipientPhone, messageType, payload, chunkIndex, totalChunks, sequenceId, now],
  );

  return {
    id, recipient_phone: recipientPhone, message_type: messageType, payload,
    chunk_index: chunkIndex, total_chunks: totalChunks, sequence_id: sequenceId,
    status: 'pending', retry_count: 0, max_retries: 3, created_at: now,
    sent_at: null, acked_at: null,
  };
}

export function getPendingSms(): SmsOutboxEntry[] {
  const db = getDatabase();
  const result = db.executeSync(
    'SELECT * FROM sms_outbox WHERE status = \'pending\' ORDER BY created_at ASC;',
  );
  return (result.rows || []) as unknown as SmsOutboxEntry[];
}

export function updateSmsStatus(id: string, status: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  const sentAt = status === 'sent' ? now : null;
  const ackedAt = status === 'acked' ? now : null;
  db.executeSync(
    'UPDATE sms_outbox SET status = ?, sent_at = COALESCE(?, sent_at), acked_at = COALESCE(?, acked_at) WHERE id = ?;',
    [status, sentAt, ackedAt, id],
  );
}

export function incrementSmsRetry(id: string): void {
  const db = getDatabase();
  db.executeSync(
    'UPDATE sms_outbox SET retry_count = retry_count + 1, status = \'pending\' WHERE id = ?;',
    [id],
  );
}

// --- SMS Inbox Fragments ---

export function insertSmsFragment(
  senderPhone: string,
  sequenceId: string,
  chunkIndex: number,
  totalChunks: number,
  payload: string,
): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  const id = generateId();
  db.executeSync(
    'INSERT OR IGNORE INTO sms_inbox_fragments (id, sender_phone, sequence_id, chunk_index, total_chunks, payload, received_at, reassembled) VALUES (?, ?, ?, ?, ?, ?, ?, 0);',
    [id, senderPhone, sequenceId, chunkIndex, totalChunks, payload, now],
  );
}

export function getSmsFragments(senderPhone: string, sequenceId: string): SmsInboxFragment[] {
  const db = getDatabase();
  const result = db.executeSync(
    'SELECT * FROM sms_inbox_fragments WHERE sender_phone = ? AND sequence_id = ? AND reassembled = 0 ORDER BY chunk_index;',
    [senderPhone, sequenceId],
  );
  return (result.rows || []) as unknown as SmsInboxFragment[];
}

export function markFragmentsReassembled(senderPhone: string, sequenceId: string): void {
  const db = getDatabase();
  db.executeSync(
    'UPDATE sms_inbox_fragments SET reassembled = 1 WHERE sender_phone = ? AND sequence_id = ?;',
    [senderPhone, sequenceId],
  );
}

/**
 * Mark all SMS outbox entries for a sequence as acked directly via SQL,
 * instead of iterating all pending entries in memory.
 */
export function markSmsSequenceAcked(sequenceId: string): void {
  const db = getDatabase();
  db.executeSync(
    `UPDATE sms_outbox SET status = 'acked', acked_at = ? WHERE sequence_id = ? AND status IN ('pending', 'sending', 'sent');`,
    [new Date().toISOString(), sequenceId],
  );
}
