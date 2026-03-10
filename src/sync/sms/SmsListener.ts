import {isSyncMessage, decodeSmsMessage} from './SmsProtocol';
import {
  insertSmsFragment,
  getSmsFragments,
  markFragmentsReassembled,
} from '../../db/queries/syncQueries';
import {reassembleChunks} from './SmsChunker';
import type {MessageType} from './types';

type MessageHandler = (senderPhone: string, type: MessageType, payload: string) => void;

export class SmsListener {
  private subscription: any = null;
  private onMessage: MessageHandler | null = null;

  setHandler(handler: MessageHandler): void {
    this.onMessage = handler;
  }

  /**
   * Start listening for incoming SMS.
   * Uses @ernestbies/react-native-android-sms-listener on Android.
   */
  async start(): Promise<void> {
    try {
      // Dynamic import to avoid crash on iOS
      const SmsListenerModule = require('@ernestbies/react-native-android-sms-listener');
      this.subscription = SmsListenerModule.default.addListener(
        (message: {originatingAddress: string; body: string}) => {
          this.handleIncoming(message.originatingAddress, message.body);
        },
      );
    } catch {
      console.warn('SMS listener not available on this platform');
    }
  }

  stop(): void {
    if (this.subscription) {
      this.subscription.remove();
      this.subscription = null;
    }
  }

  private handleIncoming(senderPhone: string, body: string): void {
    if (!isSyncMessage(body)) return;

    const msg = decodeSmsMessage(body);
    if (!msg) return;

    if (msg.totalChunks === 1) {
      // Single-part message — handle immediately
      this.onMessage?.(senderPhone, msg.type, msg.payload);
      return;
    }

    // Multi-part message — store fragment and try to reassemble
    insertSmsFragment(
      senderPhone,
      msg.sequenceId,
      msg.chunkIndex,
      msg.totalChunks,
      msg.payload,
    );

    const fragments = getSmsFragments(senderPhone, msg.sequenceId);
    const reassembled = reassembleChunks(
      fragments.map(f => ({
        chunkIndex: f.chunk_index,
        totalChunks: f.total_chunks,
        payload: f.payload,
      })),
    );

    if (reassembled !== null) {
      markFragmentsReassembled(senderPhone, msg.sequenceId);
      this.onMessage?.(senderPhone, msg.type, reassembled);
    }
  }
}
