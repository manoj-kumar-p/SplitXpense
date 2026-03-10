export type SplitType = 'equal' | 'shares' | 'percentage' | 'exact';

export interface Expense {
  id: string;
  group_id: string;
  description: string;
  amount: number; // stored as integer paisa/cents
  currency: string;
  paid_by: string; // comma-separated phone_numbers for multiple payers
  split_type: SplitType;
  category: string;
  expense_date: string;
  hlc_timestamp: string;
  is_deleted: number;
  created_at: string;
  updated_at: string;
}

export interface ExpenseSplit {
  id: string;
  expense_id: string;
  phone_number: string;
  amount: number; // share in paisa/cents
  percentage: number | null;
  hlc_timestamp: string;
  is_deleted: number;
  created_at: string;
  updated_at: string;
}

/**
 * Tracks how much each payer contributed (for multi-payer expenses).
 * Stored in expense_payers table.
 */
export interface ExpensePayer {
  id: string;
  expense_id: string;
  phone_number: string;
  amount: number; // paisa
  hlc_timestamp: string;
  is_deleted: number;
  created_at: string;
  updated_at: string;
}
