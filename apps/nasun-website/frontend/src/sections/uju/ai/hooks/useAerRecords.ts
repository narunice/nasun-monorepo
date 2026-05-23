/**
 * useAerRecords - Query AIExecutionReport records via indexer API with RPC fallback.
 *
 * When VITE_AER_INDEXER_API_URL is configured, fetches from the AER API server.
 * Falls back to direct RPC getOwnedObjects when indexer is unavailable.
 */

import { useQuery } from '@tanstack/react-query';
import { suiClient } from '@/lib/sui-client';
import { AER_CONFIG, AER_STATUS_NAMES } from '../services/network';
import { parseOptionField } from '../utils/format';

export interface AERRecord {
  id: string;
  requestId: number;
  authorizer: string;
  executor: string;
  modelName: string;
  paymentAmount: number;
  executionTimeMs: number;
  status: number;
  statusName: string;
  settledAt: number;
  requestedAt: number;
  purpose: string;
  teeVerified: boolean;
  executorTier: number;
  budgetId: string;
  budgetRemaining: number;
  /**
   * On-chain `Inference.output_hash` (SHA-256 over the LLM response bytes,
   * sealed at AER creation). The ResultViewerModal compares this against
   * `sha256(data.result)` from Lambda; mismatch means the off-chain text
   * doesn't match what the AER cryptographically committed to.
   * Optional only because legacy AERs / fetch failures may leave it unset.
   */
  outputHash?: string;
  // Plan C C3-v2 envelope + lineage + wake + replay. Both indexer + RPC paths
  // surface these (the indexer API was extended in the 2026-05-20 follow-up).
  // Legacy v1 rows still leave them undefined; the UI falls back to legacy
  // shape (purpose-as-summary, status-as-outcome) in that case.
  eventClass?: number; // 1=cognition, 2=execution, 3=settlement
  actionType?: string;
  actionSchemaVersion?: number;
  payloadCodec?: string;
  payloadHash?: string;
  payloadBytes?: string;
  actionSummary?: string;
  actionOutcome?: number; // 1=success, 2=hold/noop, 3=failure
  intentId?: string;
  parentIntentId?: string | null;
  executionId?: number;
  triggeredByType?: number; // 1=heartbeat, 4=manual session, ...
  triggeredByRef?: string | null;
  modelVersion?: string;
  promptTemplateHash?: string;
  marketSnapshotHash?: string | null;
  strategyId?: string | null;
  /**
   * Capability object id this AER was gated by. Lambda writes it into
   * `replay.replay_extras['capability_id']` as raw 32-byte address so the
   * frontend can scope an agent's Activity tab to its own capability.
   * Optional: indexer API doesn't surface it yet, and legacy records (and
   * agent-runner heartbeat AERs without a chat capability) leave it unset.
   */
  capabilityId?: string | null;
  /**
   * v3 attribution: AgentProfile object id sourced from
   * `ExecutionReportCreatedV3.agent_profile_id`. Populated for AERs created
   * via the *_v3 entries (Lambda always routes v3 since 2026-05-23). Null
   * for AERs created via legacy entries (before the v3 cutover).
   */
  agentProfileId?: string | null;
}

interface IndexerApiResponse {
  data: Array<{
    objectId: string;
    requestId: number;
    authorizer: string;
    executor: string;
    modelName: string;
    paymentAmount: number;
    executionTimeMs: number;
    status: number;
    statusName: string;
    settledAt: number;
    requestedAt: number;
    purpose: string | null;
    teeVerified: boolean;
    executorTier: number;
    budgetId: string | null;
    budgetRemaining: number | null;
    // On-chain hash committed to LLM response bytes.
    outputHash?: string | null;
    // Plan C v2 envelope + lineage + wake + replay (added to formatRow on
    // 2026-05-20). Legacy v1 rows surface as null for all of these.
    intentId?: string | null;
    parentIntentId?: string | null;
    executionId?: number | null;
    eventClass?: number | null;
    actionType?: string | null;
    actionSchemaVersion?: number | null;
    payloadCodec?: string | null;
    payloadHash?: string | null;
    payloadBytes?: string | null;
    actionSummary?: string | null;
    actionOutcome?: number | null;
    triggeredByType?: number | null;
    triggeredByRef?: string | null;
    modelVersion?: string | null;
    promptTemplateHash?: string | null;
    marketSnapshotHash?: string | null;
    strategyId?: string | null;
    capabilityId?: string | null;
    agentProfileId?: string | null;
  }>;
  hasNextPage: boolean;
  nextCursor: string | null;
}

