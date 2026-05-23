
/**
 * AER Sync Worker — polls RPC queryEvents for new ExecutionReportCreatedV3
 * events (the v3 superset is co-emitted alongside the legacy v2 event from
 * every finalize call, so listening to v3 only loses nothing and gains the
 * agent_profile_id attribution field), fetches full AER objects, parses
 * fields, and stores in aer_records table.
 *
 * Uses event cursor as watermark (stored in aer_sync_state).
 * Avoids BCS deserialization by using RPC parsedJson.
 */

import { SuiClient } from '@mysten/sui/client';
import { sql } from '../db.js';

/**
 * Surface the underlying cause of a Node fetch / undici error chain. By
 * default `error.message` is just "fetch failed" which makes RPC blips
 * impossible to triage in pm2 logs. Walks the .cause chain to pull out the
 * concrete network code (ECONNREFUSED, ENOTFOUND, ETIMEDOUT, ECONNRESET)
 * plus errno / hostname when present. Safe to call on non-Error values.
 */
function describeFetchError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const parts: string[] = [err.message];
  type ErrWithCause = Error & {
    name?: string;
    code?: string;
    errno?: number | string;
    cause?: unknown;
  };
  let cur: unknown = (err as ErrWithCause).cause;
  let depth = 0;
  while (cur && cur instanceof Error && depth < 4) {
    const c = cur as ErrWithCause;
    const tags: string[] = [];
    if (c.code) tags.push(`code=${c.code}`);
    if (c.errno !== undefined) tags.push(`errno=${c.errno}`);
    parts.push(`cause(${c.name || 'Error'}): ${c.message}${tags.length ? ` [${tags.join(' ')}]` : ''}`);
    cur = c.cause;
    depth++;
  }
  return parts.join(' | ');
}

const SYNC_INTERVAL_MS = 30_000;
const MAX_BACKOFF_MS = 300_000; // 5 minutes
const EVENTS_PER_PAGE = 50;
const MAX_RETRY_QUEUE_SIZE = 100;

// Backoff state
let consecutiveFailures = 0;

function getNextInterval(): number {
  if (consecutiveFailures === 0) return SYNC_INTERVAL_MS;
  // 30s → 60s → 120s → 240s → 300s (cap)
  const backoff = SYNC_INTERVAL_MS * Math.pow(2, Math.min(consecutiveFailures, 4));
  return Math.min(backoff, MAX_BACKOFF_MS);
}

interface EventCursor {
  txDigest: string;
  eventSeq: string;
}

interface EventJson {
  request_id?: string | number;
  record_id?: string;
  initiator?: string;
  executor?: string;
  model_name?: string;
  payment_amount?: string | number;
  executor_tier?: number;
  tee_verified?: boolean;
  settled_at?: string | number;
  // v3 only: AgentProfile object id. Sui parsedJson represents Option<ID> as
  // either the bare hex string or { vec: [hex] } depending on RPC version;
  // parseOptionString handles both shapes.
  agent_profile_id?: unknown;
}

// Queue for records that failed to fetch (object not yet available)
const retryQueue = new Map<string, number>(); // record_id -> retry count
const MAX_RETRIES = 3;

let syncing = false;

/**
 * Read the nested-fields envelope of an Sui-encoded Move sub-struct. Sui's
 * RPC wraps nested struct fields in `{ type, fields: { ... } }`. We accept
 * either shape (with-fields-wrapper or already-unwrapped) so the parser is
 * robust against shape drift between `showContent` / `showDisplay` callers.
 * Returns null if the path doesn't exist so callers can short-circuit.
 */
function getSubStruct(
  fields: Record<string, unknown>,
  subStruct: string,
): Record<string, unknown> | null {
  const outer = fields[subStruct] as Record<string, unknown> | undefined;
  if (!outer) return null;
  const inner = (outer.fields as Record<string, unknown> | undefined) ?? outer;
  return inner;
}

function parseOptionString(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  return String(val);
}

function parseOptionNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  return Number(val);
}

function bytesToHex(val: unknown): string {
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return val.map((b: number) => b.toString(16).padStart(2, '0')).join('');
  return '';
}

/** Optional<vector<u8>> → hex | null. Sui RPC presents `Option::Some(bytes)`
 *  as the raw `number[]` value and `Option::None` as `null`. */
function parseOptionBytesHex(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  return bytesToHex(val);
}

function safeJsonParse(val: unknown): unknown {
  if (val === null || val === undefined) return null;
  const str = String(val);
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/**
 * Sui RPC presents `VecMap<K, V>` as `{ contents: [{ key, value }, ...] }`,
 * wrapped in the same `{ fields: ... }` envelope as a struct. Returns a flat
 * object suitable for JSONB storage. Keys are decoded as strings; values are
 * decoded as hex (the on-chain type is `vector<u8>`).
 */
function parseReplayExtras(val: unknown): Record<string, string> | null {
  if (val === null || val === undefined) return null;
  const wrap = val as Record<string, unknown>;
  const inner = (wrap.fields as Record<string, unknown> | undefined) ?? wrap;
  const contents = inner.contents;
  if (!Array.isArray(contents) || contents.length === 0) return null;
  const out: Record<string, string> = {};
  for (const entry of contents) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const kvWrap = (e.fields as Record<string, unknown> | undefined) ?? e;
    const key = kvWrap.key;
    const value = kvWrap.value;
    if (key === undefined || value === undefined) continue;
    out[String(key)] = bytesToHex(value);
  }
  return out;
}

interface AERRow {
  object_id: string;
  request_id: number;
  // 1. Requester
  initiator: string;
  authorizer: string;
  delegation_path: string[];
  // 2. Executor
  executor: string;
  executor_principal: string | null;
  // 3. Payment
  payment_amount: number;
  payment_token: number;
  executor_received: number;
  fee_detail: unknown;
  budget_id: string | null;
  budget_remaining: number | null;
  // 4. Inference
  model_name: string;
  model_metadata: unknown;
  input_hash: string;
  output_hash: string;
  execution_time_ms: number;
  // 5. Why
  purpose: string | null;
  policy_version: number | null;
  /** Plan B B2: snapshot of `Capability.version` at AER creation. NULL for
   *  v1 AERs and for the ungated/settlement path. */
  capability_version: number | null;
  constraints: unknown;
  // 6. Trust
  executor_tier: number;
  executor_reputation: number;
  executor_stake_amount: number;
  tee_verified: boolean;
  tee_attestation_hash: string | null;
  // 7. Time
  requested_at: number;
  settled_at: number;
  status: number;
  // 8. Chain
  triggered_by: string | null;
  triggered_action: string | null;
  // 8b. Lineage (ChainContext.lineage). Plan C: surfaced as own columns so
  // the indexer can resolve "all AERs of intent X" cheaply.
  intent_id: string | null;
  parent_intent_id: string | null;
  execution_id: number | null;
  // 9. Envelope (Plan A). Caller-supplied; one row per AER.
  event_class: number | null;
  action_type: string | null;
  action_schema_version: number | null;
  payload_codec: string | null;
  payload_hash: string | null;
  payload_bytes: string | null;
  action_summary: string | null;
  action_outcome: number | null;
  // 10. Wake
  triggered_by_type: number | null;
  triggered_by_ref: string | null;
  // 11. Replay
  model_version: string | null;
  prompt_template_hash: string | null;
  market_snapshot_hash: string | null;
  replay_extras: unknown;
  // v3 attribution (event-sourced, not present on the AIExecutionReport
  // struct). NULL for legacy v2 callers.
  agent_profile_id: string | null;
  // Sync metadata
  source_tx_digest: string | null;
}

