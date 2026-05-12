import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

export const sql = postgres(DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

/**
 * Initialize baram tables in the sui_indexer database.
 * Safe to call multiple times (IF NOT EXISTS).
 */
export async function initSchema(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS aer_records (
      object_id            TEXT PRIMARY KEY,
      request_id           BIGINT NOT NULL,

      -- 1. WHO: Requester
      initiator            TEXT NOT NULL,
      authorizer           TEXT NOT NULL,
      delegation_path      TEXT[] DEFAULT '{}',

      -- 2. WHO: Executor
      executor             TEXT NOT NULL,
      executor_principal   TEXT,

      -- 3. HOW MUCH
      payment_amount       BIGINT NOT NULL,
      payment_token        SMALLINT NOT NULL DEFAULT 0,
      executor_received    BIGINT NOT NULL,
      fee_detail           JSONB,
      budget_id            TEXT,
      budget_remaining     BIGINT,

      -- 4. WHAT
      model_name           TEXT NOT NULL,
      model_metadata       JSONB,
      input_hash           TEXT NOT NULL,
      output_hash          TEXT NOT NULL,
      execution_time_ms    INTEGER NOT NULL,

      -- 5. WHY
      purpose              TEXT,
      policy_version       INTEGER,
      capability_version   BIGINT,
      constraints          JSONB,

      -- 6. HOW TRUSTWORTHY
      executor_tier        SMALLINT NOT NULL DEFAULT 0,
      executor_reputation  INTEGER NOT NULL DEFAULT 0,
      executor_stake_amount BIGINT NOT NULL DEFAULT 0,
      tee_verified         BOOLEAN NOT NULL DEFAULT FALSE,
      tee_attestation_hash TEXT,

      -- 7. WHEN
      requested_at         BIGINT NOT NULL,
      settled_at           BIGINT NOT NULL,
      status               SMALLINT NOT NULL DEFAULT 0,

      -- 8. CHAIN
      triggered_by         TEXT,
      triggered_action     TEXT,

      -- Sync metadata
      synced_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source_tx_digest     TEXT
    )
  `;

  // Create indexes (IF NOT EXISTS is implicit for CREATE INDEX with concurrent-safe check)
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_aer_initiator    ON aer_records(initiator, settled_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_aer_executor     ON aer_records(executor, settled_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_aer_authorizer   ON aer_records(authorizer, settled_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_aer_budget       ON aer_records(budget_id, settled_at DESC) WHERE budget_id IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_aer_request_id   ON aer_records(request_id)`,
    `CREATE INDEX IF NOT EXISTS idx_aer_settled_at   ON aer_records(settled_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_aer_triggered_by ON aer_records(triggered_by) WHERE triggered_by IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_aer_model        ON aer_records(model_name, settled_at DESC)`,
    // Plan B B2: capability_version snapshot. Indexer query: "all AERs
    // emitted under a specific cap version" (used by the Dashboard
    // capability history view in Plan E). Per AER_V2_CODEC §15.
    `CREATE INDEX IF NOT EXISTS idx_aer_capability_version ON aer_records(capability_version, settled_at DESC) WHERE capability_version IS NOT NULL`,
  ];
  for (const idx of indexes) {
    await sql.unsafe(idx);
  }

  // Forward-migrate existing rows. Safe to call repeatedly; ADD COLUMN IF
  // NOT EXISTS is a no-op once applied. Existing v1 AERs end up with
  // capability_version = NULL, which the SDK surfaces as `null` per the
  // Plan B handoff invariant.
  await sql`
    ALTER TABLE aer_records
      ADD COLUMN IF NOT EXISTS capability_version BIGINT
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS aer_sync_state (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  console.log('[db] Schema initialized');
}