function mapIndexerRecord(row: IndexerApiResponse['data'][number]): AERRecord {
  // Coerce server-side nulls back to `undefined` so a record loaded via the
  // indexer is shape-identical to one parsed from RPC (which leaves
  // unparseable nested fields as undefined). Two exceptions:
  // - parentIntentId, marketSnapshotHash: kept `| null` in AERRecord because
  //   the RPC path also distinguishes "explicit None" from "missing".
  // - capabilityId, strategyId: same — explicit `| null` is part of the type.
  const u = <T>(v: T | null | undefined): T | undefined =>
    v == null ? undefined : v;
  return {
    id: row.objectId,
    requestId: row.requestId,
    authorizer: row.authorizer,
    executor: row.executor,
    modelName: row.modelName,
    paymentAmount: row.paymentAmount,
    executionTimeMs: row.executionTimeMs,
    status: row.status,
    statusName: row.statusName,
    settledAt: row.settledAt,
    requestedAt: row.requestedAt,
    purpose: row.purpose ?? '',
    teeVerified: row.teeVerified,
    executorTier: row.executorTier,
    budgetId: row.budgetId ?? '',
    budgetRemaining: row.budgetRemaining ?? 0,
    outputHash: u(row.outputHash),
    eventClass: u(row.eventClass),
    actionType: u(row.actionType),
    actionSchemaVersion: u(row.actionSchemaVersion),
    payloadCodec: u(row.payloadCodec),
    payloadHash: u(row.payloadHash),
    payloadBytes: u(row.payloadBytes),
    actionSummary: u(row.actionSummary),
    actionOutcome: u(row.actionOutcome),
    intentId: u(row.intentId),
    parentIntentId: row.parentIntentId ?? null,
    executionId: u(row.executionId),
    triggeredByType: u(row.triggeredByType),
    triggeredByRef: row.triggeredByRef ?? null,
    modelVersion: u(row.modelVersion),
    promptTemplateHash: u(row.promptTemplateHash),
    marketSnapshotHash: row.marketSnapshotHash ?? null,
    strategyId: row.strategyId ?? null,
    capabilityId: row.capabilityId ?? null,
    agentProfileId: row.agentProfileId ?? null,
  };
}

