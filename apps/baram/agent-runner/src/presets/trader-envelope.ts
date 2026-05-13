/**
 * Plan C §"Trader preset이 envelope + lineage + replay metadata 생성".
 *
 * Builds the four AER metadata blocks the host /execute-capability handler
 * requires (envelope, lineage, wake, replay) for the trader's per-cycle
 * cognition AER. Action-execution AERs (with on-chain `actionCall`) are
 * deferred — the prototype keeps the swap PTB agent-signed and the
 * trade digest is referenced from the NEXT cycle's cognition AER via
 * `triggered_action`. See the C2 handoff for the rationale.
 *
 * All hashes are SHA-256 byte arrays. `replay_extras` keys are emitted in
 * strict-ascending UTF-8 byte order per AER v2 codec §6.
 */

import { createHash } from 'node:crypto';

import { aer as aerSdk } from '@nasun/baram-sdk';

import type { StrategyPreset } from './strategies.js';
import type { TradeDecision, TradeRecord } from './trader.js';

// Re-export the SDK types used in the runtime contract so the rest of the
// agent-runner doesn't have to dig into the namespaced sdk path.
type EnvelopeMeta = {
  eventClass: 1 | 2;
  actionType: string;
  actionSchemaVersion: number;
  payloadCodec: 'bcs';
  payloadHash: number[];
  payloadBytes: number[];
  actionSummary: string;
  actionOutcome: 1 | 2 | 3;
};

type LineageMeta = {
  intentId: number[];
  parentIntentId: number[] | null;
  executionId: number;
};

type WakeMeta = {
  triggeredByType: 1 | 2 | 3 | 4;
  triggeredByRef: string | null;
};

type ReplayMeta = {
  modelVersion: string;
  promptTemplateHash: number[];
  marketSnapshotHash: number[] | null;
  replayExtras: Array<[string, number[]]>;
};

export type {
  EnvelopeMeta as TraderEnvelopeMeta,
  LineageMeta as TraderLineageMeta,
  WakeMeta as TraderWakeMeta,
  ReplayMeta as TraderReplayMeta,
};

// Action types we emit.
//   analysis.v1   — per-cycle cognition AER (HOLD or unactionable decisions)
//   noop.v1       — explicit no-op cognition (mirrors host defaultCognitionEnvelope)
//   trade.swap.v1 — atomic-settlement execution AER. Required for BUY/SELL
//                   because the host action-class registry only registers
//                   the DeepBook swap functions under this label; emitting
//                   analysis.v1 on an exec body trips the registry lookup
//                   in /execute-capability and aborts the cycle.
export const ACTION_TYPE_ANALYSIS = 'analysis.v1';
export const ACTION_TYPE_NOOP = 'noop.v1';
export const ACTION_TYPE_TRADE_SWAP = 'trade.swap.v1';

const ACTION_SCHEMA_VERSION = 1;

// ============================================================================
// Hash helpers
// ============================================================================

function sha256Bytes(input: string | Uint8Array): number[] {
  const h = createHash('sha256');
  if (typeof input === 'string') {
    h.update(input, 'utf-8');
  } else {
    h.update(Buffer.from(input));
  }
  return Array.from(h.digest());
}

/** SHA-256(action_type_bytes || payload_bytes) — must match the on-chain
 *  decoder so the contract's hash check passes. The SDK helper is the
 *  source of truth; we wrap it to convert to the number[] PTB shape. */
function payloadHash(actionType: string, payloadBytes: Uint8Array): number[] {
  return Array.from(aerSdk.computePayloadHash(actionType, payloadBytes));
}

// ============================================================================
// Envelope builders
// ============================================================================

export interface AnalysisV1Payload {
  /** Action chosen by the LLM (BUY / SELL / HOLD). Encoded as 1/2/3. */
  decision: 'BUY' | 'SELL' | 'HOLD';
  /** Size in quote-asset raw units (NUSDC u64). 0 for HOLD. */
  sizeQuoteRaw: bigint;
  /** Reason text (truncated to 280 bytes by encoder). */
  reason: string;
}

