/**
 * BLE Peripheral (GATT server) — TypeScript wrapper around the native
 * BLEPeripheralModule on Android. Handles the protocol side of incoming
 * sync sessions: chunk reassembly, dispatch to handshake/pull/push handlers,
 * and chunked response writes back to the central.
 *
 * The native module is a transport only — it surfaces raw chunks via events
 * and accepts outgoing chunks via sendChunk. All CRDT logic stays here in TS,
 * mirroring BLESyncManager.ts on the central side.
 */
import {NativeEventEmitter, NativeModules, Platform} from 'react-native';
import {CRDTEngine} from '../crdt/CRDTEngine';
import {
  getVectorClock,
  updateVectorClock,
  upsertPeer,
  getPeer,
  updatePeerBleSync,
} from '../../db/queries/syncQueries';
import {getLocalUser} from '../../db/queries/userQueries';
import {mergeVectorClocks} from '../crdt/VectorClock';
import {notifySyncComplete} from '../../notifications/SyncNotificationHandler';
import {refreshWeeklyReminder} from '../../notifications/WeeklyReminderScheduler';
import {BLE_MSG, BLE_DEVICE_PREFIX} from './types';

const CHUNK_SIZE = 180;

const {BLEPeripheralModule} = NativeModules as {
  BLEPeripheralModule?: {
    isSupported(): Promise<boolean>;
    start(deviceName: string): Promise<boolean>;
    stop(): Promise<boolean>;
    isAdvertising(): Promise<boolean>;
    sendChunk(centralAddress: string, data: string): Promise<boolean>;
  };
};

interface ChunkEvent {
  address: string;
  data: string; // base64
}

interface CentralEvent {
  address: string;
}

