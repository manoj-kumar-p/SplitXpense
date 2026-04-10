import {CRDTEngine} from '../crdt/CRDTEngine';
import {SmsOutbox} from './SmsOutbox';
import {SmsListener} from './SmsListener';
import {
  encodeVectorClock,
  decodeVectorClock,
  encodeOperations,
  decodeOperations,
  encodeAck,
  decodeAck,
} from './SmsEncoder';
import {
  getVectorClock,
  updateVectorClock,
  updatePeerSmsSync,
} from '../../db/queries/syncQueries';
import {getLocalUser} from '../../db/queries/userQueries';
import {mergeVectorClocks} from '../crdt/VectorClock';
import {MESSAGE_TYPES} from './types';
import {notifySyncComplete} from '../../notifications/SyncNotificationHandler';
import {refreshWeeklyReminder} from '../../notifications/WeeklyReminderScheduler';
import type {MessageType, SmsSyncResult} from './types';

export class SmsSyncManager {
  private crdtEngine: CRDTEngine;
  private outbox: SmsOutbox;
  private listener: SmsListener;
  private pendingHandshakes: Map<string, (payload: string) => void> = new Map();

  constructor(crdtEngine: CRDTEngine) {
    this.crdtEngine = crdtEngine;
    this.outbox = new SmsOutbox();
    this.listener = new SmsListener();

    this.listener.setHandler(this.handleMessage.bind(this));
  }

  setSender(sender: (phone: string, message: string) => Promise<void>): void {
    this.outbox.setSender(sender);
  }

  async startListening(): Promise<void> {
    await this.listener.start();
  }

  stopListening(): void {
    this.listener.stop();
  }

  /**
   * Initiate SMS sync with a specific peer.
   */
  async syncWithPeer(peerPhone: string): Promise<SmsSyncResult> {
    try {
      const user = getLocalUser();
      if (!user) {
        return {success: false, messagesSent: 0, messagesReceived: 0, error: 'Not set up'};
      }

      // 1. Send handshake with our vector clock
      const myVectorClock = getVectorClock(peerPhone);
      const vcPayload = encodeVectorClock(myVectorClock);
      await this.outbox.enqueue(peerPhone, MESSAGE_TYPES.HANDSHAKE_REQ, vcPayload);
      await this.outbox.processQueue();

      // 2. Also send our deltas proactively
      const deltas = this.crdtEngine.getDeltasSince(myVectorClock);
      let messagesSent = 1;

      if (deltas.length > 0) {
        const deltaPayload = encodeOperations(deltas);
        await this.outbox.enqueue(peerPhone, MESSAGE_TYPES.DELTA_DATA, deltaPayload);
        await this.outbox.processQueue();
        messagesSent++;
      }

      // After sending deltas, update vector clock with our latest HLC
      const latestOps = deltas.length > 0 ? deltas[deltas.length - 1] : null;
      if (latestOps) {
        updateVectorClock(peerPhone, latestOps.origin_peer, latestOps.hlc_timestamp);
      }

      updatePeerSmsSync(peerPhone);

      notifySyncComplete('sms', messagesSent).catch(() => {});

      return {success: true, messagesSent, messagesReceived: 0};
    } catch (error: any) {
      return {success: false, messagesSent: 0, messagesReceived: 0, error: error.message};
    }
  }

  /**
   * Handle an incoming SMS sync message.
   */
  private async handleMessage(senderPhone: string, type: MessageType, payload: string): Promise<void> {
    const user = getLocalUser();
    if (!user) return;

    switch (type) {
      case MESSAGE_TYPES.HANDSHAKE_REQ:
        await this.handleHandshakeReq(senderPhone, payload, user.phone_number);
        break;

      case MESSAGE_TYPES.HANDSHAKE_RES:
        await this.handleHandshakeRes(senderPhone, payload);
        break;

      case MESSAGE_TYPES.DELTA_DATA:
        await this.handleDeltaData(senderPhone, payload);
        break;

      case MESSAGE_TYPES.ACK:
        this.handleAck(payload);
        break;

      case MESSAGE_TYPES.PING:
        // Respond with ACK
        await this.outbox.enqueue(senderPhone, MESSAGE_TYPES.ACK, '');
        await this.outbox.processQueue();
        break;
    }
  }

  private async handleHandshakeReq(senderPhone: string, payload: string, myPhone: string): Promise<void> {
    // Decode their vector clock
    const remoteVectorClock = decodeVectorClock(payload);

    // Send back our vector clock
    const myVectorClock = getVectorClock(senderPhone);
    await this.outbox.enqueue(
      senderPhone,
      MESSAGE_TYPES.HANDSHAKE_RES,
      encodeVectorClock(myVectorClock),
    );

    // Send deltas they haven't seen
    const deltas = this.crdtEngine.getDeltasSince(remoteVectorClock);
    if (deltas.length > 0) {
      await this.outbox.enqueue(
        senderPhone,
        MESSAGE_TYPES.DELTA_DATA,
        encodeOperations(deltas),
      );
    }

    await this.outbox.processQueue();
  }

  private async handleHandshakeRes(senderPhone: string, payload: string): Promise<void> {
    const remoteVectorClock = decodeVectorClock(payload);

    // Send our deltas they haven't seen
    const deltas = this.crdtEngine.getDeltasSince(remoteVectorClock);
    if (deltas.length > 0) {
      await this.outbox.enqueue(
        senderPhone,
        MESSAGE_TYPES.DELTA_DATA,
        encodeOperations(deltas),
      );
      await this.outbox.processQueue();
    }
  }

  private async handleDeltaData(senderPhone: string, payload: string): Promise<void> {
    const operations = decodeOperations(payload);

    for (const op of operations) {
      this.crdtEngine.applyRemote(op);
    }

    // Update vector clock
    for (const op of operations) {
      updateVectorClock(senderPhone, op.origin_peer, op.hlc_timestamp);
    }

    // Send ACK
    await this.outbox.enqueue(senderPhone, MESSAGE_TYPES.ACK, '');
    await this.outbox.processQueue();

    updatePeerSmsSync(senderPhone);

    notifySyncComplete('sms', operations.length).catch(() => {});
    refreshWeeklyReminder().catch(() => {});
  }

  private handleAck(payload: string): void {
    if (payload) {
      const sequenceId = decodeAck(payload);
      this.outbox.markAcked(sequenceId);
    }
  }
}