const ANALYSIS_V1_DECISION_TAG: Record<AnalysisV1Payload['decision'], number> = {
  BUY: 1,
  SELL: 2,
  HOLD: 3,
};

/**
 * Encode an analysis.v1 payload. The on-chain schema for analysis.v1 is
 * defined in apps/baram/docs/AER_V2_CODEC.md §7 (deferred entry — until
 * the SDK ships an `encodeAnalysisV1`, this module owns the canonical BCS
 * shape so all per-cycle AERs encode identically).
 *
 * Layout (BCS):
 *   { decision: u8, size_quote_raw: u64, reason: String }
 *
 * Adding fields requires bumping ACTION_SCHEMA_VERSION and updating the
 * decoder side. Do NOT silently extend the record.
 */
export function encodeAnalysisV1(p: AnalysisV1Payload): Uint8Array {
  // Hand-rolled BCS to avoid coupling the runner to SDK internals; matches
  // bcs.struct({ decision: u8, size_quote_raw: u64, reason: String }).
  const tag = ANALYSIS_V1_DECISION_TAG[p.decision];
  const reasonBytes = new TextEncoder().encode(p.reason.slice(0, 280));
  const reasonLen = reasonBytes.length;

  // ULEB128 length prefix for String (BCS variable-length). Reason is at most
  // 280 bytes so a single byte (<128) or two bytes (<16384) is enough; do
  // the general case anyway to keep the encoder honest.
  const ulebLen = ulebEncode(reasonLen);

  const buf = new Uint8Array(1 + 8 + ulebLen.length + reasonLen);
  let off = 0;
  buf[off++] = tag;
  // little-endian u64
  let n = p.sizeQuoteRaw;
  for (let i = 0; i < 8; i++) {
    buf[off++] = Number(n & 0xffn);
    n >>= 8n;
  }
  buf.set(ulebLen, off);
  off += ulebLen.length;
  buf.set(reasonBytes, off);
  return buf;
}

function ulebEncode(value: number): Uint8Array {
  if (value < 0) throw new Error('ULEB128: negative not supported');
  const out: number[] = [];
  let v = value;
  do {
    let byte = v & 0x7f;
    v >>>= 7;
    if (v !== 0) byte |= 0x80;
    out.push(byte);
  } while (v !== 0);
  return Uint8Array.from(out);
}

/** Build the analysis.v1 envelope for a per-cycle cognition AER. */
export function buildAnalysisEnvelope(args: {
  decision: TradeDecision;
  // 1=success (decision was actionable and either BUY/SELL placed or HOLD intentional),
  // 2=hold-noop (HOLD due to risk gate / insufficient balance / preset bias),
  // 3=failure (parse failure or downstream trade error already known)
  outcome: 1 | 2 | 3;
}): EnvelopeMeta {
  const sizeQuoteRaw = BigInt(Math.floor(args.decision.sizeNUSDC * 1_000_000));
  const payload = encodeAnalysisV1({
    decision: args.decision.action,
    sizeQuoteRaw,
    reason: args.decision.reason,
  });

  return {
    eventClass: 1,
    actionType: ACTION_TYPE_ANALYSIS,
    actionSchemaVersion: ACTION_SCHEMA_VERSION,
    payloadCodec: 'bcs',
    payloadHash: payloadHash(ACTION_TYPE_ANALYSIS, payload),
    payloadBytes: Array.from(payload),
    actionSummary: summarizeDecision(args.decision).slice(0, 280),
    actionOutcome: args.outcome,
  };
}

