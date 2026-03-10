export type MessageType = 'H' | 'h' | 'D' | 'A' | 'N' | 'P' | 'R';

export interface SmsMessage {
  type: MessageType;
  sequenceId: string;
  checksum: string;
  chunkIndex: number;
  totalChunks: number;
  payload: string;
}

export interface SmsSyncResult {
  success: boolean;
  messagesSent: number;
  messagesReceived: number;
  error?: string;
}

export const MESSAGE_TYPES: Record<string, MessageType> = {
  HANDSHAKE_REQ: 'H',
  HANDSHAKE_RES: 'h',
  DELTA_DATA: 'D',
  ACK: 'A',
  NACK: 'N',
  PING: 'P',
  RESET: 'R',
};
