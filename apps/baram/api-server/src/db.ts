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

      -- 8. CHAIN (sub-struct: ChainContext)
      triggered_by         TEXT,
      triggered_action     TEXT,
      -- 8b. LINEAGE (sub-struct: ChainContext.lineage)
      intent_id            TEXT,
      parent_intent_id     TEXT,
      execution_id         INTEGER,

      -- 9. ENVELOPE (sub-struct: ActionEnvelope)
      event_class             SMALLINT,
      action_type             TEXT,
      action_schema_version   INTEGER,
      payload_codec           TEXT,
      payload_hash            TEXT,
      payload_bytes           TEXT,
      action_summary          TEXT,
      action_outcome          SMALLINT,

      -- 10. WAKE (sub-struct: WakeContext)
      triggered_by_type    SMALLINT,
      triggered_by_ref     TEXT,

      -- 11. REPLAY (sub-struct: ReplayContext)
      model_version         TEXT,
      prompt_template_hash  TEXT,
      market_snapshot_hash  TEXT,
      replay_extras         JSONB,

      -- Sync metadata
      synced_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source_tx_digest     TEXT
    )
  `;

  // Forward-migrate existing rows. Each ADD COLUMN IF NOT EXISTS is
  // idempotent so this block is safe to re-run on a deployed DB. New
  // columns surface as NULL for pre-Plan-C AERs (which never had the
  // sub-structs at all) and for the legacy ungated settlement path.
  //
  // MUST run BEFORE CREATE INDEX below; otherwise indexes that reference
  // these columns (capability_version, intent_id, event_class,
  // agent_profile_id, ...) abort the whole init on a node where the
  // table was originally created from the bare CREATE TABLE above. We
  // hit this on prod node-3 after a fresh rsync — the original order
  // was indexes-first, which silently failed on every restart and left
  // the schema at the v1 baseline indefinitely.
  await sql`
    ALTER TABLE aer_records
      ADD COLUMN IF NOT EXISTS capability_version    BIGINT,
      ADD COLUMN IF NOT EXISTS intent_id             TEXT,
      ADD COLUMN IF NOT EXISTS parent_intent_id      TEXT,
      ADD COLUMN IF NOT EXISTS execution_id          INTEGER,
      ADD COLUMN IF NOT EXISTS event_class           SMALLINT,
      ADD COLUMN IF NOT EXISTS action_type           TEXT,
      ADD COLUMN IF NOT EXISTS action_schema_version INTEGER,
      ADD COLUMN IF NOT EXISTS payload_codec         TEXT,
      ADD COLUMN IF NOT EXISTS payload_hash          TEXT,
      ADD COLUMN IF NOT EXISTS payload_bytes         TEXT,
      ADD COLUMN IF NOT EXISTS action_summary        TEXT,
      ADD COLUMN IF NOT EXISTS action_outcome        SMALLINT,
      ADD COLUMN IF NOT EXISTS triggered_by_type     SMALLINT,
      ADD COLUMN IF NOT EXISTS triggered_by_ref      TEXT,
      ADD COLUMN IF NOT EXISTS model_version         TEXT,
      ADD COLUMN IF NOT EXISTS prompt_template_hash  TEXT,
      ADD COLUMN IF NOT EXISTS market_snapshot_hash  TEXT,
      ADD COLUMN IF NOT EXISTS replay_extras         JSONB,
      -- v3 agent attribution: AgentProfile object id, sourced from the
      -- ExecutionReportCreatedV3 event. NULL for legacy v2 callers.
      ADD COLUMN IF NOT EXISTS agent_profile_id      TEXT
  `;

  // Indexes. Created AFTER ALTER above so partial indexes that reference
  // post-v1 columns can compile their predicate.
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_aer_initiator    ON aer_records(initiator, settled_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_aer_executor     ON aer_records(executor, settled_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_aer_authorizer   ON aer_records(authorizer, settled_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_aer_budget       ON aer_records(budget_id, settled_at DESC) WHERE budget_id IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_aer_request_id   ON aer_records(request_id)`,
    `CREATE INDEX IF NOT EXISTS idx_aer_settled_at   ON aer_records(settled_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_aer_triggered_by ON aer_records(triggered_by) WHERE triggered_by IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_aer_model        ON aer_records(model_name, settled_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_aer_capability_version ON aer_records(capability_version, settled_at DESC) WHERE capability_version IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_aer_event_class  ON aer_records(event_class, settled_at DESC) WHERE event_class IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_aer_action_type  ON aer_records(action_type, settled_at DESC) WHERE action_type IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_aer_intent_id    ON aer_records(intent_id) WHERE intent_id IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS idx_aer_agent_profile_id ON aer_records(agent_profile_id, settled_at DESC) WHERE agent_profile_id IS NOT NULL`,
  ];
  for (const idx of indexes) {
    await sql.unsafe(idx);
  }

  await sql`
    CREATE TABLE IF NOT EXISTS aer_sync_state (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  console.log('[db] Schema initialized');
}
