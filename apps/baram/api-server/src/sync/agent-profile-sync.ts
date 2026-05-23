/**
 * Agent Profile Sync Worker — polls RPC queryEvents for baram_agent::agent_profile
 * events and keeps the agent_profiles table in sync.
 *
 * Handles four event types:
 *   - AgentCreated           → INSERT (or upsert for create_with_capability path)
 *   - AgentReactivated       → set is_active = true
 *   - AgentDeactivated       → set is_active = false, stamp deactivated_at_ms
 *   - AgentCapabilityLinked  → set capability_id
 *   - AgentCapabilityUnlinked → clear capability_id
 *
 * Cursor stored in aer_sync_state ('agent_profile_sync_cursor') so restarts
 * resume from the last processed event.
 */

import { SuiClient } from '@mysten/sui/client';
import { sql } from '../db.js';

const SYNC_INTERVAL_MS = 30_000;
const MAX_BACKOFF_MS = 300_000;
const EVENTS_PER_PAGE = 50;

let consecutiveFailures = 0;

function getNextInterval(): number {
  if (consecutiveFailures === 0) return SYNC_INTERVAL_MS;
  return Math.min(SYNC_INTERVAL_MS * Math.pow(2, Math.min(consecutiveFailures, 4)), MAX_BACKOFF_MS);
}

interface EventCursor {
  txDigest: string;
  eventSeq: string;
}

// parsedJson shapes for each event type
interface AgentCreatedJson {
  profile_id: string;
  owner: string;
  agent_address: string;
  name: string;
  role: string;
}

interface AgentDeactivatedJson {
  profile_id: string;
  agent_address: string;
  owner: string;
}

interface AgentCapabilityLinkedJson {
  profile_id: string;
  agent_address: string;
  owner: string;
  capability_id: string;
}

interface AgentCapabilityUnlinkedJson {
  profile_id: string;
  agent_address: string;
  owner: string;
  previous_capability_id: string;
}

const EVENT_TYPES = {
  CREATED:             '::agent_profile::AgentCreated',
  DEACTIVATED:         '::agent_profile::AgentDeactivated',
  REACTIVATED:         '::agent_profile::AgentReactivated',
  CAPABILITY_LINKED:   '::agent_profile::AgentCapabilityLinked',
  CAPABILITY_UNLINKED: '::agent_profile::AgentCapabilityUnlinked',
};

function parseHex(v: unknown): string | null {
  if (typeof v === 'string' && /^0x[0-9a-f]{1,}$/i.test(v)) return v.toLowerCase();
  return null;
}

async function loadCursor(): Promise<EventCursor | null> {
  const rows = await sql<{ value: string }[]>`
    SELECT value FROM aer_sync_state WHERE key = 'agent_profile_sync_cursor'
  `;
  if (!rows.length) return null;
  try { return JSON.parse(rows[0].value) as EventCursor; } catch { return null; }
}