/**
 * Build the trade.swap.v1 envelope for an execution AER (BUY or SELL).
 * Mirrors buildAnalysisEnvelope but emits ACTION_TYPE_TRADE_SWAP so the
 * host action-class registry can find the registered DeepBook swap fn.
 * HOLD must NOT route through here — the host's exec-path validation
 * would still pass (the payload is well-formed) but the AER would be
 * miscategorised on-chain. Caller (trader-cycle) enforces the gate.
 *
 * Payload schema is intentionally identical to analysis.v1 for the v1
 * prototype: both encode the LLM's final decision plus size. The
 * action-type label is what differentiates registry routing, not the
 * payload shape (off-chain decoders pick the renderer by action_type).
 */
export function buildTradeSwapEnvelope(args: {
  decision: TradeDecision;
  outcome: 1 | 2 | 3;
}): EnvelopeMeta {
  const sizeQuoteRaw = BigInt(Math.floor(args.decision.sizeNUSDC * 1_000_000));
  const payload = encodeAnalysisV1({
    decision: args.decision.action,
    sizeQuoteRaw,
    reason: args.decision.reason,
  });

  return {
    eventClass: 2,
    actionType: ACTION_TYPE_TRADE_SWAP,
    actionSchemaVersion: ACTION_SCHEMA_VERSION,
    payloadCodec: 'bcs',
    payloadHash: payloadHash(ACTION_TYPE_TRADE_SWAP, payload),
    payloadBytes: Array.from(payload),
    actionSummary: summarizeDecision(args.decision).slice(0, 280),
    actionOutcome: args.outcome,
  };
}

function summarizeDecision(d: TradeDecision): string {
  if (d.action === 'HOLD') return `HOLD: ${d.reason}`;
  return `${d.action} ~${d.sizeNUSDC} NUSDC: ${d.reason}`;
}

// ============================================================================
// Lineage chain — UUIDv7 intent ids with parent linkage across cycles
// ============================================================================

export interface IntentChainState {
  /** Last intent id this runner emitted; becomes parent of the next one. */
  lastIntentId: number[] | null;
  /** Retry counter within the current intent — first attempt is 1. */
  executionId: number;
}

export function newIntentChainState(): IntentChainState {
  return { lastIntentId: null, executionId: 1 };
}

/**
 * Open a new intent. Returns the lineage block AND a closure to invoke after
 * the AER lands so the next call inherits this intent as parent.
 *
 * Why the two-step pattern: a parent must only be promoted once the child AER
 * actually exists on-chain. If we promote synchronously and the host call
 * fails, the next cycle would chain off a phantom parent.
 */
export function openIntent(state: IntentChainState): {
  lineage: LineageMeta;
  commit: () => void;
} {
  const intentId = Array.from(aerSdk.generateIntentId());
  return {
    lineage: {
      intentId,
      parentIntentId: state.lastIntentId,
      executionId: state.executionId,
    },
    commit: () => {
      state.lastIntentId = intentId;
      state.executionId = 1;
    },
  };
}

/**
 * Bump executionId for an in-place retry within the same intent. Use when
 * the host call returned a transient failure and we want to retry without
 * promoting the previous (failed) child to parent.
 */
export function nextRetry(state: IntentChainState): void {
  state.executionId += 1;
}

// ============================================================================
// Wake metadata
// ============================================================================

export function buildHeartbeatWake(): WakeMeta {
  return { triggeredByType: 1, triggeredByRef: null };
}

export function buildManualWake(sessionId: string | null): WakeMeta {
  return { triggeredByType: 4, triggeredByRef: sessionId };
}

// ============================================================================
// Replay metadata
// ============================================================================

export interface ReplayInputs {
  modelVersion: string;
  /** Final prompt text (system fragment + per-cycle market context). */
  promptText: string;
  /** Strategy preset used; recorded as a replay extra so a decoder can pick
   *  the right preset at re-render time. */
  strategy: StrategyPreset;
  /** Optional canonical market snapshot — JSON-serialisable. Hashed and
   *  also embedded as a replay extra so a verifier can recompute the hash. */
  marketSnapshot?: Record<string, unknown> | null;
  /** Caller-supplied additional extras (e.g. risk gate notes). Keys must
   *  not collide with `strategy_id` / `market_snapshot` / `cycle_at_ms`. */
  extras?: Array<[string, Uint8Array]>;
}

