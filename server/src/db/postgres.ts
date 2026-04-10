import {Pool} from 'pg';

let pool: Pool;

export function initDB(): Pool {
  pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      'postgresql://splitxpense:splitxpense@localhost:5432/splitxpense',
    max: 20,
    idleTimeoutMillis: 30000,
  });
  return pool;
}

export function getPool(): Pool {
  if (!pool) throw new Error('DB not initialized');
  return pool;
}

export async function initTables(): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS devices (
        phone TEXT PRIMARY KEY,
        fcm_token TEXT NOT NULL,
        registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS server_transactions (
        id TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        amount INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'INR',
        merchant TEXT DEFAULT '',
        instrument_id TEXT DEFAULT '',
        transaction_type TEXT NOT NULL CHECK(transaction_type IN ('debit','credit')),
        payment_mode TEXT DEFAULT '',
        date TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'api',
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','pushed','dismissed')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_server_txn_phone ON server_transactions(phone);
      CREATE INDEX IF NOT EXISTS idx_server_txn_status ON server_transactions(status);

      CREATE TABLE IF NOT EXISTS aa_consents (
        id TEXT PRIMARY KEY,
        phone TEXT NOT NULL,
        consent_handle TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        session_id TEXT,
        last_polled_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_aa_consents_phone ON aa_consents(phone);
      CREATE INDEX IF NOT EXISTS idx_aa_consents_status ON aa_consents(status);
      CREATE INDEX IF NOT EXISTS idx_aa_consents_session ON aa_consents(session_id);

      CREATE TABLE IF NOT EXISTS device_backups (
        phone           TEXT PRIMARY KEY,
        ciphertext      BYTEA NOT NULL,
        nonce           BYTEA NOT NULL,
        salt            BYTEA NOT NULL,
        kdf_params      JSONB NOT NULL,
        format_version  INTEGER NOT NULL DEFAULT 1,
        size_bytes      INTEGER NOT NULL,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  } finally {
    client.release();
  }
}
