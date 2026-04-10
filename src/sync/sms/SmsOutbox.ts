import {
  enqueueSms,
  getPendingSms,
  updateSmsStatus,
  incrementSmsRetry,
  markSmsSequenceAcked,
} from '../../db/queries/syncQueries';
import {SMS_RATE_LIMIT_MS, SMS_MAX_RETRIES} from '../../constants/syncConstants';
import {chunkPayload, messagesToRawTexts} from './SmsChunker';
import {generateSequenceId} from './SmsProtocol';
import type {MessageType} from './types';

type SmsSender = (phone: string, message: string) => Promise<void>;

export class SmsOutbox {
  private sender: SmsSender | null = null;
  private processing = false;

  setSender(sender: SmsSender): void {
    this.sender = sender;
  }

  /**
   * Queue a sync message for sending.
   * Automatically chunks if payload exceeds SMS limit.
   */
  async enqueue(recipientPhone: string, type: MessageType, payload: string): Promise<string> {
    const sequenceId = generateSequenceId();
    const chunks = chunkPayload(type, payload, sequenceId);
    const rawTexts = messagesToRawTexts(chunks);

    for (let i = 0; i < rawTexts.length; i++) {
      enqueueSms(
        recipientPhone,
        type,
        rawTexts[i],
        i,
        rawTexts.length,
        sequenceId,
      );
    }

    return sequenceId;
  }

  /**
   * Process the outbox: send pending messages.
   * Rate-limited to avoid carrier throttling.
   */
  async processQueue(): Promise<void> {
    if (this.processing || !this.sender) return;
    this.processing = true;

    try {
      const pending = getPendingSms();

      for (const entry of pending) {
        if (entry.retry_count >= SMS_MAX_RETRIES) {
          updateSmsStatus(entry.id, 'failed');
          continue;
        }

        try {
          updateSmsStatus(entry.id, 'sending');
          await this.sender(entry.recipient_phone, entry.payload);
          updateSmsStatus(entry.id, 'sent');

          // Rate limit
          await new Promise<void>(resolve => setTimeout(resolve, SMS_RATE_LIMIT_MS));
        } catch {
          incrementSmsRetry(entry.id);
        }
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Mark all messages in a sequence as ACKed.
   * Uses a direct SQL update instead of iterating all pending SMS in memory.
   */
  markAcked(sequenceId: string): void {
    markSmsSequenceAcked(sequenceId);
  }
}