function toBase64(str: string): string {
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

interface PendingCentral {
  buffer: string[];
  remotePhone?: string;
  remoteName?: string;
  remoteVc?: Record<string, string>;
  myVcAtHandshake?: Record<string, string>;
  pulled: number;
  pushed: number;
}

export class BLEPeripheral {
  private crdtEngine: CRDTEngine | null = null;
  private emitter: NativeEventEmitter | null = null;
  private subs: Array<{remove: () => void}> = [];
  private centrals = new Map<string, PendingCentral>();
  private running = false;

  constructor(crdtEngine?: CRDTEngine) {
    if (crdtEngine) this.crdtEngine = crdtEngine;
  }

  setCrdtEngine(engine: CRDTEngine): void {
    this.crdtEngine = engine;
  }

  async isSupported(): Promise<boolean> {
    if (Platform.OS !== 'android' || !BLEPeripheralModule) return false;
    try {
      return await BLEPeripheralModule.isSupported();
    } catch {
      return false;
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    if (Platform.OS !== 'android' || !BLEPeripheralModule) {
      console.warn('[BLEPeripheral] Native module unavailable on this platform');
      return;
    }
    const user = getLocalUser();
    if (!user) {
      console.warn('[BLEPeripheral] No local user; cannot start advertising');
      return;
    }

    // Device name is limited (~8 chars after prefix to fit advertisement payload).
    const shortId = user.phone_number.slice(-4);
    const deviceName = `${BLE_DEVICE_PREFIX}${shortId}`;

    this.attachListeners();
    try {
      await BLEPeripheralModule.start(deviceName);
      this.running = true;
    } catch (err) {
      this.detachListeners();
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.detachListeners();
    this.centrals.clear();
    try {
      await BLEPeripheralModule?.stop();
    } catch {}
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  private attachListeners(): void {
    if (!BLEPeripheralModule) return;
    const emitter = new NativeEventEmitter(NativeModules.BLEPeripheralModule);
    this.emitter = emitter;

    this.subs.push(
      emitter.addListener('BLEPeripheral_CentralConnected', (e: CentralEvent) => {
        this.centrals.set(e.address, {buffer: [], pulled: 0, pushed: 0});
      }),
    );
    this.subs.push(
      emitter.addListener('BLEPeripheral_CentralDisconnected', (e: CentralEvent) => {
        this.centrals.delete(e.address);
      }),
    );
    this.subs.push(
      emitter.addListener('BLEPeripheral_ChunkReceived', (e: ChunkEvent) => {
        this.handleIncomingChunk(e.address, e.data).catch(err =>
          console.warn('[BLEPeripheral] chunk handler error:', err),
        );
      }),
    );
  }

  private detachListeners(): void {
    for (const sub of this.subs) sub.remove();
    this.subs = [];
    this.emitter = null;
  }

  private async handleIncomingChunk(address: string, b64: string): Promise<void> {
    let central = this.centrals.get(address);
    if (!central) {
      central = {buffer: [], pulled: 0, pushed: 0};
      this.centrals.set(address, central);
    }

    const raw = fromBase64(b64);
    const type = raw.substring(0, 2);
    const payload = raw.substring(2);

    if (type === BLE_MSG.CHUNK) {
      central.buffer.push(payload);
      return;
    }
    if (type !== BLE_MSG.CHUNK_END) {
      // Single-packet message — treat the whole thing as one payload
      await this.handleMessage(address, central, raw);
      return;
    }

    central.buffer.push(payload);
    const fullPayload = central.buffer.join('');
    central.buffer = [];
    await this.handleMessage(address, central, fullPayload);
  }

  private async handleMessage(
    address: string,
    central: PendingCentral,
    payload: string,
  ): Promise<void> {
    let msg: any;
    try {
      msg = JSON.parse(payload);
    } catch {
      await this.sendError(address, 'Invalid JSON');
      return;
    }

    switch (msg.type) {
      case BLE_MSG.HANDSHAKE_REQ:
        await this.handleHandshake(address, central, msg);
        break;
      case BLE_MSG.PULL_REQ:
        await this.handlePull(address, central, msg);
        break;
      case BLE_MSG.PUSH_DATA:
        await this.handlePush(address, central, msg);
        break;
      default:
        await this.sendError(address, `Unknown type: ${msg.type}`);
    }
  }

  private async handleHandshake(
    address: string,
    central: PendingCentral,
    msg: {phone?: string; name?: string; vc?: Record<string, string>},
  ): Promise<void> {
    const user = getLocalUser();
    if (!user) {
      await this.sendError(address, 'Server not set up');
      return;
    }
    const remotePhone = msg.phone || '';
    if (!remotePhone) {
      await this.sendError(address, 'Missing phone in handshake');
      return;
    }

    upsertPeer(remotePhone, msg.name || '');
    if (!getPeer(remotePhone)) {
      await this.sendError(address, 'Unknown peer');
      return;
    }

    central.remotePhone = remotePhone;
    central.remoteName = msg.name || '';
    central.remoteVc = msg.vc || {};
    central.myVcAtHandshake = getVectorClock(remotePhone);

    const response = JSON.stringify({
      type: BLE_MSG.HANDSHAKE_RES,
      phone: user.phone_number,
      name: user.display_name,
      vc: central.myVcAtHandshake,
    });
    await this.writeChunked(address, response);
  }

  private async handlePull(
    address: string,
    central: PendingCentral,
    msg: {vc?: Record<string, string>},
  ): Promise<void> {
    if (!this.crdtEngine || !central.remotePhone) {
      await this.sendError(address, 'Not handshaken');
      return;
    }
    const remoteVc = msg.vc || {};
    const ops = this.crdtEngine.getDeltasSince(remoteVc);
    const response = JSON.stringify({type: BLE_MSG.PULL_RES, ops});
    await this.writeChunked(address, response);
  }

  private async handlePush(
    address: string,
    central: PendingCentral,
    msg: {ops?: any[]},
  ): Promise<void> {
    if (!this.crdtEngine || !central.remotePhone) {
      await this.sendError(address, 'Not handshaken');
      return;
    }
    const ops = msg.ops || [];
    let accepted = 0;
    for (const op of ops) {
      try {
        if (this.crdtEngine.applyRemote(op)) accepted++;
      } catch (err) {
        console.warn('[BLEPeripheral] applyRemote failed:', err);
      }
    }

    // Merge vector clocks: this central pushed ops up to whatever HLC the
    // included ops carry. Update our record of what they have seen.
    if (central.remoteVc && central.myVcAtHandshake) {
      const merged = mergeVectorClocks(central.myVcAtHandshake, central.remoteVc);
      for (const [origin, hlc] of Object.entries(merged)) {
        updateVectorClock(central.remotePhone, origin, hlc as string);
      }
    }
    updatePeerBleSync(central.remotePhone);

    const ack = JSON.stringify({type: BLE_MSG.PUSH_ACK, accepted});
    await this.writeChunked(address, ack);

    notifySyncComplete('ble', accepted, central.remoteName || central.remotePhone).catch(() => {});
    refreshWeeklyReminder().catch(() => {});
  }

  private async sendError(address: string, message: string): Promise<void> {
    try {
      const packet = BLE_MSG.ERROR + message;
      await BLEPeripheralModule?.sendChunk(address, toBase64(packet));
    } catch {}
  }

  private async writeChunked(address: string, data: string): Promise<void> {
    if (!BLEPeripheralModule) return;
    const chunks: string[] = [];
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      chunks.push(data.substring(i, i + CHUNK_SIZE));
    }
    for (let i = 0; i < chunks.length; i++) {
      const isLast = i === chunks.length - 1;
      const prefix = isLast ? BLE_MSG.CHUNK_END : BLE_MSG.CHUNK;
      const packet = prefix + chunks[i];
      await BLEPeripheralModule.sendChunk(address, toBase64(packet));
    }
  }
}