async function fetchFromIndexer(ownerAddress: string): Promise<AERRecord[]> {
  const baseUrl = AER_CONFIG.indexerApiUrl;
  const url = `${baseUrl}/api/v1/aer?authorizer=${encodeURIComponent(ownerAddress)}&limit=200&order=desc`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Indexer API error: ${res.status}`);
  const json: IndexerApiResponse = await res.json();
  return json.data.map(mapIndexerRecord);
}

// Navigate `chain.fields.lineage.fields.intent_id`-style nesting Sui RPC
// returns for nested move structs.
function nested(obj: unknown, ...path: string[]): unknown {
  let cur: unknown = obj;
  for (const seg of path) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function bytesToHex(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'string') return v.startsWith('0x') ? v.slice(2) : v;
  if (Array.isArray(v)) return v.map((b) => Number(b).toString(16).padStart(2, '0')).join('');
  return undefined;
}

function parseAERRecord(fields: Record<string, unknown>): AERRecord | null {
  try {
    // v2 AER nests the 8 categorical scalars under sub-structs
    // (RequesterContext, ExecutorContext, PaymentContext, InferenceContext,
    // WhyContext, TrustContext, TimeContext). Each lookup falls back to the
    // flat key so a v1 record (if any survive) still parses.
    const pick = <T = unknown>(
      group: string | undefined,
      key: string,
    ): T | undefined => {
      if (group) {
        const sub = (nested(fields, group, 'fields') ?? fields[group]) as
          | Record<string, unknown>
          | undefined;
        if (sub && key in sub) return sub[key] as T;
      }
      return fields[key] as T | undefined;
    };

    const base: AERRecord = {
      id: (fields.id as Record<string, string>)?.id ?? '',
      requestId: Number(fields.request_id ?? 0),
      authorizer: String(pick('requester', 'authorizer') ?? ''),
      executor: String(pick('executor', 'executor') ?? ''),
      modelName: String(pick('inference', 'model_name') ?? ''),
      paymentAmount: Number(pick('payment', 'payment_amount') ?? 0),
      executionTimeMs: Number(pick('inference', 'execution_time_ms') ?? 0),
      // On-chain SHA-256 over LLM response bytes. The viewer modal uses this
      // to verify the off-chain text body from Lambda hasn't been tampered.
      outputHash: bytesToHex(pick('inference', 'output_hash')),
      status: Number(pick('time', 'status') ?? 0),
      statusName: AER_STATUS_NAMES[Number(pick('time', 'status') ?? 0)] ?? 'Unknown',
      settledAt: Number(pick('time', 'settled_at') ?? 0),
      requestedAt: Number(pick('time', 'requested_at') ?? 0),
      purpose: parseOptionField<string>(pick('why', 'purpose')) ?? '',
      teeVerified: Boolean(pick('trust', 'tee_verified') ?? false),
      executorTier: Number(pick('trust', 'executor_tier') ?? 0),
      budgetId: parseOptionField<string>(pick('payment', 'budget_id')) ?? '',
      budgetRemaining: Number(
        parseOptionField<string>(pick('payment', 'budget_remaining')) ?? 0,
      ),
    };

    // Plan C C3-v2 nested fields (chain.lineage, envelope, wake, replay).
    // Sui RPC returns nested struct fields under `<name>.fields`. We tolerate
    // either shape (with or without fields wrapper) in case the indexer or
    // a future RPC version flattens them.
    const chain = (nested(fields, 'chain', 'fields') ?? fields.chain) as
      | Record<string, unknown>
      | undefined;
    const lineage = chain
      ? ((nested(chain, 'lineage', 'fields') ?? chain.lineage) as Record<string, unknown> | undefined)
      : undefined;
    const envelope = (nested(fields, 'envelope', 'fields') ?? fields.envelope) as
      | Record<string, unknown>
      | undefined;
    const wake = (nested(fields, 'wake', 'fields') ?? fields.wake) as
      | Record<string, unknown>
      | undefined;
    const replay = (nested(fields, 'replay', 'fields') ?? fields.replay) as
      | Record<string, unknown>
      | undefined;

    if (envelope) {
      base.eventClass = Number(envelope.event_class ?? 0);
      base.actionType = String(envelope.action_type ?? '');
      base.actionSchemaVersion = Number(envelope.action_schema_version ?? 0);
      base.payloadCodec = String(envelope.payload_codec ?? '');
      base.payloadHash = bytesToHex(envelope.payload_hash);
      base.payloadBytes = bytesToHex(envelope.payload_bytes);
      base.actionSummary = String(envelope.action_summary ?? '');
      base.actionOutcome = Number(envelope.action_outcome ?? 0);
    }
    if (lineage) {
      base.intentId = bytesToHex(lineage.intent_id);
      base.parentIntentId = bytesToHex(parseOptionField(lineage.parent_intent_id)) ?? null;
      base.executionId = Number(lineage.execution_id ?? 0);
    }
    if (wake) {
      base.triggeredByType = Number(wake.triggered_by_type ?? 0);
      base.triggeredByRef = parseOptionField<string>(wake.triggered_by_ref) ?? null;
    }
    if (replay) {
      base.modelVersion = String(replay.model_version ?? '');
      base.promptTemplateHash = bytesToHex(replay.prompt_template_hash);
      base.marketSnapshotHash =
        bytesToHex(parseOptionField(replay.market_snapshot_hash)) ?? null;
      // strategy_id lives in `replay_extras: VecMap<String, vector<u8>>`.
      // VecMap RPC shape: { contents: [ { fields: { key, value } }, ... ] }
      const extras = nested(replay, 'replay_extras', 'fields', 'contents') as
        | unknown[]
        | undefined;
      if (Array.isArray(extras)) {
        for (const entry of extras) {
          const f = (entry as Record<string, unknown>)?.fields as
            | Record<string, unknown>
            | undefined;
          if (f && f.key === 'strategy_id') {
            const valBytes = bytesToHex(f.value);
            if (valBytes) {
              try {
                const u8 = new Uint8Array(
                  valBytes.match(/.{2}/g)?.map((h) => parseInt(h, 16)) ?? [],
                );
                base.strategyId = new TextDecoder('utf-8').decode(u8);
              } catch {
                base.strategyId = null;
              }
            }
          } else if (f && f.key === 'capability_id') {
            // Lambda stores raw 32-byte address. Hex-encode with 0x prefix
            // so it compares directly against AgentProfile.capabilityId.
            const valBytes = bytesToHex(f.value);
            if (valBytes && valBytes.length === 64) {
              base.capabilityId = `0x${valBytes}`;
            }
          }
        }
      }
    }

    return base;
  } catch {
    return null;
  }
}

async function fetchFromRpc(ownerAddress: string): Promise<AERRecord[]> {
  const aerType = `${AER_CONFIG.typeOrigin}::aer::AIExecutionReport`;
  const records: AERRecord[] = [];
  let cursor: string | null | undefined = undefined;

  do {
    const result = await suiClient.getOwnedObjects({
      owner: ownerAddress,
      filter: { StructType: aerType },
      options: { showContent: true },
      cursor,
    });
    for (const item of result.data) {
      if (item.data?.content?.dataType === 'moveObject') {
        const parsed = parseAERRecord(item.data.content.fields as Record<string, unknown>);
        if (parsed) records.push(parsed);
      }
    }
    cursor = result.hasNextPage ? result.nextCursor : null;
  } while (cursor);

  records.sort((a, b) => b.settledAt - a.settledAt);
  return records;
}

async function fetchAERRecords(ownerAddress: string): Promise<AERRecord[]> {
  if (AER_CONFIG.indexerApiUrl) {
    try {
      return await fetchFromIndexer(ownerAddress);
    } catch {
      // fall through to RPC
    }
  }
  return fetchFromRpc(ownerAddress);
}

export function useAerRecords(ownerAddress: string | null) {
  return useQuery({
    queryKey: ['nasun-ai', 'aerRecords', ownerAddress],
    queryFn: () => fetchAERRecords(ownerAddress!),
    enabled: !!ownerAddress,
    refetchInterval: AER_CONFIG.indexerApiUrl ? 30000 : 15000,
    staleTime: AER_CONFIG.indexerApiUrl ? 20000 : 10000,
  });
}