/**
 * Parse a Move AER object into a DB row by walking the canonical nested
 * sub-struct shape that Plan A introduced. All eleven sub-structs (requester,
 * executor, payment, inference, why, trust, time, chain, envelope, wake,
 * replay) are expected; absent sub-structs surface as NULLs rather than
 * synthesised defaults so the dashboard can tell a missing field apart from
 * a deliberate `Option::None`.
 *
 * Plan B v1 AERs (pre-republish) had a flat layout. We no longer back-read
 * the flat shape: the republish drops legacy AERs from the registry, and
 * supporting both shapes makes silent-null bugs hard to spot. If a row from
 * a legacy AER ever shows up, every sub-struct will be missing and the row
 * will surface as obviously-null in the dashboard. That's the correct
 * signal: "this is not a Plan-A-shaped AER."
 */
function parseObjectToRow(
  fields: Record<string, unknown>,
  objectId: string,
  txDigest: string | null,
  agentProfileId: string | null,
): AERRow {
  const requester = getSubStruct(fields, 'requester') ?? {};
  const executor = getSubStruct(fields, 'executor') ?? {};
  const payment = getSubStruct(fields, 'payment') ?? {};
  const inference = getSubStruct(fields, 'inference') ?? {};
  const why = getSubStruct(fields, 'why') ?? {};
  const trust = getSubStruct(fields, 'trust') ?? {};
  const time = getSubStruct(fields, 'time') ?? {};
  const chain = getSubStruct(fields, 'chain') ?? {};
  const lineage = getSubStruct(chain, 'lineage') ?? {};
  const envelope = getSubStruct(fields, 'envelope') ?? {};
  const wake = getSubStruct(fields, 'wake') ?? {};
  const replay = getSubStruct(fields, 'replay') ?? {};

  const rawDelegationPath = requester.delegation_path;
  const delegationPath: string[] = Array.isArray(rawDelegationPath)
    ? rawDelegationPath.map(String)
    : [];

  return {
    object_id: objectId,
    request_id: Number(fields.request_id || 0),
    // 1. Requester
    initiator: String(requester.initiator || ''),
    authorizer: String(requester.authorizer || ''),
    delegation_path: delegationPath,
    // 2. Executor
    executor: String(executor.executor || ''),
    executor_principal: parseOptionString(executor.executor_principal),
    // 3. Payment
    payment_amount: Number(payment.payment_amount || 0),
    payment_token: Number(payment.payment_token || 0),
    executor_received: Number(payment.executor_received || 0),
    fee_detail: safeJsonParse(parseOptionString(payment.fee_detail)),
    budget_id: parseOptionString(payment.budget_id),
    budget_remaining: parseOptionNumber(payment.budget_remaining),
    // 4. Inference
    model_name: String(inference.model_name || ''),
    model_metadata: safeJsonParse(parseOptionString(inference.model_metadata)),
    input_hash: bytesToHex(inference.input_hash),
    output_hash: bytesToHex(inference.output_hash),
    execution_time_ms: Number(inference.execution_time_ms || 0),
    // 5. Why
    purpose: parseOptionString(why.purpose),
    policy_version: parseOptionNumber(why.policy_version),
    capability_version: parseOptionNumber(why.capability_version),
    constraints: safeJsonParse(parseOptionString(why.constraints)),
    // 6. Trust
    executor_tier: Math.min(Number(trust.executor_tier || 0), 3),
    executor_reputation: Number(trust.executor_reputation || 0),
    executor_stake_amount: Number(trust.executor_stake_amount || 0),
    tee_verified: Boolean(trust.tee_verified),
    tee_attestation_hash: parseOptionBytesHex(trust.tee_attestation_hash),
    // 7. Time
    requested_at: Number(time.requested_at || 0),
    settled_at: Number(time.settled_at || 0),
    status: Number(time.status || 0),
    // 8. Chain
    triggered_by: parseOptionString(chain.triggered_by),
    triggered_action: parseOptionString(chain.triggered_action),
    // 8b. Lineage (intent_id is vector<u8>; store as hex for portability)
    intent_id: lineage.intent_id !== undefined ? bytesToHex(lineage.intent_id) || null : null,
    parent_intent_id: parseOptionBytesHex(lineage.parent_intent_id),
    execution_id: lineage.execution_id !== undefined ? Number(lineage.execution_id) : null,
    // 9. Envelope
    event_class: envelope.event_class !== undefined ? Number(envelope.event_class) : null,
    action_type: envelope.action_type !== undefined ? String(envelope.action_type) : null,
    action_schema_version:
      envelope.action_schema_version !== undefined ? Number(envelope.action_schema_version) : null,
    payload_codec: envelope.payload_codec !== undefined ? String(envelope.payload_codec) : null,
    payload_hash: envelope.payload_hash !== undefined ? bytesToHex(envelope.payload_hash) || null : null,
    // Payload bytes can be large; keep as hex but the JSONB ceiling in PG is
    // ~1GB, so this is fine for prototype scale. Plan E may want a separate
    // table if we ever store large blobs.
    payload_bytes:
      envelope.payload_bytes !== undefined ? bytesToHex(envelope.payload_bytes) || null : null,
    action_summary: envelope.action_summary !== undefined ? String(envelope.action_summary) : null,
    action_outcome: envelope.action_outcome !== undefined ? Number(envelope.action_outcome) : null,
    // 10. Wake
    triggered_by_type:
      wake.triggered_by_type !== undefined ? Number(wake.triggered_by_type) : null,
    triggered_by_ref: parseOptionString(wake.triggered_by_ref),
    // 11. Replay
    model_version: replay.model_version !== undefined ? String(replay.model_version) : null,
    prompt_template_hash:
      replay.prompt_template_hash !== undefined
        ? bytesToHex(replay.prompt_template_hash) || null
        : null,
    market_snapshot_hash: parseOptionBytesHex(replay.market_snapshot_hash),
    replay_extras: parseReplayExtras(replay.replay_extras),
    agent_profile_id: agentProfileId,
    source_tx_digest: txDigest,
  };
}