async function saveCursor(cursor: EventCursor): Promise<void> {
  await sql`
    INSERT INTO aer_sync_state (key, value, updated_at)
    VALUES ('agent_profile_sync_cursor', ${JSON.stringify(cursor)}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
}

async function handleCreated(
  json: AgentCreatedJson,
  timestampMs: string | undefined,
): Promise<void> {
  const profileId = parseHex(json.profile_id);
  const owner = parseHex(json.owner);
  const agentAddress = parseHex(json.agent_address);
  if (!profileId || !owner || !agentAddress) return;
  const createdAt = timestampMs ? BigInt(timestampMs) : BigInt(Date.now());

  await sql`
    INSERT INTO agent_profiles
      (profile_id, owner, agent_address, name, role, is_active, created_at_ms, last_event_at)
    VALUES (
      ${profileId}, ${owner}, ${agentAddress},
      ${json.name ?? ''}, ${json.role ?? ''},
      true, ${String(createdAt)}, NOW()
    )
    ON CONFLICT (profile_id) DO UPDATE SET
      owner         = EXCLUDED.owner,
      agent_address = EXCLUDED.agent_address,
      name          = EXCLUDED.name,
      role          = EXCLUDED.role,
      is_active     = true,
      last_event_at = NOW()
  `;
}

async function handleDeactivated(json: AgentDeactivatedJson, timestampMs: string | undefined): Promise<void> {
  const profileId = parseHex(json.profile_id);
  if (!profileId) return;
  const tsMs = timestampMs ? BigInt(timestampMs) : BigInt(Date.now());
  await sql`
    UPDATE agent_profiles
    SET is_active = false, deactivated_at_ms = ${String(tsMs)}, last_event_at = NOW()
    WHERE profile_id = ${profileId}
  `;
}

async function handleReactivated(json: AgentDeactivatedJson): Promise<void> {
  const profileId = parseHex(json.profile_id);
  if (!profileId) return;
  await sql`
    UPDATE agent_profiles
    SET is_active = true, deactivated_at_ms = NULL, last_event_at = NOW()
    WHERE profile_id = ${profileId}
  `;
}

async function handleCapabilityLinked(json: AgentCapabilityLinkedJson): Promise<void> {
  const profileId = parseHex(json.profile_id);
  const capId = parseHex(json.capability_id);
  if (!profileId) return;
  await sql`
    UPDATE agent_profiles
    SET capability_id = ${capId}, last_event_at = NOW()
    WHERE profile_id = ${profileId}
  `;
}

async function handleCapabilityUnlinked(json: AgentCapabilityUnlinkedJson): Promise<void> {
  const profileId = parseHex(json.profile_id);
  if (!profileId) return;
  await sql`
    UPDATE agent_profiles
    SET capability_id = NULL, last_event_at = NOW()
    WHERE profile_id = ${profileId}
  `;
}

async function syncOnce(client: SuiClient, packageId: string): Promise<void> {
  const cursor = await loadCursor();

  // Query all agent_profile module events in one pass, ordered by time.
  // We iterate all 5 event types via module-level filter — cheaper than 5
  // separate queries and gives us chronological ordering for free.
  let nextCursor: EventCursor | null = cursor;
  let hasMore = true;
  let processed = 0;

  while (hasMore) {
    const result = await client.queryEvents({
      query: { MoveModule: { package: packageId, module: 'agent_profile' } },
      cursor: nextCursor ?? undefined,
      limit: EVENTS_PER_PAGE,
      order: 'ascending',
    });

    for (const ev of result.data) {
      const type: string = ev.type ?? '';
      const json = ev.parsedJson as Record<string, unknown>;
      const tsMs = ev.timestampMs ?? undefined;

      if (type.endsWith(EVENT_TYPES.CREATED)) {
        await handleCreated(json as unknown as AgentCreatedJson, tsMs);
      } else if (type.endsWith(EVENT_TYPES.DEACTIVATED)) {
        await handleDeactivated(json as unknown as AgentDeactivatedJson, tsMs);
      } else if (type.endsWith(EVENT_TYPES.REACTIVATED)) {
        await handleReactivated(json as unknown as AgentDeactivatedJson);
      } else if (type.endsWith(EVENT_TYPES.CAPABILITY_LINKED)) {
        await handleCapabilityLinked(json as unknown as AgentCapabilityLinkedJson);
      } else if (type.endsWith(EVENT_TYPES.CAPABILITY_UNLINKED)) {
        await handleCapabilityUnlinked(json as unknown as AgentCapabilityUnlinkedJson);
      }
      processed++;
    }

    if (result.nextCursor && result.hasNextPage) {
      nextCursor = result.nextCursor as EventCursor;
    } else {
      hasMore = false;
      if (result.nextCursor) {
        nextCursor = result.nextCursor as EventCursor;
      }
    }
  }

  if (nextCursor && nextCursor !== cursor) {
    await saveCursor(nextCursor);
  }

  if (processed > 0) {
    console.log(`[agent-profile-sync] processed ${processed} events`);
  }
}

export async function startAgentProfileSync(
  client: SuiClient,
  packageId: string,
): Promise<void> {
  console.log('[agent-profile-sync] starting (30s interval)');

  const tick = async (): Promise<void> => {
    try {
      await syncOnce(client, packageId);
      consecutiveFailures = 0;
    } catch (err) {
      consecutiveFailures++;
      console.error(
        `[agent-profile-sync] error (failure #${consecutiveFailures}):`,
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      const delay = getNextInterval();
      setTimeout(tick, delay);
    }
  };

  await tick();
}
