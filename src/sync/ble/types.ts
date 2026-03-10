export interface BLEPeer {
  id: string; // BLE device ID
  name: string;
  phone: string;
}

export interface BLESyncResult {
  success: boolean;
  operationsPushed: number;
  operationsPulled: number;
  error?: string;
}

// BLE Service and Characteristic UUIDs
export const BLE_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
export const BLE_CHAR_WRITE_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // Client writes to this
export const BLE_CHAR_NOTIFY_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // Server notifies via this

// Protocol message types
export const BLE_MSG = {
  HANDSHAKE_REQ: 'HR',
  HANDSHAKE_RES: 'HS',
  PULL_REQ: 'PR',
  PULL_RES: 'PS',
  PUSH_DATA: 'PD',
  PUSH_ACK: 'PA',
  CHUNK: 'CK',
  CHUNK_END: 'CE',
  ERROR: 'ER',
} as const;

// Device name prefix for scanning
export const BLE_DEVICE_PREFIX = 'SE-';
