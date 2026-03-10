export interface DiscoveredPeer {
  name: string;
  phone: string;
  ip: string;
  port: number;
}

export interface SyncResult {
  success: boolean;
  operationsPushed: number;
  operationsPulled: number;
  error?: string;
}
