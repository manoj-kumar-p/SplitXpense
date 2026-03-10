export interface Settlement {
  id: string;
  group_id: string;
  paid_by: string; // phone_number
  paid_to: string; // phone_number
  amount: number; // paisa/cents
  currency: string;
  settled_at: string;
  hlc_timestamp: string;
  is_deleted: number;
  created_at: string;
  updated_at: string;
}
