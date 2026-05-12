/**
 * AER Sync Worker — polls RPC queryEvents for new ExecutionReportCreated events,
 * fetches full AER objects, parses fields, and stores in aer_records table.
 *
 * Uses event cursor as watermark (stored in aer_sync_state).
 * Avoids BCS deserialization by using RPC parsedJson.
 */

import { SuiClient } from '@mysten/sui/client';
import { sql } from '../db.js';

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
}

// Queue for records that failed to fetch (object not yet available)
const retryQueue = new Map<string, number>(); // record_id -> retry count
const MAX_RETRIES = 3;

let syncing = false;

/**
 * Read `<sub-struct>.<field>` from an Sui object's parsed fields. Sui's RPC
 * wraps nested struct fields in `{ fields: { ... } }`, sometimes nested
 * twice depending on display vs content. Returns undefined if the path
 * doesn't exist so callers can fall through to a null on legacy AERs that
 * never had the sub-struct at all.
 */
function extractFromSubStruct(
  fields: Record<string, unknown>,
  subStruct: string,
  fieldName: string,
): unknown {
  const outer = fields[subStruct] as Record<string, unknown> | undefined;
  if (!outer) return undefined;
  const inner = (outer.fields as Record<string, unknown> | undefined) ?? outer;
  return inner[fieldName];
}

/** Read a value from `fields.<subStruct>.<field>` falling back to the flat
 *  `fields.<field>` path. Plan B AERs put `purpose`, `policy_version`,
 *  `constraints` inside `why`; v1 AERs put them at the top level. Until the
 *  full Plan-A indexer cutover lands in Plan C, the parser must read from
 *  both layouts so the column doesn't go silently NULL for one half. */
function readScalarFromWhyOrFlat(
  fields: Record<string, unknown>,
  fieldName: string,
): unknown {
  const nested = extractFromSubStruct(fields, 'why', fieldName);
  if (nested !== undefined) return nested;
  return fields[fieldName];
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

function safeJsonParse(val: unknown): unknown {
  if (val === null || val === undefined) return null;
  const str = String(val);
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

interface AERRow {
  object_id: string;
  request_id: number;
  initiator: string;
  authorizer: string;
  delegation_path: string[];
  executor: string;
  executor_principal: string | null;
  payment_amount: number;
  payment_token: number;
  executor_received: number;
  fee_detail: unknown;
  budget_id: string | null;
  budget_remaining: number | null;
  model_name: string;
  model_metadata: unknown;
  input_hash: string;
  output_hash: string;
  execution_time_ms: number;
  purpose: string | null;
  policy_version: number | null;
  /** Plan B B2: snapshot of `Capability.version` at AER creation. NULL for
   *  v1 AERs and for the ungated/settlement path. */
  capability_version: number | null;
  constraints: unknown;
  executor_tier: number;
  executor_reputation: number;
  executor_stake_amount: number;
  tee_verified: boolean;
  tee_attestation_hash: string | null;
  requested_at: number;
  settled_at: number;
  status: number;
  triggered_by: string | null;
  triggered_action: string | null;
  source_tx_digest: string | null;
}

/**
 * Parse Move object fields into a DB row.
 * Mirrors parseAERFields from baram-sdk.
 */
function parseObjectToRow(
  fields: Record<string, unknown>,
  objectId: string,
  txDigest: string | null,
): AERRow {
  const rawDelegationPath = fields.delegation_path;
  const delegationPath: string[] = Array.isArray(rawDelegationPath)
    ? rawDelegationPath.map(String)
    : [];

  return {
    object_id: objectId,
    request_id: Number(fields.request_id || 0),
    initiator: String(fields.initiator || ''),
    authorizer: String(fields.authorizer || ''),
    delegation_path: delegationPath,
    executor: String(fields.executor || ''),
    executor_principal: parseOptionString(fields.executor_principal),
    payment_amount: Number(fields.payment_amount || 0),
    payment_token: Number(fields.payment_token || 0),
    executor_received: Number(fields.executor_received || 0),
    fee_detail: safeJsonParse(parseOptionString(fields.fee_detail)),
    budget_id: parseOptionString(fields.budget_id),
    budget_remaining: parseOptionNumber(fields.budget_remaining),
    model_name: String(fields.model_name || ''),
    model_metadata: safeJsonParse(parseOptionString(fields.model_metadata)),
    input_hash: bytesToHex(fields.input_hash),
    output_hash: bytesToHex(fields.output_hash),
    execution_time_ms: Number(fields.execution_time_ms || 0),
    // Plan B B2: the AER schema nests these fields under `why`. v1 AERs put
    // them at the top level. readScalarFromWhyOrFlat handles both until
    // Plan C does the full sub-struct walk for every category.
    purpose: parseOptionString(readScalarFromWhyOrFlat(fields, 'purpose')),
    policy_version: parseOptionNumber(readScalarFromWhyOrFlat(fields, 'policy_version')),
    capability_version: parseOptionNumber(
      extractFromSubStruct(fields, 'why', 'capability_version'),
    ),
    constraints: safeJsonParse(
      parseOptionString(readScalarFromWhyOrFlat(fields, 'constraints')),
    ),
    executor_tier: Math.min(Number(fields.executor_tier || 0), 3),
    executor_reputation: Number(fields.executor_reputation || 0),
    executor_stake_amount: Number(fields.executor_stake_amount || 0),
    tee_verified: Boolean(fields.tee_verified),
    tee_attestation_hash: fields.tee_attestation_hash
      ? bytesToHex(fields.tee_attestation_hash)
      : null,
    requested_at: Number(fields.requested_at || 0),
    settled_at: Number(fields.settled_at || 0),
    status: Number(fields.status || 0),
    triggered_by: parseOptionString(fields.triggered_by),
    triggered_action: parseOptionString(fields.triggered_action),
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
          object_id, request_id, initiator, authorizer, delegation_path,
          executor, executor_principal,
          payment_amount, payment_token, executor_received, fee_detail, budget_id, budget_remaining,
          model_name, model_metadata, input_hash, output_hash, execution_time_ms,
          purpose, policy_version, capability_version, constraints,
          executor_tier, executor_reputation, executor_stake_amount, tee_verified, tee_attestation_hash,
          requested_at, settled_at, status,
          triggered_by, triggered_action,
          source_tx_digest
        ) VALUES (
          ${row.object_id}, ${row.request_id}, ${row.initiator}, ${row.authorizer}, ${row.delegation_path},
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

    // 2. Extract record_ids from events + add retry queue
    const recordMap = new Map<string, string | null>(); // record_id -> txDigest
    for (const event of events.data) {
      const json = event.parsedJson as EventJson;
      const recordId = json?.record_id;
      if (recordId) {
        recordMap.set(recordId, event.id.txDigest);
      }
    }

    // Add retry queue entries
    for (const [recordId] of retryQueue) {
      if (!recordMap.has(recordId)) {
        recordMap.set(recordId, null);
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
      rows.push(parseObjectToRow(fields, objectId, recordMap.get(objectId) ?? null));
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
        err instanceof Error ? err.message : err,
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
  const eventType = `${aerPackageId}::aer::ExecutionReportCreated`;

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
