/**
 * Sync Logger — lightweight utility that query functions call to record
 * every local mutation in the sync_operations log.
 *
 * Uses its own HLC counter so that sync works even when no CRDTEngine
 * instance is in scope (the CRDTEngine is still used for *remote* ops).
 */
import {insertSyncOperation} from '../db/queries/syncQueries';
import {getLocalUser} from '../db/queries/userQueries';

let hlcCounter = 0;

function getOriginPeer(): string | null {
  const user = getLocalUser();
  return user?.phone_number || null;
}

export function generateHlcTimestamp(): string {
  const wall = Date.now();
  const nodeId = getOriginPeer() || 'local';
  hlcCounter++;
  const counterStr = hlcCounter.toString().padStart(4, '0');
  return `${wall}-${counterStr}-${nodeId}`;
}

/**
 * Record an INSERT sync operation.
 * Returns the HLC timestamp used.
 */
export function logInsert(
  tableName: string,
  rowId: string,
  hlcTimestamp?: string,
): string {
  const peer = getOriginPeer();
  if (!peer) return hlcTimestamp || ''; // Skip logging before onboarding
  const hlc = hlcTimestamp || generateHlcTimestamp();
  insertSyncOperation(
    hlc,
    peer,
    tableName,
    rowId,
    'INSERT',
    null,
    null,
    null,
  );
  return hlc;
}

/**
 * Record an UPDATE sync operation for a specific column.
 * Returns the HLC timestamp used.
 */
export function logUpdate(
  tableName: string,
  rowId: string,
  columnName: string,
  oldValue: string | null,
  newValue: string | null,
  hlcTimestamp?: string,
): string {
  const peer = getOriginPeer();
  if (!peer) return hlcTimestamp || ''; // Skip logging before onboarding
  const hlc = hlcTimestamp || generateHlcTimestamp();
  insertSyncOperation(
    hlc,
    peer,
    tableName,
    rowId,
    'UPDATE',
    columnName,
    oldValue,
    newValue,
  );
  return hlc;
}

/**
 * Record a DELETE sync operation.
 * Returns the HLC timestamp used.
 */
export function logDelete(
  tableName: string,
  rowId: string,
  hlcTimestamp?: string,
): string {
  const peer = getOriginPeer();
  if (!peer) return hlcTimestamp || ''; // Skip logging before onboarding
  const hlc = hlcTimestamp || generateHlcTimestamp();
  insertSyncOperation(
    hlc,
    peer,
    tableName,
    rowId,
    'DELETE',
    null,
    null,
    null,
  );
  return hlc;
}
