export interface LocalUser {
  id: string;
  phone_number: string;
  display_name: string;
  created_at: string;
  updated_at: string;
}

export interface KnownUser {
  id: string;
  phone_number: string;
  display_name: string;
  hlc_timestamp: string;
  is_deleted: number;
  created_at: string;
  updated_at: string;
}
