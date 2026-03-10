import {CRDTEngine} from '../crdt/CRDTEngine';
import {HttpSyncClient} from './HttpSyncClient';
import {getVectorClock, updateVectorClock, updatePeerWifiSync, upsertPeer} from '../../db/queries/syncQueries';
import {getLocalUser} from '../../db/queries/userQueries';
import {mergeVectorClocks} from '../crdt/VectorClock';
import {WIFI_SYNC_INTERVAL_MS} from '../../constants/syncConstants';
import {notifySyncComplete} from '../../notifications/SyncNotificationHandler';
import {refreshWeeklyReminder} from '../../notifications/WeeklyReminderScheduler';
import type {DiscoveredPeer, SyncResult} from './types';

export class WifiSyncManager {
  private client: HttpSyncClient;
  private crdtEngine: CRDTEngine;
  private autoSyncTimer: ReturnType<typeof setInterval> | null = null;
  private activePeers: Map<string, DiscoveredPeer> = new Map();

  constructor(crdtEngine: CRDTEngine) {
    this.client = new HttpSyncClient();
    this.crdtEngine = crdtEngine;
  }

  addPeer(peer: DiscoveredPeer): void {
    this.activePeers.set(peer.phone, peer);
    upsertPeer(peer.phone, peer.name, peer.ip, peer.port);
  }

  removePeer(phone: string): void {
    this.activePeers.delete(phone);
  }

  async syncWithPeer(peer: DiscoveredPeer): Promise<SyncResult> {
    try {
      const user = getLocalUser();
      if (!user) {
        return {success: false, operationsPushed: 0, operationsPulled: 0, error: 'Not set up'};
      }

      // 1. Handshake — exchange vector clocks
      const myVectorClock = getVectorClock(peer.phone);
      const remote = await this.client.handshake(peer.ip, peer.port, user.phone_number, myVectorClock);

      // 2. Pull — get their operations we haven't seen
      const remoteOps = await this.client.pull(peer.ip, peer.port, myVectorClock);

      // 3. Apply remote operations
      let pulled = 0;
      for (const op of remoteOps) {
        const applied = this.crdtEngine.applyRemote(op);
        if (applied) pulled++;
      }

      // 4. Push — send our operations they haven't seen
      const localOps = this.crdtEngine.getDeltasSince(remote.vectorClock);
      let pushed = 0;
      if (localOps.length > 0) {
        const result = await this.client.push(peer.ip, peer.port, localOps);
        pushed = result.accepted;
      }

      // 5. Update vector clocks
      const mergedClock = mergeVectorClocks(myVectorClock, remote.vectorClock);
      for (const [origin, hlc] of Object.entries(mergedClock)) {
        updateVectorClock(peer.phone, origin, hlc);
      }

      // Update last sync time
      updatePeerWifiSync(peer.phone);

      notifySyncComplete('wifi', pushed + pulled, peer.name).catch(() => {});
      refreshWeeklyReminder().catch(() => {});

      return {success: true, operationsPushed: pushed, operationsPulled: pulled};
    } catch (error: any) {
      return {success: false, operationsPushed: 0, operationsPulled: 0, error: error.message};
    }
  }

  startAutoSync(): void {
    if (this.autoSyncTimer) return;

    this.autoSyncTimer = setInterval(async () => {
      for (const peer of this.activePeers.values()) {
        await this.syncWithPeer(peer);
      }
    }, WIFI_SYNC_INTERVAL_MS);
  }

  stopAutoSync(): void {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
  }
}
