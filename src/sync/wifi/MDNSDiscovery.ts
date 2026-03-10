import Zeroconf from 'react-native-zeroconf';
import {MDNS_SERVICE_TYPE, SYNC_PORT} from '../../constants/syncConstants';
import type {DiscoveredPeer} from './types';

type PeerCallback = (peer: DiscoveredPeer) => void;

export class MDNSDiscovery {
  private zeroconf: Zeroconf;
  private onFoundCallbacks: PeerCallback[] = [];
  private onLostCallbacks: PeerCallback[] = [];

  constructor() {
    this.zeroconf = new Zeroconf();
  }

  async startAdvertising(userPhone: string, displayName: string): Promise<void> {
    try {
      // Sanitize phone for service name (remove +)
      const serviceName = `st-${userPhone.replace(/[^0-9]/g, '')}`;
      this.zeroconf.publishService(
        'tcp',
        'splittracker',
        serviceName,
        SYNC_PORT,
        {phone: userPhone, name: displayName, version: '1'},
      );
    } catch (error) {
      console.warn('mDNS advertise failed:', error);
    }
  }

  async startDiscovery(): Promise<void> {
    this.zeroconf.on('resolved', (service: any) => {
      const phone = service.txt?.phone;
      if (!phone) return;

      const peer: DiscoveredPeer = {
        name: service.txt?.name || phone,
        phone,
        ip: service.addresses?.[0] || service.host,
        port: service.port || SYNC_PORT,
      };

      for (const cb of this.onFoundCallbacks) {
        cb(peer);
      }
    });

    this.zeroconf.on('removed', (name: string) => {
      // Best effort: extract phone from service name
      const phoneDigits = name.replace('st-', '');
      for (const cb of this.onLostCallbacks) {
        cb({name, phone: '+' + phoneDigits, ip: '', port: 0});
      }
    });

    this.zeroconf.scan(MDNS_SERVICE_TYPE.replace(/\.$/, ''));
  }

  onPeerFound(callback: PeerCallback): void {
    this.onFoundCallbacks.push(callback);
  }

  onPeerLost(callback: PeerCallback): void {
    this.onLostCallbacks.push(callback);
  }

  async stop(): Promise<void> {
    try {
      this.zeroconf.unpublishService('splittracker');
      this.zeroconf.stop();
      this.zeroconf.removeAllListeners();
    } catch {
      // Ignore cleanup errors
    }
    this.onFoundCallbacks = [];
    this.onLostCallbacks = [];
  }
}