async function loadCursor(): Promise<EventCursor | null> {
  const rows = await sql`
    SELECT value FROM aer_sync_state WHERE key = 'event_cursor'
  `;
  if (rows.length === 0) return null;
  try {
    return JSON.parse(rows[0].value as string) as EventCursor;
  } catch {
    return null;
  }
}

async function saveCursor(cursor: EventCursor): Promise<void> {
  await sql`
    INSERT INTO aer_sync_state (key, value, updated_at)
    VALUES ('event_cursor', ${JSON.stringify(cursor)}, NOW())
    ON CONFLICT (key) DO UPDATE
    SET value = ${JSON.stringify(cursor)}, updated_at = NOW()
  `;
}

async function insertRecords(rows: AERRow[]): Promise<number> {
  if (rows.length === 0) return 0;

  let inserted = 0;
  for (const row of rows) {
    try {
      await sql`
        INSERT INTO aer_records (
          object_id, request_id,
          initiator, authorizer, delegation_path,
          executor, executor_principal,
          payment_amount, payment_token, executor_received, fee_detail, budget_id, budget_remaining,
          model_name, model_metadata, input_hash, output_hash, execution_time_ms,
          purpose, policy_version, capability_version, constraints,
          executor_tier, executor_reputation, executor_stake_amount, tee_verified, tee_attestation_hash,
          requested_at, settled_at, status,
          triggered_by, triggered_action,
          intent_id, parent_intent_id, execution_id,
          event_class, action_type, action_schema_version, payload_codec,
          payload_hash, payload_bytes, action_summary, action_outcome,
          triggered_by_type, triggered_by_ref,
          model_version, prompt_template_hash, market_snapshot_hash, replay_extras,
          agent_profile_id,
          source_tx_digest
        ) VALUES (
          ${row.object_id}, ${row.request_id},
          ${row.initiator}, ${row.authorizer}, ${row.delegation_path},
          ${row.executor}, ${row.executor_principal},
          ${row.payment_amount}, ${row.payment_token}, ${row.executor_received},
          ${row.fee_detail ? JSON.stringify(row.fee_detail) : null}::jsonb,
          ${row.budget_id}, ${row.budget_remaining},
          ${row.model_name},
          ${row.model_metadata ? JSON.stringify(row.model_metadata) : null}::jsonb,
          ${row.input_hash}, ${row.output_hash}, ${row.execution_time_ms},
          ${row.purpose}, ${row.policy_version}, ${row.capability_version},
          ${row.constraints ? JSON.stringify(row.constraints) : null}::jsonb,
          ${row.executor_tier}, ${row.executor_reputation}, ${row.executor_stake_amount},
          ${row.tee_verified}, ${row.tee_attestation_hash},
          ${row.requested_at}, ${row.settled_at}, ${row.status},
          ${row.triggered_by}, ${row.triggered_action},
          ${row.intent_id}, ${row.parent_intent_id}, ${row.execution_id},
          ${row.event_class}, ${row.action_type}, ${row.action_schema_version}, ${row.payload_codec},
          ${row.payload_hash}, ${row.payload_bytes}, ${row.action_summary}, ${row.action_outcome},
          ${row.triggered_by_type}, ${row.triggered_by_ref},
          ${row.model_version}, ${row.prompt_template_hash}, ${row.market_snapshot_hash},
          ${row.replay_extras ? JSON.stringify(row.replay_extras) : null}::jsonb,
          ${row.agent_profile_id},
          ${row.source_tx_digest}
        )
        ON CONFLICT (object_id) DO NOTHING
      `;
      inserted++;
    } catch (err) {
      console.error(`[sync] Failed to insert record ${row.object_id}:`, err);
    }
  }
  return inserted;
}

