import {CRDTEngine} from './crdt/CRDTEngine';
import {MDNSDiscovery} from './wifi/MDNSDiscovery';
import {HttpSyncServer} from './wifi/HttpSyncServer';
import {WifiSyncManager} from './wifi/WifiSyncManager';
import {SmsSyncManager} from './sms/SmsSyncManager';
import {BLEDiscovery} from './ble/BLEDiscovery';
import {BLESyncManager} from './ble/BLESyncManager';
import {PeerRegistry} from './PeerRegistry';
import {getLocalUser} from '../db/queries/userQueries';
import {getNotificationService} from '../notifications/NotificationService';

export class SyncOrchestrator {
  private crdtEngine: CRDTEngine | null = null;
  private mdns: MDNSDiscovery | null = null;
  private httpServer: HttpSyncServer | null = null;
  private wifiManager: WifiSyncManager | null = null;
  private smsManager: SmsSyncManager | null = null;
  private bleDiscovery: BLEDiscovery | null = null;
  private bleSyncManager: BLESyncManager | null = null;
  private peerRegistry: PeerRegistry;
  private started = false;

  constructor() {
    this.peerRegistry = new PeerRegistry();
  }

  async start(): Promise<void> {
    if (this.started) return;

    const user = getLocalUser();
    if (!user) return;

    // Initialize notification channels
    getNotificationService().initialize().catch(() => {});

    // Initialize CRDT engine with user's phone as node ID
    this.crdtEngine = new CRDTEngine(user.phone_number);

    // Start WiFi sync
    this.mdns = new MDNSDiscovery();
    this.httpServer = new HttpSyncServer(this.crdtEngine);
    this.wifiManager = new WifiSyncManager(this.crdtEngine);

    // mDNS discovery callbacks
    this.mdns.onPeerFound(peer => {
      this.peerRegistry.addWifiPeer(peer);
      this.wifiManager?.addPeer(peer);
    });

    this.mdns.onPeerLost(peer => {
      this.peerRegistry.removeWifiPeer(peer.phone);
      this.wifiManager?.removePeer(peer.phone);
    });

    // Start services
    await this.httpServer.start();
    await this.mdns.startAdvertising(user.phone_number, user.display_name);
    await this.mdns.startDiscovery();
    this.wifiManager.startAutoSync();

    // Start SMS sync
    this.smsManager = new SmsSyncManager(this.crdtEngine);
    await this.smsManager.startListening();

    // Initialize BLE sync
    this.bleDiscovery = new BLEDiscovery();
    this.bleSyncManager = new BLESyncManager(this.crdtEngine, this.bleDiscovery);

    this.bleDiscovery.onPeerFound(peer => {
      this.peerRegistry.addBlePeer(peer);
    });

    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) return;

    this.wifiManager?.stopAutoSync();
    await this.mdns?.stop();
    await this.httpServer?.stop();
    this.smsManager?.stopListening();
    this.bleDiscovery?.destroy();

    this.started = false;
  }

  /**
   * Sync with a specific peer.
   * Priority: WiFi > BLE > SMS.
   */
  async syncWithPeer(peerPhone: string, forceSms = false, forceBle = false): Promise<{method: string; success: boolean}> {
    // WiFi sync (preferred)
    if (!forceSms && !forceBle && this.peerRegistry.isOnWifi(peerPhone)) {
      const peer = this.peerRegistry.getWifiPeer(peerPhone);
      if (peer && this.wifiManager) {
        const result = await this.wifiManager.syncWithPeer(peer);
        return {method: 'wifi', success: result.success};
      }
    }

    // BLE sync
    if (!forceSms && (forceBle || this.peerRegistry.isOnBle(peerPhone))) {
      const blePeer = this.peerRegistry.getBlePeer(peerPhone);
      if (blePeer && this.bleSyncManager) {
        const result = await this.bleSyncManager.syncWithPeer(blePeer);
        return {method: 'ble', success: result.success};
      }
    }

    // SMS sync (fallback)
    if (this.smsManager) {
      const result = await this.smsManager.syncWithPeer(peerPhone);
      return {method: 'sms', success: result.success};
    }

    return {method: 'none', success: false};
  }

  /**
   * Start BLE scanning for nearby peers.
   */
  async startBleScanning(): Promise<void> {
    const user = getLocalUser();
    if (!user || !this.bleDiscovery) return;
    await this.bleDiscovery.startScanning(user.phone_number, user.display_name);
  }

  /**
   * Stop BLE scanning.
   */
  stopBleScanning(): void {
    this.bleDiscovery?.stopScanning();
  }

  /**
   * Get discovered BLE peers.
   */
  getBleDiscovery(): BLEDiscovery | null {
    return this.bleDiscovery;
  }

  getCRDTEngine(): CRDTEngine | null {
    return this.crdtEngine;
  }

  getPeerRegistry(): PeerRegistry {
    return this.peerRegistry;
  }

  setSmseSender(sender: (phone: string, message: string) => Promise<void>): void {
    this.smsManager?.setSender(sender);
  }
}

// Singleton instance
let orchestrator: SyncOrchestrator | null = null;

export function getSyncOrchestrator(): SyncOrchestrator {
  if (!orchestrator) {
    orchestrator = new SyncOrchestrator();
  }
  return orchestrator;
}
