import {Device} from 'react-native-ble-plx';
import {CRDTEngine} from '../crdt/CRDTEngine';
import {BLEDiscovery} from './BLEDiscovery';
import {getVectorClock, updateVectorClock, updatePeerBleSync, upsertPeer, getPeer} from '../../db/queries/syncQueries';
import {getLocalUser} from '../../db/queries/userQueries';
import {mergeVectorClocks} from '../crdt/VectorClock';
import {
  BLE_SERVICE_UUID,
  BLE_CHAR_WRITE_UUID,
  BLE_CHAR_NOTIFY_UUID,
  BLE_MSG,
} from './types';
import {notifySyncComplete} from '../../notifications/SyncNotificationHandler';
import {refreshWeeklyReminder} from '../../notifications/WeeklyReminderScheduler';
import type {BLEPeer, BLESyncResult} from './types';

const CHUNK_SIZE = 180; // BLE MTU safe chunk size

// Simple base64 helpers for React Native
function toBase64(str: string): string {
  // Use global btoa or manual encoding
  try {
    return globalThis.btoa(unescape(encodeURIComponent(str)));
  } catch {
    return str;
  }
}

function fromBase64(b64: string): string {
  try {
    return decodeURIComponent(escape(globalThis.atob(b64)));
  } catch {
    return b64;
  }
}

/**
 * BLE Sync Manager - handles sync data exchange over Bluetooth LE.
 *
 * Protocol:
 * 1. Connect to peer device
 * 2. Send HANDSHAKE_REQ with our phone + vector clock
 * 3. Receive HANDSHAKE_RES with their phone + vector clock
 * 4. Send PULL_REQ (requesting their deltas since our VC)
 * 5. Receive chunked PULL_RES with their operations
 * 6. Send chunked PUSH_DATA with our operations
 * 7. Receive PUSH_ACK
 * 8. Disconnect
 */
export class BLESyncManager {
  private crdtEngine: CRDTEngine;
  private discovery: BLEDiscovery;

  constructor(crdtEngine: CRDTEngine, discovery: BLEDiscovery) {
    this.crdtEngine = crdtEngine;
    this.discovery = discovery;
  }

  /**
   * Sync with a discovered BLE peer.
   */
  async syncWithPeer(peer: BLEPeer): Promise<BLESyncResult> {
    let device: Device | null = null;

    try {
      const user = getLocalUser();
      if (!user) {
        return {success: false, operationsPushed: 0, operationsPulled: 0, error: 'Not set up'};
      }

      // Connect
      device = await this.discovery.connectToDevice(peer.id);
      upsertPeer(peer.phone, peer.name);

      // 1. Send handshake with a preliminary vector clock (may use truncated phone)
      const prelimVC = getVectorClock(peer.phone);
      const handshakePayload = JSON.stringify({
        type: BLE_MSG.HANDSHAKE_REQ,
        phone: user.phone_number,
        name: user.display_name,
        vc: prelimVC,
      });

      await this.writeChunked(device, handshakePayload);

      // 2. Wait for handshake response
      const hsResponse = await this.readResponse(device, 10000);
      const hsData = JSON.parse(hsResponse);

      if (hsData.type !== BLE_MSG.HANDSHAKE_RES) {
        throw new Error('Invalid handshake response');
      }

      // Upsert peer with full phone from handshake before checking
      const remotePhone = hsData.phone || '';
      const remoteDisplay = hsData.name || peer.name || '';
      if (!remotePhone) {
        await this.discovery.disconnectDevice(peer.id);
        return {success: false, operationsPushed: 0, operationsPulled: 0, error: 'Unknown peer'};
      }
      upsertPeer(remotePhone, remoteDisplay);
      if (!getPeer(remotePhone)) {
        await this.discovery.disconnectDevice(peer.id);
        return {success: false, operationsPushed: 0, operationsPulled: 0, error: 'Unknown peer'};
      }

      const remoteVC = hsData.vc || {};

      // Re-fetch vector clock with the full remote phone (peer.phone may be truncated)
      const myVC = getVectorClock(remotePhone);

      // 3. Pull - get their operations we haven't seen
      const pullReq = JSON.stringify({type: BLE_MSG.PULL_REQ, vc: myVC});
      await this.writeChunked(device, pullReq);

      const pullResponse = await this.readResponse(device, 30000);
      const pullData = JSON.parse(pullResponse);

      let pulled = 0;
      if (pullData.type === BLE_MSG.PULL_RES && pullData.ops) {
        for (const op of pullData.ops) {
          const applied = this.crdtEngine.applyRemote(op);
          if (applied) pulled++;
        }
      }

      // 4. Push - send our operations they haven't seen
      const localOps = this.crdtEngine.getDeltasSince(remoteVC);
      const pushPayload = JSON.stringify({
        type: BLE_MSG.PUSH_DATA,
        ops: localOps,
      });
      await this.writeChunked(device, pushPayload);

      // 5. Wait for push ACK
      const ackResponse = await this.readResponse(device, 10000);
      const ackData = JSON.parse(ackResponse);
      const pushed = ackData.type === BLE_MSG.PUSH_ACK ? (ackData.accepted || 0) : 0;

      // 6. Update vector clocks (use remotePhone from handshake, not peer.phone which may be truncated)
      const mergedClock = mergeVectorClocks(myVC, remoteVC);
      for (const [origin, hlc] of Object.entries(mergedClock)) {
        updateVectorClock(remotePhone, origin, hlc as string);
      }
      updatePeerBleSync(remotePhone);

      notifySyncComplete('ble', pushed + pulled, remoteDisplay || peer.name).catch(() => {});
      refreshWeeklyReminder().catch(() => {});

      // Disconnect
      await this.discovery.disconnectDevice(peer.id);

      return {success: true, operationsPushed: pushed, operationsPulled: pulled};
    } catch (error: any) {
      if (device) {
        try {
          await this.discovery.disconnectDevice(peer.id);
        } catch {}
      }
      return {
        success: false,
        operationsPushed: 0,
        operationsPulled: 0,
        error: error.message || 'BLE sync failed',
      };
    }
  }

