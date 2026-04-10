/**
 * Backup API client — talks to the SplitXpense server backup endpoints.
 *
 * Reuses the same server_url and server_auth_token settings already used by
 * the transaction sync layer (src/transaction/api/ServerSync.ts).
 */
import {getSetting} from '../db/queries/settingsQueries';
import {EncryptedBlob, KdfParams} from './encryption';

function getBaseUrl(): string {
  const url = getSetting('server_url');
  if (!url) throw new Error('Server URL not configured. Set it in Sync settings.');
  return url;
}

function authHeaders(): Record<string, string> {
  const token = getSetting('server_auth_token');
  if (!token) throw new Error('Not authenticated. Register the device first.');
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export interface BackupInfo {
  exists: boolean;
  formatVersion?: number;
  sizeBytes?: number;
  createdAt?: string;
  updatedAt?: string;
}

export async function uploadBackup(blob: EncryptedBlob): Promise<{sizeBytes: number}> {
  const res = await fetch(`${getBaseUrl()}/api/backup/upload`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      ciphertext: blob.ciphertext,
      nonce: blob.nonce,
      salt: blob.salt,
      kdfParams: blob.kdfParams,
      formatVersion: 1,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Upload failed (${res.status}): ${body}`);
  }
  return res.json();
}

export async function getBackupInfo(): Promise<BackupInfo> {
  const res = await fetch(`${getBaseUrl()}/api/backup/info`, {
    method: 'GET',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Info failed (${res.status}): ${body}`);
  }
  return res.json();
}

export async function downloadBackup(): Promise<EncryptedBlob & {formatVersion: number}> {
  const res = await fetch(`${getBaseUrl()}/api/backup/download`, {
    method: 'GET',
    headers: authHeaders(),
  });
  if (res.status === 404) throw new Error('No backup found on server');
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Download failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  return {
    ciphertext: data.ciphertext,
    nonce: data.nonce,
    salt: data.salt,
    kdfParams: data.kdfParams as KdfParams,
    formatVersion: data.formatVersion,
  };
}

export async function deleteBackup(): Promise<void> {
  const res = await fetch(`${getBaseUrl()}/api/backup`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Delete failed (${res.status}): ${body}`);
  }
}
