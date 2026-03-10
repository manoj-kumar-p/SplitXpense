import {SMS_PROTOCOL_PREFIX, SMS_MAX_PAYLOAD_CHARS} from '../../constants/syncConstants';
import type {SmsMessage, MessageType} from './types';

/**
 * SMS Protocol v1
 *
 * Format: ST1<TYPE:1><SEQ:4><CHK:2><IDX:2><TOT:2><PAYLOAD:up to 146 chars>
 * Header overhead: 3 + 1 + 4 + 2 + 2 + 2 = 14 chars
 * Max payload: 160 - 14 = 146 chars
 */

const HEADER_LENGTH = 14;

export function encodeSmsMessage(msg: SmsMessage): string {
  const header = [
    SMS_PROTOCOL_PREFIX,           // 3 chars
    msg.type,                      // 1 char
    msg.sequenceId.padEnd(4).slice(0, 4), // 4 chars
    msg.checksum.padEnd(2).slice(0, 2),   // 2 chars
    msg.chunkIndex.toString(36).padStart(2, '0'), // 2 chars (base36)
    msg.totalChunks.toString(36).padStart(2, '0'), // 2 chars (base36)
  ].join('');

  return header + msg.payload;
}

export function decodeSmsMessage(raw: string): SmsMessage | null {
  if (!raw.startsWith(SMS_PROTOCOL_PREFIX)) return null;
  if (raw.length < HEADER_LENGTH) return null;

  return {
    type: raw[3] as MessageType,
    sequenceId: raw.substring(4, 8),
    checksum: raw.substring(8, 10),
    chunkIndex: parseInt(raw.substring(10, 12), 36),
    totalChunks: parseInt(raw.substring(12, 14), 36),
    payload: raw.substring(HEADER_LENGTH),
  };
}

export function isSyncMessage(text: string): boolean {
  return text.startsWith(SMS_PROTOCOL_PREFIX);
}

/**
 * Generate a short random sequence ID (4 chars, alphanumeric).
 */
export function generateSequenceId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Simple CRC-8 checksum for payload integrity.
 * Returns 2-char hex string.
 */
export function computeChecksum(payload: string): string {
  let crc = 0;
  for (let i = 0; i < payload.length; i++) {
    crc = (crc ^ payload.charCodeAt(i)) & 0xff;
  }
  return crc.toString(16).padStart(2, '0');
}
