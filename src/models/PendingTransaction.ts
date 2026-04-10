export type TxnSource = 'sms' | 'notification' | 'email' | 'api';
export type PaymentMode = '' | 'upi' | 'debit_card' | 'credit_card' | 'net_banking' | 'wallet';
export type InstrumentType = 'account' | 'debit_card' | 'credit_card' | 'upi' | 'wallet';
export type TransactionStatus = 'pending' | 'added' | 'dismissed';

export interface PendingTransaction {
  id: string;
  source: TxnSource;
  raw_text: string;
  amount: number;
  currency: string;
  merchant: string;
  note: string;
  payment_mode: PaymentMode;
  instrument_id: string;
  transaction_type: 'debit' | 'credit';
  detected_at: string;
  dedup_key: string;
  status: TransactionStatus;
  mapped_group_id: string;
  created_at: string;
}

export interface AccountGroupMap {
  instrument_id: string;
  instrument_type: InstrumentType;
  group_id: string;
  label: string;
  created_at: string;
  updated_at: string;
}

export interface ParsedTransaction {
  amount: number;
  currency: string;
  merchant: string;
  paymentMode: PaymentMode;
  instrumentId: string;
  transactionType: 'debit' | 'credit';
}
