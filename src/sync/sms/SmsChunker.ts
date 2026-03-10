import {SMS_MAX_PAYLOAD_CHARS} from '../../constants/syncConstants';
import {
  encodeSmsMessage,
  generateSequenceId,
  computeChecksum,
} from './SmsProtocol';
import type {MessageType, SmsMessage} from './types';

/**
 * Split a large payload into multiple SMS messages.
 */
export function chunkPayload(
  type: MessageType,
  payload: string,
  sequenceId?: string,
): SmsMessage[] {
  const seqId = sequenceId || generateSequenceId();

  if (payload.length <= SMS_MAX_PAYLOAD_CHARS) {
    return [{
      type,
      sequenceId: seqId,
      checksum: computeChecksum(payload),
      chunkIndex: 0,
      totalChunks: 1,
      payload,
    }];
  }

  const chunks: SmsMessage[] = [];
  const totalChunks = Math.ceil(payload.length / SMS_MAX_PAYLOAD_CHARS);

  for (let i = 0; i < totalChunks; i++) {
    const start = i * SMS_MAX_PAYLOAD_CHARS;
    const chunkPayload = payload.substring(start, start + SMS_MAX_PAYLOAD_CHARS);
    chunks.push({
      type,
      sequenceId: seqId,
      checksum: computeChecksum(chunkPayload),
      chunkIndex: i,
      totalChunks,
      payload: chunkPayload,
    });
  }

  return chunks;
}

/**
 * Reassemble chunks into a complete payload.
 * Returns null if chunks are incomplete.
 */
export function reassembleChunks(chunks: Array<{chunkIndex: number; totalChunks: number; payload: string}>): string | null {
  if (chunks.length === 0) return null;

  const totalChunks = chunks[0].totalChunks;
  if (chunks.length < totalChunks) return null;

  // Sort by chunk index
  const sorted = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);

  // Verify all chunks present
  for (let i = 0; i < totalChunks; i++) {
    if (!sorted.find(c => c.chunkIndex === i)) return null;
  }

  return sorted.map(c => c.payload).join('');
}

/**
 * Convert SmsMessage array to raw SMS text strings for sending.
 */
export function messagesToRawTexts(messages: SmsMessage[]): string[] {
  return messages.map(encodeSmsMessage);
}
