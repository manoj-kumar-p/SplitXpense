export type OperationType = 'INSERT' | 'UPDATE' | 'DELETE';

export interface SyncOperation {
  id: string;
  hlc_timestamp: string;
  origin_peer: string; // phone_number
  table_name: string;
  row_id: string;
  operation_type: OperationType;
  column_name: string | null;
  old_value: string | null;
  new_value: string | null;
  applied: number;
  created_at: string;
}

export interface VectorClockEntry {
  peer_phone: string;
  origin_phone: string;
  hlc_value: string;
  updated_at: string;
}

export interface Peer {
  phone_number: string;
  display_name: string | null;
  last_wifi_sync: string | null;
  last_sms_sync: string | null;
  last_ble_sync: string | null;
  wifi_ip: string | null;
  wifi_port: number | null;
  created_at: string;
  updated_at: string;
}

export interface SmsOutboxEntry {
  id: string;
  recipient_phone: string;
  message_type: string;
  payload: string;
  chunk_index: number;
  total_chunks: number;
  sequence_id: string;
  status: 'pending' | 'sending' | 'sent' | 'acked' | 'failed';
  retry_count: number;
  max_retries: number;
  created_at: string;
  sent_at: string | null;
  acked_at: string | null;
}

export interface SmsInboxFragment {
  id: string;
  sender_phone: string;
  sequence_id: string;
  chunk_index: number;
  total_chunks: number;
  payload: string;
  received_at: string;
  reassembled: number;
}
