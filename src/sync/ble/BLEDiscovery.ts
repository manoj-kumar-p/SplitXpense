import {BleManager, Device, State} from 'react-native-ble-plx';
import {Platform, PermissionsAndroid} from 'react-native';
import {BLE_SERVICE_UUID, BLE_DEVICE_PREFIX} from './types';
import type {BLEPeer} from './types';

type PeerCallback = (peer: BLEPeer) => void;

export class BLEDiscovery {
  private manager: BleManager;
  private onFoundCallbacks: PeerCallback[] = [];
  private onLostCallbacks: PeerCallback[] = [];
  private discoveredDevices: Map<string, BLEPeer> = new Map();
  private scanning = false;
  private scanTimer: ReturnType<typeof setTimeout> | null = null;
  private localPhone = '';
  private localName = '';

  constructor() {
    this.manager = new BleManager();
  }

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    try {
      const apiLevel = Platform.Version;

      if (typeof apiLevel === 'number' && apiLevel >= 31) {
        // Android 12+
        const results = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        return Object.values(results).every(r => r === PermissionsAndroid.RESULTS.GRANTED);
      } else {
        // Android 11 and below
        const result = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        return result === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch {
      return false;
    }
  }

  async isBluetoothEnabled(): Promise<boolean> {
    const state = await this.manager.state();
    return state === State.PoweredOn;
  }

  async startScanning(localPhone: string, localName: string): Promise<void> {
    if (this.scanning) return;

    this.localPhone = localPhone;
    this.localName = localName;

    const permitted = await this.requestPermissions();
    if (!permitted) {
      throw new Error('Bluetooth permissions not granted');
    }

    const enabled = await this.isBluetoothEnabled();
    if (!enabled) {
      throw new Error('Bluetooth is not enabled');
    }

    this.scanning = true;
    this.discoveredDevices.clear();

    // Scan for devices advertising our service UUID
    this.manager.startDeviceScan(
      [BLE_SERVICE_UUID],
      {allowDuplicates: false},
      (error, device) => {
        if (error) {
          console.warn('[BLE] Scan error:', error.message);
          return;
        }

        if (!device || !device.name) return;

        // Only accept devices with our prefix
        if (!device.name.startsWith(BLE_DEVICE_PREFIX)) return;

        // Parse short ID from device name: "SX-1234"
        // Device name only contains last 4 digits of phone for privacy
        const shortId = device.name.substring(BLE_DEVICE_PREFIX.length);
        if (!shortId) return;

        // Skip self (compare last 4 digits)
        const localShortId = localPhone.slice(-4);
        if (shortId === localShortId) return;

        // Use short ID as phone placeholder until handshake provides full info
        const phone = shortId;
        const name = shortId;

        if (!this.discoveredDevices.has(device.id)) {
          const peer: BLEPeer = {id: device.id, phone, name};
          this.discoveredDevices.set(device.id, peer);
          for (const cb of this.onFoundCallbacks) cb(peer);
        }
      },
    );

    // Stop and restart scan periodically to keep discovering
    this.scanTimer = setTimeout(() => {
      if (this.scanning) {
        this.manager.stopDeviceScan();
        this.scanTimer = null;
        this.scanning = false;  // Reset before restart so startScanning doesn't bail out
        this.startScanning(localPhone, localName).catch(() => {});
      }
    }, 15000);
  }

  stopScanning(): void {
    this.scanning = false;
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
    this.manager.stopDeviceScan();
  }

  onPeerFound(callback: PeerCallback): void {
    this.onFoundCallbacks.push(callback);
  }

  onPeerLost(callback: PeerCallback): void {
    this.onLostCallbacks.push(callback);
  }

  getDiscoveredPeers(): BLEPeer[] {
    return Array.from(this.discoveredDevices.values());
  }

  getManager(): BleManager {
    return this.manager;
  }

  async connectToDevice(deviceId: string): Promise<Device> {
    const device = await this.manager.connectToDevice(deviceId, {
      timeout: 10000,
    });
    await device.discoverAllServicesAndCharacteristics();
    return device;
  }

  async disconnectDevice(deviceId: string): Promise<void> {
    try {
      await this.manager.cancelDeviceConnection(deviceId);
    } catch {
      // Already disconnected
    }
  }

  destroy(): void {
    this.stopScanning();
    this.discoveredDevices.clear();
    this.onFoundCallbacks = [];
    this.onLostCallbacks = [];
    this.manager.destroy();
  }
}