async function syncCycle(client: SuiClient, eventType: string): Promise<void> {
  if (syncing) return;
  syncing = true;

  try {
    const cursor = await loadCursor();

    // 1. Query events from RPC
    const events = await client.queryEvents({
      query: { MoveEventType: eventType },
      limit: EVENTS_PER_PAGE,
      order: 'ascending', // Process oldest first for consistent cursor advancement
      cursor: cursor ?? undefined,
    });

    if (events.data.length === 0 && retryQueue.size === 0) {
      return;
    }

    // 2. Extract record_ids + agent_profile_id from events + add retry queue
    const recordMap = new Map<string, string | null>(); // record_id -> txDigest
    const agentProfileMap = new Map<string, string | null>(); // record_id -> agent_profile_id
    for (const event of events.data) {
      const json = event.parsedJson as EventJson;
      const recordId = json?.record_id;
      if (recordId) {
        recordMap.set(recordId, event.id.txDigest);
        agentProfileMap.set(recordId, parseOptionString(json?.agent_profile_id));
      }
    }

    // Add retry queue entries
    for (const [recordId] of retryQueue) {
      if (!recordMap.has(recordId)) {
        recordMap.set(recordId, null);
        // Retry-queue entries lost the original event; agent_profile_id stays
        // null. Acceptable because the retry path is rare (object not yet
        // visible to RPC) and the row backfills on the next legit event.
        agentProfileMap.set(recordId, null);
      }
    }

    if (recordMap.size === 0) {
      // Still update cursor if we processed events
      if (events.nextCursor) {
        await saveCursor(events.nextCursor as EventCursor);
      }
      return;
    }

    // 3. Check which records already exist
    const allIds = [...recordMap.keys()];
    const existing = await sql`
      SELECT object_id FROM aer_records WHERE object_id = ANY(${allIds})
    `;
    const existingSet = new Set(existing.map((r) => r.object_id as string));
    const newIds = allIds.filter((id) => !existingSet.has(id));

    if (newIds.length === 0) {
      // All already synced, clear retry queue entries
      for (const id of allIds) retryQueue.delete(id);
      if (events.nextCursor) {
        await saveCursor(events.nextCursor as EventCursor);
      }
      return;
    }

    // 4. Batch fetch objects via RPC
    const objects = await client.multiGetObjects({
      ids: newIds,
      options: { showContent: true },
    });

    // 5. Parse and insert
    const rows: AERRow[] = [];
    const failedIds: string[] = [];

    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      const objectId = newIds[i];

      if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
        // Object not available yet — queue for retry
        failedIds.push(objectId);
        continue;
      }

      const fields = obj.data.content.fields as Record<string, unknown>;
      rows.push(
        parseObjectToRow(
          fields,
          objectId,
          recordMap.get(objectId) ?? null,
          agentProfileMap.get(objectId) ?? null,
        ),
      );
    }

    const inserted = await insertRecords(rows);

    // 6. Manage retry queue
    for (const id of failedIds) {
      const count = (retryQueue.get(id) ?? 0) + 1;
      if (count >= MAX_RETRIES) {
        console.warn(`[sync] Giving up on record ${id} after ${MAX_RETRIES} retries`);
        retryQueue.delete(id);
      } else if (retryQueue.size < MAX_RETRY_QUEUE_SIZE) {
        retryQueue.set(id, count);
      }
    }
    // Clear successfully synced records from retry queue
    for (const row of rows) retryQueue.delete(row.object_id);

    // 7. Update cursor
    if (events.nextCursor) {
      await saveCursor(events.nextCursor as EventCursor);
    }

    if (inserted > 0 || failedIds.length > 0) {
      console.log(
        `[sync] Inserted ${inserted}, failed ${failedIds.length}, retry queue ${retryQueue.size}`,
      );
    }

    // Reset backoff on successful cycle
    if (consecutiveFailures > 0) {
      console.log(`[sync] Recovered after ${consecutiveFailures} consecutive failures`);
    }
    consecutiveFailures = 0;
  } catch (err) {
    consecutiveFailures++;
    const nextSec = Math.round(getNextInterval() / 1000);
    // Throttle logging: first 3 failures, then every 10th
    if (consecutiveFailures <= 3 || consecutiveFailures % 10 === 0) {
      console.error(
        `[sync] Sync cycle error (failure #${consecutiveFailures}, next retry in ${nextSec}s):`,
        describeFetchError(err),
      );
    }
  } finally {
    syncing = false;
  }
}