const RESERVED_REPLAY_EXTRA_KEYS = new Set([
  'strategy_id',
  'market_snapshot',
  'cycle_at_ms',
]);

export function buildReplay(inputs: ReplayInputs): ReplayMeta {
  const promptHash = sha256Bytes(inputs.promptText);

  const extras: Array<[string, number[]]> = [
    ['cycle_at_ms', encodeAscii(Date.now().toString())],
    ['strategy_id', encodeAscii(inputs.strategy.id)],
  ];

  let marketHash: number[] | null = null;
  if (inputs.marketSnapshot != null) {
    const snapshotJson = stableJsonStringify(inputs.marketSnapshot);
    marketHash = sha256Bytes(snapshotJson);
    extras.push(['market_snapshot', encodeAscii(snapshotJson)]);
  }

  if (inputs.extras) {
    for (const [k, v] of inputs.extras) {
      if (RESERVED_REPLAY_EXTRA_KEYS.has(k)) {
        throw new Error(`replay_extras key "${k}" is reserved`);
      }
      extras.push([k, Array.from(v)]);
    }
  }

  // Sort canonically (UTF-8 byte order) and reject duplicates. The SDK
  // helper enforces strict ascending — anything else is a programming bug
  // we want to surface loudly here, not at the host's PTB step.
  extras.sort((a, b) => aerSdk.compareKeysCanonical(a[0], b[0]));
  for (let i = 1; i < extras.length; i++) {
    if (extras[i][0] === extras[i - 1][0]) {
      throw new Error(`duplicate replay_extras key: ${extras[i][0]}`);
    }
  }

  return {
    modelVersion: inputs.modelVersion,
    promptTemplateHash: promptHash,
    marketSnapshotHash: marketHash,
    replayExtras: extras,
  };
}

function encodeAscii(s: string): number[] {
  return Array.from(new TextEncoder().encode(s));
}

/** Deterministic JSON: object keys in alphabetical order, no whitespace.
 *  Matches what most off-chain decoders will recompute when verifying the
 *  market_snapshot_hash. */
function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(stableJsonStringify).join(',') + ']';
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const parts = keys.map((k) => {
    const v = (value as Record<string, unknown>)[k];
    return JSON.stringify(k) + ':' + stableJsonStringify(v);
  });
  return '{' + parts.join(',') + '}';
}

// ============================================================================
// Action proposal — for the host's preflight rail
// ============================================================================

export interface ProposalInputs {
  decision: TradeDecision;
  /** Per-request inference fee in NUSDC raw (u64). Must be <= cap.maxNotional
   *  for the contract's hard rail to admit the AER. */
  paymentAmountRaw: bigint;
}

/** Cognition proposals only carry payment + class. The host short-circuits
 *  the soft-rail's exec checks for eventClass != 2. */
export function buildCognitionProposal(inputs: ProposalInputs): {
  eventClass: 1;
  actionType: string;
  paymentAmount: string;
} {
  return {
    eventClass: 1,
    actionType: ACTION_TYPE_ANALYSIS,
    // The host expects bigint-as-string in JSON to dodge the JS Number
    // precision cliff at 2^53.
    paymentAmount: inputs.paymentAmountRaw.toString(),
  };
}

// ============================================================================
// Recent-trades helper for prompt rendering
// ============================================================================

/**
 * Compact view of recent trades the trader prompt embeds. The summary is
 * already serialised inside the prompt; we keep this here so the
 * `replay.market_snapshot` block can include the same view.
 */
export function recentTradesSnapshot(records: TradeRecord[]): Array<{
  ts: number;
  action: 'BUY' | 'SELL';
  sizeQuoteRaw: string;
  digest: string;
}> {
  return records.slice(-3).map((r) => ({
    ts: r.ts,
    action: r.action,
    sizeQuoteRaw: r.sizeQuoteRaw.toString(),
    digest: r.digest,
  }));
}
