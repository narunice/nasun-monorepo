import { Hono } from 'hono';
import { sql } from '../db.js';
import { cached } from '../cache.js';

const app = new Hono();

// Allowed limit values to prevent cache fragmentation
const ALLOWED_LIMITS = [10, 25, 50, 100, 200] as const;

function parseLimit(raw: string | undefined): number {
  const n = Number(raw ?? 25);
  if (Number.isNaN(n) || n < 1) return 25;
  return ALLOWED_LIMITS.reduce((prev, curr) =>
    Math.abs(curr - n) < Math.abs(prev - n) ? curr : prev,
  );
}

// Validate Sui address format (0x + exactly 64 hex chars)
function isValidAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(addr);
}

// Validate Sui object ID format (0x + exactly 64 hex chars)
function isValidObjectId(id: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(id);
}

const MAX_MODEL_NAME_LENGTH = 100;

const MAX_CHAIN_DEPTH = 20;

/**
 * GET /api/v1/aer
 *
 * Unified list endpoint with query parameter filters.
 *   ?limit=25&cursor=<settled_at>&order=desc
 *   ?initiator=0x...
 *   ?executor=0x...
 *   ?authorizer=0x...
 *   ?budget_id=0x...
 *   ?model_name=llama3
 */
app.get('/', async (c) => {
  const limit = parseLimit(c.req.query('limit'));
  const cursor = c.req.query('cursor');
  const order = c.req.query('order') === 'asc' ? 'asc' : 'desc';

  const initiator = c.req.query('initiator');
  const executor = c.req.query('executor');
  const authorizer = c.req.query('authorizer');
  const budgetId = c.req.query('budget_id');
  const modelName = c.req.query('model_name');

  // Validate address params
  if (initiator && !isValidAddress(initiator)) {
    return c.json({ error: 'invalid_initiator_address' }, 400);
  }
  if (executor && !isValidAddress(executor)) {
    return c.json({ error: 'invalid_executor_address' }, 400);
  }
  if (authorizer && !isValidAddress(authorizer)) {
    return c.json({ error: 'invalid_authorizer_address' }, 400);
  }
  if (budgetId && !isValidObjectId(budgetId)) {
    return c.json({ error: 'invalid_budget_id' }, 400);
  }
  if (modelName && modelName.length > MAX_MODEL_NAME_LENGTH) {
    return c.json({ error: 'model_name_too_long' }, 400);
  }

  // Build cache key from all parameters
  const cacheKey = `aer-list:${initiator || ''}:${executor || ''}:${authorizer || ''}:${budgetId || ''}:${modelName || ''}:${cursor || ''}:${limit}:${order}`;

  const getData = cached(cacheKey, 15_000, async () => {
    // Build WHERE clauses dynamically
    const conditions: string[] = [];
    const values: (string | number)[] = [];
    let paramIdx = 1;

    if (initiator) {
      conditions.push(`initiator = $${paramIdx++}`);
      values.push(initiator);
    }
    if (executor) {
      conditions.push(`executor = $${paramIdx++}`);
      values.push(executor);
    }
    if (authorizer) {
      conditions.push(`authorizer = $${paramIdx++}`);
      values.push(authorizer);
    }
    if (budgetId) {
      conditions.push(`budget_id = $${paramIdx++}`);
      values.push(budgetId);
    }
    if (modelName) {
      conditions.push(`model_name = $${paramIdx++}`);
      values.push(modelName);
    }

    // Keyset pagination via settled_at
    if (cursor) {
      const cursorVal = Number(cursor);
      if (!Number.isNaN(cursorVal)) {
        if (order === 'desc') {
          conditions.push(`settled_at < $${paramIdx++}`);
        } else {
          conditions.push(`settled_at > $${paramIdx++}`);
        }
        values.push(cursorVal);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderClause = order === 'desc' ? 'ORDER BY settled_at DESC' : 'ORDER BY settled_at ASC';

    // Fetch limit + 1 to determine hasNextPage
    values.push(limit + 1);
    const limitParam = `$${paramIdx}`;

    const query = `
      SELECT * FROM aer_records
      ${whereClause}
      ${orderClause}
      LIMIT ${limitParam}
    `;

    const rows = await sql.unsafe(query, values);

    const hasNextPage = rows.length > limit;
    const data = rows.slice(0, limit).map(formatRow);
    const nextCursor =
      hasNextPage && data.length > 0 ? String(data[data.length - 1].settledAt) : null;

    return { data, hasNextPage, nextCursor };
  });

  const result = await getData();
  c.header('Cache-Control', 'public, max-age=15');
  return c.json(result);
});

/**
 * GET /api/v1/aer/request/:requestId
 *
 * Lookup AER record by on-chain request_id.
 */
app.get('/request/:requestId', async (c) => {
  const requestId = Number(c.req.param('requestId'));
  if (Number.isNaN(requestId) || requestId < 0) {
    return c.json({ error: 'invalid_request_id' }, 400);
  }

  const getData = cached(`aer-request:${requestId}`, 30_000, async () => {
    const rows = await sql`
      SELECT * FROM aer_records WHERE request_id = ${requestId} LIMIT 1
    `;
    return rows.length > 0 ? formatRow(rows[0]) : null;
  });

  const data = await getData();
  if (!data) {
    return c.json({ error: 'not_found' }, 404);
  }

  c.header('Cache-Control', 'public, max-age=30');
  return c.json({ data });
});

/**
 * GET /api/v1/aer/:objectId
 *
 * Get single AER record by on-chain object ID.
 */
app.get('/:objectId', async (c) => {
  const objectId = c.req.param('objectId');

  // Guard against matching /request/:requestId or /sync-status
  if (objectId === 'request' || objectId === 'sync-status') {
    return c.notFound();
  }

  if (!isValidObjectId(objectId)) {
    return c.json({ error: 'invalid_object_id' }, 400);
  }

  const getData = cached(`aer-object:${objectId}`, 30_000, async () => {
    const rows = await sql`
      SELECT * FROM aer_records WHERE object_id = ${objectId} LIMIT 1
    `;
    return rows.length > 0 ? formatRow(rows[0]) : null;
  });

  const data = await getData();
  if (!data) {
    return c.json({ error: 'not_found' }, 404);
  }

  c.header('Cache-Control', 'public, max-age=30');
  return c.json({ data });
});

/**
 * GET /api/v1/aer/:objectId/chain
 *
 * Traverse the decision chain (backward or forward) using recursive SQL CTE.
 *   ?direction=backward|forward (default: backward)
 *   ?maxDepth=10
 */
app.get('/:objectId/chain', async (c) => {
  const objectId = c.req.param('objectId');
  if (!isValidObjectId(objectId)) {
    return c.json({ error: 'invalid_object_id' }, 400);
  }

  const direction = c.req.query('direction') === 'forward' ? 'forward' : 'backward';
  const maxDepth = Math.min(Number(c.req.query('maxDepth') ?? 10), MAX_CHAIN_DEPTH);

  const cacheKey = `aer-chain:${objectId}:${direction}:${maxDepth}`;

  const getData = cached(cacheKey, 60_000, async () => {
    let rows;

    if (direction === 'backward') {
      // Backward: follow triggered_by links to root
      rows = await sql.unsafe(
        `
        WITH RECURSIVE chain AS (
          SELECT *, 1 AS depth FROM aer_records WHERE object_id = $1
          UNION ALL
          SELECT r.*, c.depth + 1
          FROM aer_records r
          JOIN chain c ON c.triggered_by = r.object_id
          WHERE c.depth < $2
        )
        SELECT * FROM chain ORDER BY depth DESC
        LIMIT 100
        `,
        [objectId, maxDepth],
      );
    } else {
      // Forward: find records whose triggered_by points to current
      rows = await sql.unsafe(
        `
        WITH RECURSIVE chain AS (
          SELECT *, 1 AS depth FROM aer_records WHERE object_id = $1
          UNION ALL
          SELECT r.*, c.depth + 1
          FROM aer_records r
          JOIN chain c ON r.triggered_by = c.object_id
          WHERE c.depth < $2
        )
        SELECT * FROM chain ORDER BY depth ASC
        LIMIT 100
        `,
        [objectId, maxDepth],
      );
    }

    return rows.map(formatRow);
  });

  const data = await getData();
  c.header('Cache-Control', 'public, max-age=60');
  return c.json({ data, direction, maxDepth });
});

/**
 * Format a DB row to camelCase API response.
 * Maps snake_case columns to camelCase matching AERRecord type.
 *
 * Plan C v2 surfaces (envelope, lineage, wake, replay) flow through to the
 * frontend so it does not need a separate code path for indexer-backed vs
 * RPC-backed records. strategy_id and capability_id live inside the
 * `replay_extras` JSONB blob as raw hex; we decode them here so the client
 * receives them in the same shape as the RPC fallback path
 * (utf-8 string for strategy_id, 0x-prefixed 32-byte address for
 * capability_id).
 */
function formatRow(row: Record<string, unknown>) {
  const status = Number(row.status ?? 0);
  const executorTier = Number(row.executor_tier ?? 0);
  const tierNames = ['Open', 'Bronze', 'Silver', 'Gold'];
  const statusNames: Record<number, string> = { 0: 'Settled', 1: 'Disputed', 2: 'Slashed' };

  let strategyId: string | null = null;
  let capabilityId: string | null = null;
  const replayExtras = row.replay_extras as Record<string, string> | null | undefined;
  if (replayExtras && typeof replayExtras === 'object') {
    const rawStrategy = replayExtras.strategy_id;
    if (typeof rawStrategy === 'string' && rawStrategy.length > 0) {
      try {
        const bytes = rawStrategy.match(/.{2}/g)?.map((h) => parseInt(h, 16)) ?? [];
        const decoded = Buffer.from(bytes).toString('utf8');
        strategyId = decoded.length > 0 ? decoded : null;
      } catch {
        strategyId = null;
      }
    }
    const rawCap = replayExtras.capability_id;
    // Lambda writes raw 32-byte address; only emit when shape matches so we
    // never surface a half-decoded value the client treats as a real id.
    if (typeof rawCap === 'string' && rawCap.length === 64) {
      capabilityId = `0x${rawCap}`;
    }
  }

  return {
    objectId: row.object_id,
    requestId: Number(row.request_id),
    // 1. WHO: Requester
    initiator: row.initiator,
    authorizer: row.authorizer,
    delegationPath: row.delegation_path ?? [],
    // 2. WHO: Executor
    executor: row.executor,
    executorPrincipal: row.executor_principal ?? null,
    // 3. HOW MUCH
    paymentAmount: Number(row.payment_amount),
    paymentToken: Number(row.payment_token),
    executorReceived: Number(row.executor_received),
    feeDetail: row.fee_detail ?? null,
    budgetId: row.budget_id ?? null,
    budgetRemaining: row.budget_remaining != null ? Number(row.budget_remaining) : null,
    // 4. WHAT
    modelName: row.model_name,
    modelMetadata: row.model_metadata ?? null,
    inputHash: row.input_hash,
    outputHash: row.output_hash,
    executionTimeMs: Number(row.execution_time_ms),
    // 5. WHY
    purpose: row.purpose ?? null,
    policyVersion: row.policy_version != null ? Number(row.policy_version) : null,
    capabilityVersion: row.capability_version != null ? Number(row.capability_version) : null,
    constraints: row.constraints ?? null,
    // 6. HOW TRUSTWORTHY
    executorTier,
    executorTierName: tierNames[executorTier] ?? 'Unknown',
    executorReputation: Number(row.executor_reputation),
    executorStakeAmount: Number(row.executor_stake_amount),
    teeVerified: Boolean(row.tee_verified),
    teeAttestationHash: row.tee_attestation_hash ?? null,
    // 7. WHEN
    requestedAt: Number(row.requested_at),
    settledAt: Number(row.settled_at),
    status,
    statusName: statusNames[status] ?? 'Unknown',
    // 8. CHAIN
    triggeredBy: row.triggered_by ?? null,
    triggeredAction: row.triggered_action ?? null,
    // 8b. LINEAGE
    intentId: row.intent_id ?? null,
    parentIntentId: row.parent_intent_id ?? null,
    executionId: row.execution_id != null ? Number(row.execution_id) : null,
    // 9. ENVELOPE
    eventClass: row.event_class != null ? Number(row.event_class) : null,
    actionType: row.action_type ?? null,
    actionSchemaVersion:
      row.action_schema_version != null ? Number(row.action_schema_version) : null,
    payloadCodec: row.payload_codec ?? null,
    payloadHash: row.payload_hash ?? null,
    payloadBytes: row.payload_bytes ?? null,
    actionSummary: row.action_summary ?? null,
    actionOutcome: row.action_outcome != null ? Number(row.action_outcome) : null,
    // 10. WAKE
    triggeredByType:
      row.triggered_by_type != null ? Number(row.triggered_by_type) : null,
    triggeredByRef: row.triggered_by_ref ?? null,
    // 11. REPLAY
    modelVersion: row.model_version ?? null,
    promptTemplateHash: row.prompt_template_hash ?? null,
    marketSnapshotHash: row.market_snapshot_hash ?? null,
    strategyId,
    capabilityId,
    // v3 attribution: AgentProfile object id. Sourced from the V3 event by
    // aer-sync; NULL for AERs created via legacy (pre-v3) entries.
    agentProfileId: row.agent_profile_id ?? null,
  };
}

export default app;
