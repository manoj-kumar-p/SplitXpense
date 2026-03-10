export interface Group {
  id: string;
  name: string;
  description: string;
  icon: string;
  simplify_debts: number; // 1 = enabled (default), 0 = disabled
  delete_votes: string; // comma-separated phone numbers who voted to delete
  created_by: string;
  hlc_timestamp: string;
  is_deleted: number;
  created_at: string;
  updated_at: string;
}

export interface GroupMember {
  id: string;
  group_id: string;
  phone_number: string;
  display_name: string;
  added_by: string;
  hlc_timestamp: string;
  is_deleted: number;
  created_at: string;
  updated_at: string;
}
