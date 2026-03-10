export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS local_user (
  id            TEXT PRIMARY KEY,
  phone_number  TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS known_users (
  id            TEXT PRIMARY KEY,
  phone_number  TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  hlc_timestamp TEXT NOT NULL,
  is_deleted    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT DEFAULT '',
  created_by    TEXT NOT NULL,
  hlc_timestamp TEXT NOT NULL,
  is_deleted    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS group_members (
  id            TEXT PRIMARY KEY,
  group_id      TEXT NOT NULL REFERENCES groups(id),
  phone_number  TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  added_by      TEXT NOT NULL,
  hlc_timestamp TEXT NOT NULL,
  is_deleted    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE(group_id, phone_number)
);

CREATE TABLE IF NOT EXISTS expenses (
  id            TEXT PRIMARY KEY,
  group_id      TEXT NOT NULL REFERENCES groups(id),
  description   TEXT NOT NULL,
  amount        INTEGER NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'INR',
  paid_by       TEXT NOT NULL,
  split_type    TEXT NOT NULL CHECK(split_type IN ('equal','shares','percentage','exact')),
  expense_date  TEXT NOT NULL,
  hlc_timestamp TEXT NOT NULL,
  is_deleted    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expense_splits (
  id            TEXT PRIMARY KEY,
  expense_id    TEXT NOT NULL REFERENCES expenses(id),
  phone_number  TEXT NOT NULL,
  amount        INTEGER NOT NULL,
  percentage    REAL,
  hlc_timestamp TEXT NOT NULL,
  is_deleted    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE(expense_id, phone_number)
);

CREATE TABLE IF NOT EXISTS expense_payers (
  id            TEXT PRIMARY KEY,
  expense_id    TEXT NOT NULL REFERENCES expenses(id),
  phone_number  TEXT NOT NULL,
  amount        INTEGER NOT NULL,
  hlc_timestamp TEXT NOT NULL,
  is_deleted    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE(expense_id, phone_number)
);

CREATE TABLE IF NOT EXISTS settlements (
  id            TEXT PRIMARY KEY,
  group_id      TEXT NOT NULL REFERENCES groups(id),
  paid_by       TEXT NOT NULL,
  paid_to       TEXT NOT NULL,
  amount        INTEGER NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'INR',
  settled_at    TEXT NOT NULL,
  hlc_timestamp TEXT NOT NULL,
  is_deleted    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_operations (
  id              TEXT PRIMARY KEY,
  hlc_timestamp   TEXT NOT NULL,
  origin_peer     TEXT NOT NULL,
  table_name      TEXT NOT NULL,
  row_id          TEXT NOT NULL,
  operation_type  TEXT NOT NULL CHECK(operation_type IN ('INSERT','UPDATE','DELETE')),
  column_name     TEXT,
  old_value       TEXT,
  new_value       TEXT,
  applied         INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_ops_hlc ON sync_operations(hlc_timestamp);
CREATE INDEX IF NOT EXISTS idx_sync_ops_peer ON sync_operations(origin_peer);
CREATE INDEX IF NOT EXISTS idx_sync_ops_table_row ON sync_operations(table_name, row_id);

CREATE TABLE IF NOT EXISTS vector_clocks (
  peer_phone    TEXT NOT NULL,
  origin_phone  TEXT NOT NULL,
  hlc_value     TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (peer_phone, origin_phone)
);

CREATE TABLE IF NOT EXISTS sms_outbox (
  id              TEXT PRIMARY KEY,
  recipient_phone TEXT NOT NULL,
  message_type    TEXT NOT NULL,
  payload         TEXT NOT NULL,
  chunk_index     INTEGER NOT NULL DEFAULT 0,
  total_chunks    INTEGER NOT NULL DEFAULT 1,
  sequence_id     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK(status IN ('pending','sending','sent','acked','failed')),
  retry_count     INTEGER NOT NULL DEFAULT 0,
  max_retries     INTEGER NOT NULL DEFAULT 3,
  created_at      TEXT NOT NULL,
  sent_at         TEXT,
  acked_at        TEXT
);

CREATE INDEX IF NOT EXISTS idx_sms_outbox_status ON sms_outbox(status);
CREATE INDEX IF NOT EXISTS idx_sms_outbox_recipient ON sms_outbox(recipient_phone);

CREATE TABLE IF NOT EXISTS sms_inbox_fragments (
  id              TEXT PRIMARY KEY,
  sender_phone    TEXT NOT NULL,
  sequence_id     TEXT NOT NULL,
  chunk_index     INTEGER NOT NULL,
  total_chunks    INTEGER NOT NULL,
  payload         TEXT NOT NULL,
  received_at     TEXT NOT NULL,
  reassembled     INTEGER NOT NULL DEFAULT 0,
  UNIQUE(sender_phone, sequence_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS peers (
  phone_number    TEXT PRIMARY KEY,
  display_name    TEXT,
  last_wifi_sync  TEXT,
  last_sms_sync   TEXT,
  wifi_ip         TEXT,
  wifi_port       INTEGER,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL
);
`;
