import {getAllPeers, upsertPeer} from '../db/queries/syncQueries';
import type {Peer} from '../models/SyncOperation';
import type {DiscoveredPeer} from './wifi/types';
import type {BLEPeer} from './ble/types';

export class PeerRegistry {
  private wifiPeers: Map<string, DiscoveredPeer> = new Map();
  private blePeers: Map<string, BLEPeer> = new Map();

  getWifiPeers(): DiscoveredPeer[] {
    return Array.from(this.wifiPeers.values());
  }

  getBlePeers(): BLEPeer[] {
    return Array.from(this.blePeers.values());
  }

  getAllPeers(): Peer[] {
    return getAllPeers();
  }

  addWifiPeer(peer: DiscoveredPeer): void {
    this.wifiPeers.set(peer.phone, peer);
    upsertPeer(peer.phone, peer.name, peer.ip, peer.port);
  }

  removeWifiPeer(phone: string): void {
    this.wifiPeers.delete(phone);
  }

  isOnWifi(phone: string): boolean {
    return this.wifiPeers.has(phone);
  }

  getWifiPeer(phone: string): DiscoveredPeer | undefined {
    return this.wifiPeers.get(phone);
  }

  addBlePeer(peer: BLEPeer): void {
    this.blePeers.set(peer.phone, peer);
    upsertPeer(peer.phone, peer.name);
  }

  removeBlePeer(phone: string): void {
    this.blePeers.delete(phone);
  }

  isOnBle(phone: string): boolean {
    return this.blePeers.has(phone);
  }

  getBlePeer(phone: string): BLEPeer | undefined {
    return this.blePeers.get(phone);
  }
}