  /**
   * Write data to the peer in chunks via BLE characteristic.
   */
  private async writeChunked(device: Device, data: string): Promise<void> {
    const chunks: string[] = [];

    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      chunks.push(data.substring(i, i + CHUNK_SIZE));
    }

    // Send each chunk with type prefix, base64-encoded for BLE transport
    for (let i = 0; i < chunks.length; i++) {
      const isLast = i === chunks.length - 1;
      const prefix = isLast ? BLE_MSG.CHUNK_END : BLE_MSG.CHUNK;
      const packet = prefix + chunks[i];
      const packetB64 = toBase64(packet);

      await device.writeCharacteristicWithResponseForService(
        BLE_SERVICE_UUID,
        BLE_CHAR_WRITE_UUID,
        packetB64,
      );
    }
  }

  /**
   * Read a complete response from the peer via BLE notifications.
   * Collects chunks until CHUNK_END is received.
   */
  private readResponse(device: Device, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: string[] = [];
      let timer: ReturnType<typeof setTimeout>;

      const sub = device.monitorCharacteristicForService(
        BLE_SERVICE_UUID,
        BLE_CHAR_NOTIFY_UUID,
        (error, characteristic) => {
          if (error) {
            clearTimeout(timer);
            sub.remove();
            reject(error);
            return;
          }

          if (!characteristic?.value) return;

          const raw = fromBase64(characteristic.value);
          const type = raw.substring(0, 2);
          const payload = raw.substring(2);

          if (type === BLE_MSG.CHUNK) {
            chunks.push(payload);
          } else if (type === BLE_MSG.CHUNK_END) {
            chunks.push(payload);
            clearTimeout(timer);
            sub.remove();

            const fullPayload = chunks.join('');
            resolve(fullPayload);
          } else if (type === BLE_MSG.ERROR) {
            clearTimeout(timer);
            sub.remove();
            reject(new Error(payload || 'Remote error'));
          } else {
            // Single-packet response (no chunking)
            clearTimeout(timer);
            sub.remove();
            resolve(raw);
          }
        },
      );

      timer = setTimeout(() => {
        sub.remove();
        reject(new Error('BLE read timeout'));
      }, timeoutMs);
    });
  }
}