/**
 * Start the AER sync worker.
 * Runs immediately, then schedules next cycle with adaptive backoff.
 * On consecutive failures, interval grows: 30s → 60s → 120s → 240s → 300s (cap).
 * On success, resets to normal 30s interval.
 */
export function startSyncWorker(rpcUrl: string, aerPackageId: string): void {
  const client = new SuiClient({ url: rpcUrl });
  // v3 superset. Every finalize call in aer.move co-emits both the legacy v2
  // ExecutionReportCreated and ExecutionReportCreatedV3, so V3-only listening
  // captures all AERs (with agent_profile_id=null for pre-v3 entry callers).
  const eventType = `${aerPackageId}::aer::ExecutionReportCreatedV3`;

  console.log(`[sync] Starting AER sync worker (interval: ${SYNC_INTERVAL_MS / 1000}s)`);
  console.log(`[sync] Event type: ${eventType}`);

  async function scheduleNext() {
    await syncCycle(client, eventType);
    const interval = getNextInterval();
    setTimeout(scheduleNext, interval);
  }

  // Run immediately, then self-schedule
  scheduleNext();
}

/**
 * Get sync status for health endpoint.
 */
export async function getSyncStatus(): Promise<{
  totalRecords: number;
  lastSyncedAt: string | null;
  retryQueueSize: number;
}> {
  const [[countRow], cursorRows] = await Promise.all([
    sql`SELECT COUNT(*) as count FROM aer_records`,
    sql`SELECT updated_at FROM aer_sync_state WHERE key = 'event_cursor'`,
  ]);

  return {
    totalRecords: Number(countRow?.count ?? 0),
    lastSyncedAt: cursorRows.length > 0 ? String(cursorRows[0].updated_at) : null,
    retryQueueSize: retryQueue.size,
  };
}
