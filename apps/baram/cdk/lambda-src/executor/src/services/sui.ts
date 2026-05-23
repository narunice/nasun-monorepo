/**
 * Sui Client Service - Baram contract interaction
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { bcs } from '@mysten/sui/bcs';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { createHash } from 'crypto';
import { ComputeRequestOnChain, STATUS } from '../types';

const SUI_CLOCK_ID = '0x6';

let suiClient: SuiClient | null = null;
let executorKeypair: Ed25519Keypair | null = null;

// Contract configuration
let BARAM_PACKAGE_ID = '';
let BARAM_REGISTRY_ID = '';
let AER_PACKAGE_ID = '';
let AER_REGISTRY_ID = '';
let EXECUTOR_PACKAGE_ID = '';
let EXECUTOR_REGISTRY_ID = '';
// Executor-module ProcessedRequests shared object (distinct from baram::ProcessedRequests).
// Required for the inline record_job_completion heartbeat in AER PTBs.
let EXECUTOR_PROCESSED_REQUESTS_ID = '';

/**
 * Initialize Sui client and executor keypair
 */
export function initSui(config: {
  rpcUrl: string;
  packageId: string;
  registryId: string;
  executorPrivateKey: string;
  aerPackageId?: string;
  aerRegistryId?: string;
  executorPackageId?: string;
  executorRegistryId?: string;
  executorProcessedRequestsId?: string;
}): void {
  suiClient = new SuiClient({ url: config.rpcUrl });
  BARAM_PACKAGE_ID = config.packageId;
  BARAM_REGISTRY_ID = config.registryId;
  AER_PACKAGE_ID = config.aerPackageId || '';
  AER_REGISTRY_ID = config.aerRegistryId || '';
  EXECUTOR_PACKAGE_ID = config.executorPackageId || '';
  EXECUTOR_REGISTRY_ID = config.executorRegistryId || '';
  EXECUTOR_PROCESSED_REQUESTS_ID = config.executorProcessedRequestsId || '';

  // Private key is hex-encoded 32-byte seed
  executorKeypair = Ed25519Keypair.fromSecretKey(
    Buffer.from(config.executorPrivateKey, 'hex')
  );

  console.log(`[Sui] Initialized with executor: ${executorKeypair.getPublicKey().toSuiAddress()}`);
}

/**
 * Get Sui client (must be initialized first)
 */
function getClient(): SuiClient {
  if (!suiClient) {
    throw new Error('Sui client not initialized. Call initSui() first.');
  }
  return suiClient;
}

/**
 * Get executor keypair (must be initialized first)
 */
function getKeypair(): Ed25519Keypair {
  if (!executorKeypair) {
    throw new Error('Executor keypair not initialized. Call initSui() first.');
  }
  return executorKeypair;
}

/**
 * Get executor's Sui address
 */
export function getExecutorAddress(): string {
  return getKeypair().getPublicKey().toSuiAddress();
}

/**
 * Append executor::record_job_completion to an AER PTB so ExecutorRegistry's
 * last_active_at / completed_jobs / reputation advance whenever the Lambda
 * actually does work. Without this, the registry's freshness counters never
 * move and the frontend dormant filter (7d) silently strands the Lambda
 * outside the Auto-pick pool even while AER submission is healthy.
 *
 * No-op if EXECUTOR_PACKAGE_ID / EXECUTOR_PROCESSED_REQUESTS_ID are not
 * configured (graceful rollout — AER submission stays intact).
 *
 * Dedup safety: executor::ProcessedRequests is a separate shared object from
 * baram::ProcessedRequests, and submit_proof_with_receipt's own dedup
 * guarantees request_id is only ever processed once end-to-end, so the
 * executor-side guard cannot abort a valid PTB.
 */
function appendExecutorHeartbeat(tx: Transaction, requestId: number): void {
  if (!EXECUTOR_PACKAGE_ID || !EXECUTOR_PROCESSED_REQUESTS_ID || !EXECUTOR_REGISTRY_ID) {
    return;
  }
  tx.moveCall({
    target: `${EXECUTOR_PACKAGE_ID}::executor::record_job_completion`,
    arguments: [
      tx.object(EXECUTOR_REGISTRY_ID),
      tx.object(EXECUTOR_PROCESSED_REQUESTS_ID),
      tx.pure.u64(requestId),
      tx.object(SUI_CLOCK_ID),
    ],
  });
}

/**
 * Get request details from on-chain registry
 */
export async function getRequest(requestId: number): Promise<ComputeRequestOnChain | null> {
  const client = getClient();

  try {
    console.log(`[Sui] Getting request ${requestId} from registry ${BARAM_REGISTRY_ID}`);

    // Get the BaramRegistry shared object
    const registry = await client.getObject({
      id: BARAM_REGISTRY_ID,
      options: { showContent: true },
    });

    if (!registry.data?.content || registry.data.content.dataType !== 'moveObject') {
      console.error('[Sui] Failed to get BaramRegistry');
      return null;
    }

    const fields = registry.data.content.fields as Record<string, unknown>;
    console.log('[Sui] Registry fields keys:', Object.keys(fields));

    const requestsTable = fields.requests as { fields?: { id?: { id: string } } } | undefined;
    console.log('[Sui] Requests table structure:', JSON.stringify(requestsTable, null, 2));

    if (!requestsTable?.fields?.id?.id) {
      console.error('[Sui] Requests table not found in registry');
      return null;
    }

    const tableId = requestsTable.fields.id.id;
    console.log(`[Sui] Querying dynamic field: parentId=${tableId}, name.value=${requestId}`);

    // Retry logic: wait for on-chain state to propagate (exponential backoff + jitter)
    let dynamicField = null;
    const maxRetries = 5;
    const baseDelay = 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        dynamicField = await client.getDynamicFieldObject({
          parentId: tableId,
          name: { type: 'u64', value: requestId.toString() },
        });

        if (dynamicField.data?.content && dynamicField.data.content.dataType === 'moveObject') {
          console.log(`[Sui] Request ${requestId} found on attempt ${attempt}`);
          break;
        }
      } catch (err) {
        console.log(`[Sui] Attempt ${attempt}/${maxRetries} failed:`, err);
      }

      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
        console.log(`[Sui] Request ${requestId} not found, retrying in ${Math.round(delay)}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    if (!dynamicField?.data?.content || dynamicField.data.content.dataType !== 'moveObject') {
      console.log(`[Sui] Request ${requestId} not found after ${maxRetries} attempts`);
      return null;
    }

    const dfFields = dynamicField.data.content.fields as Record<string, unknown>;
    const valueWrapper = dfFields.value as { fields?: Record<string, unknown> } | Record<string, unknown>;
    // Handle both nested (value.fields) and flat (value) structures
    const value = ('fields' in valueWrapper && valueWrapper.fields)
      ? valueWrapper.fields
      : valueWrapper as Record<string, unknown>;

    console.log('[Sui] Request value structure:', JSON.stringify(value, null, 2));

    return {
      requestId: Number(value.request_id),
      requester: value.requester as string,
      executor: value.executor as string,
      price: Number(value.price),
      promptHash: value.prompt_hash as string,
      model: (value.model as { fields?: { name?: string } })?.fields?.name ?? '',
      createdAt: Number(value.created_at),
      timeoutAt: Number(value.timeout_at),
      status: Number(value.status),
    };
  } catch (error) {
    console.error('[Sui] Error getting request:', error);
    return null;
  }
}

/**
 * Verify request is valid for execution
 */
export async function verifyRequest(
  requestId: number,
  promptHash: string
): Promise<{ valid: boolean; error?: string; request?: ComputeRequestOnChain }> {
  const request = await getRequest(requestId);

  if (!request) {
    return { valid: false, error: 'Request not found' };
  }

  // Check executor matches
  const executorAddress = getExecutorAddress();
  if (request.executor !== executorAddress) {
    return {
      valid: false,
      error: `Executor mismatch: expected ${request.executor}, got ${executorAddress}`,
    };
  }

  // Check status is PENDING or EXECUTING
  if (request.status !== STATUS.PENDING && request.status !== STATUS.EXECUTING) {
    return {
      valid: false,
      error: `Invalid status: ${request.status} (expected PENDING or EXECUTING)`,
    };
  }

  // Check timeout not reached
  const now = Date.now();
  if (now >= request.timeoutAt) {
    return { valid: false, error: 'Request timeout reached' };
  }

  // Verify prompt hash matches (compare hex strings)
  const onChainHash = Array.isArray(request.promptHash)
    ? Buffer.from(request.promptHash).toString('hex')
    : request.promptHash;

  if (onChainHash !== promptHash) {
    return {
      valid: false,
      error: `Prompt hash mismatch: on-chain=${onChainHash}, provided=${promptHash}`,
    };
  }

  return { valid: true, request };
}

/**
 * AER report data for v2 capability-gated create_report_with_receipt_capability.
 *
 * Fields extracted from the SettlementReceipt by the Move side: request_id,
 * requester (authorizer), executor, price (payment_amount), model_name,
 * output_hash, execution_time_ms, settled_at.
 *
 * Capability + envelope fields are required because v2 routes user-facing
 * cognition/execution events through the gated entry (settlement-only events
 * are out of scope for this Lambda). See contracts-aer/sources/aer.move.
 */
export interface AERReportData {
  // Capability gate (cap.owner == receipt.requester enforced on-chain).
  capabilityId: string;
  expectedCapabilityVersion: string; // bigint serialized as decimal string
  // WHO -- Requester
  initiator: string;
  delegationPath: string[];
  // WHO -- Executor
  executorPrincipal: string | null;
  // HOW MUCH (payment_amount from receipt)
  feeDetail: string | null;
  budgetId: string | null;
  budgetRemaining: number | null;
  // WHAT (model_name, output_hash, execution_time_ms from receipt)
  modelMetadata: string | null;
  // WHY
  purpose: string | null;
  constraints: string | null;
  // HOW TRUSTWORTHY
  executorTier: number;
  executorReputation: number;
  executorStakeAmount: number;
  teeVerified: boolean;
  teeAttestationHash: number[] | null;
  // CHAIN
  triggeredBy: string | null;
  triggeredAction: string | null;
  parentIntentId: string | null; // hex-encoded 16-byte intent id, or null
  // Action envelope. Caller chooses event_class (1=cognition, 2=execution).
  eventClass: number;
  actionType: string;             // e.g. 'cognition.chat.v1'
  actionSchemaVersion: number;    // u16
  actionSummary: string;          // truncated reply, byte-capped on send
  actionOutcome: number;          // 1=success, 2=hold, 3=failure
  // Wake (1=heartbeat, 2=user_message, 3=price_alert, 4=manual, 5=coordination)
  triggeredByType: number;
  triggeredByRef: string | null;
  // Replay
  modelVersion: string;           // e.g. 'llama-3.3-70b-versatile@2025-01-08'
  /** SHA-256 of the prompt text the agent committed to. Defaults to 32 zero
   *  bytes when the caller (chat /execute, /record) doesn't track a prompt
   *  template hash. */
  promptTemplateHash?: number[];
  /** SHA-256 of the canonical market snapshot JSON. null when the caller
   *  didn't snapshot any market context (e.g. chat). */
  marketSnapshotHash?: number[] | null;
  /** Caller-supplied replay extras (e.g. strategy_id, market_snapshot,
   *  cycle_at_ms from the trader runtime). MUST NOT include capability_id --
   *  the PTB builder always injects that key. Final VecMap is sorted
   *  canonically (UTF-8 byte order) and rejected on duplicates by the
   *  contract. */
  replayExtras?: Array<[string, number[]]>;
}

// Caps mirrored from contracts-aer/sources/aer.move. Keep in sync.
const INTENT_ID_LENGTH = 16;
const HASH_LENGTH = 32;
const PAYLOAD_CODEC = 'bcs';
const MAX_ACTION_SUMMARY_BYTES = 240; // contract cap 280; leave a safety margin
const ZERO_HASH_32: number[] = Array(HASH_LENGTH).fill(0);
const MAX_REPLAY_EXTRAS_KEYS = 16;
const MAX_REPLAY_EXTRAS_KEY_LEN = 64;
const MAX_REPLAY_EXTRAS_VAL_LEN = 4096;

/**
 * Validate a hash field against the on-chain HASH_LENGTH constant. Returns the
 * input unchanged when valid so the caller can chain directly into PTB args.
 * Falls back to all-zero bytes when the value is missing -- preserves the
 * legacy behavior for code paths (chat /execute, /record) that don't track a
 * prompt template / market snapshot hash.
 */
function hashOrZero(label: string, bytes: number[] | null | undefined): number[] {
  if (bytes == null) return ZERO_HASH_32;
  if (bytes.length !== HASH_LENGTH) {
    throw new Error(`${label} must be ${HASH_LENGTH} bytes, got ${bytes.length}`);
  }
  return bytes;
}

function optionalHash(label: string, bytes: number[] | null | undefined): number[] | null {
  if (bytes == null) return null;
  if (bytes.length !== HASH_LENGTH) {
    throw new Error(`${label} must be ${HASH_LENGTH} bytes when present, got ${bytes.length}`);
  }
  return bytes;
}

/**
 * Merge `capability_id` (always-on) with caller-supplied extras, sort by
 * UTF-8 byte order (contract requires strict ascending), and validate
 * count + per-entry caps. Throws before PTB construction so the Lambda
 * surfaces a clean error instead of an opaque Move abort.
 */
function buildReplayExtrasArgs(aer: AERReportData): { keys: string[]; vals: number[][] } {
  const capIdBytes = Array.from(
    Buffer.from(aer.capabilityId.replace(/^0x/, ''), 'hex'),
  );
  const entries: Array<[string, number[]]> = [['capability_id', capIdBytes]];
  for (const [k, v] of aer.replayExtras ?? []) {
    if (k === 'capability_id') {
      throw new Error('replayExtras must not include capability_id (Lambda injects it)');
    }
    if (k.length === 0 || Buffer.byteLength(k, 'utf-8') > MAX_REPLAY_EXTRAS_KEY_LEN) {
      throw new Error(`replay_extras key "${k}" exceeds ${MAX_REPLAY_EXTRAS_KEY_LEN} bytes`);
    }
    if (v.length > MAX_REPLAY_EXTRAS_VAL_LEN) {
      throw new Error(
        `replay_extras["${k}"] value ${v.length}B exceeds ${MAX_REPLAY_EXTRAS_VAL_LEN}`,
      );
    }
    entries.push([k, v]);
  }
  if (entries.length > MAX_REPLAY_EXTRAS_KEYS) {
    throw new Error(`replay_extras count ${entries.length} exceeds ${MAX_REPLAY_EXTRAS_KEYS}`);
  }
  entries.sort((a, b) => Buffer.from(a[0], 'utf-8').compare(Buffer.from(b[0], 'utf-8')));
  for (let i = 1; i < entries.length; i++) {
    if (entries[i][0] === entries[i - 1][0]) {
      throw new Error(`duplicate replay_extras key: ${entries[i][0]}`);
    }
  }
  return { keys: entries.map((e) => e[0]), vals: entries.map((e) => e[1]) };
}

function sha256Bytes(input: Buffer | Uint8Array): Buffer {
  return createHash('sha256').update(input).digest();
}

/**
 * Compute the 16-byte intent_id from request_id. Deterministic, replayable.
 * Move enforces INTENT_ID_LENGTH=16 (not 32).
 */
function computeIntentId(requestId: number): number[] {
  const requestIdBytes = Buffer.alloc(8);
  requestIdBytes.writeBigUInt64BE(BigInt(requestId));
  return Array.from(sha256Bytes(requestIdBytes).subarray(0, INTENT_ID_LENGTH));
}

/**
 * Truncate a Move String payload so its UTF-8 byte length stays under cap.
 * Move's string::length is byte-length, so JS char-slicing is unsafe for
 * Korean/CJK responses. Iterate from the JS slice and re-encode until fit.
 */
function truncateToBytes(s: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  if (encoder.encode(s).length <= maxBytes) return s;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    const candidate = s.slice(0, mid);
    if (encoder.encode(candidate).length <= maxBytes) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return s.slice(0, lo);
}

/**
 * Submit proof + create AI Execution Report in the same PTB (atomic).
 *
 * Uses hot-potato pattern: submit_proof_with_receipt returns a SettlementReceipt
 * that MUST be consumed by create_report_with_receipt in the same PTB.
 */
export async function submitProofWithAER(
  requestId: number,
  resultHash: string,
  executionTimeMs: number,
  request: ComputeRequestOnChain,
  aer: AERReportData,
): Promise<string> {
  if (!AER_PACKAGE_ID || !AER_REGISTRY_ID) {
    throw new Error(
      'AER not configured: AER_PACKAGE_ID and AER_REGISTRY_ID environment variables are required.'
    );
  }

  // Validate hash format before PTB construction
  if (resultHash.length !== 64 || !/^[0-9a-f]+$/i.test(resultHash)) {
    throw new Error(`Invalid result hash: expected 64 hex chars, got ${resultHash.length}`);
  }

  const client = getClient();
  const keypair = getKeypair();

  console.log(`[Sui] Submitting proof + AER for request ${requestId}`);

  const tx = new Transaction();

  const resultHashBytes = Array.from(Buffer.from(resultHash, 'hex'));
  const promptHashBytes = Array.isArray(request.promptHash)
    ? request.promptHash
    : Array.from(Buffer.from(request.promptHash, 'hex'));

  // Call 1: submit_proof_with_receipt (settlement + payment → hot-potato receipt)
  const [receipt] = tx.moveCall({
    target: `${BARAM_PACKAGE_ID}::baram::submit_proof_with_receipt`,
    arguments: [
      tx.object(BARAM_REGISTRY_ID),
      tx.pure.u64(requestId),
      tx.pure.vector('u8', resultHashBytes),
      tx.pure.u64(executionTimeMs),
      tx.object(SUI_CLOCK_ID),
    ],
  });

  // Call 2: create_report_with_receipt_capability (v2 gated entry).
  //
  // Routes cognition/execution events through the capability gate. The Move
  // side extracts request_id, authorizer (=> initiator must match),
  // executor, payment_amount, model_name, output_hash, execution_time_ms,
  // settled_at from the receipt, then enforces:
  //   - event_class IN {cognition, execution} (settlement reserved for ungated)
  //   - cap.revoked == false, cap.pause_mode == active
  //   - cap.owner == receipt.requester (initiator)
  //   - cap.version == expected_capability_version (mid-flight rotation guard)
  //   - action_type ∈ cap.allowed_actions
  //   - payment_amount <= cap.risk_limits.max_notional_per_action
  const intentId = computeIntentId(requestId);
  const parentIntentBytes = aer.parentIntentId
    ? Array.from(Buffer.from(aer.parentIntentId, 'hex'))
    : null;
  if (parentIntentBytes && parentIntentBytes.length !== INTENT_ID_LENGTH) {
    throw new Error(`parentIntentId must be ${INTENT_ID_LENGTH} bytes hex`);
  }

  // payload_hash convention per aer.move §header: SHA-256(action_type || payload_bytes).
  // payload_bytes is empty for v1 chat; opaque codec MUST equal "bcs".
  const actionTypeBytes = Buffer.from(aer.actionType, 'utf-8');
  const payloadBytes: number[] = [];
  const payloadHash = Array.from(sha256Bytes(actionTypeBytes));

  const summary = truncateToBytes(aer.actionSummary, MAX_ACTION_SUMMARY_BYTES);
  const promptTemplateHashBytes = hashOrZero('promptTemplateHash', aer.promptTemplateHash);
  const marketSnapshotHashBytes = optionalHash('marketSnapshotHash', aer.marketSnapshotHash);
  const { keys: replayExtraKeys, vals: replayExtraVals } = buildReplayExtrasArgs(aer);

  tx.moveCall({
    // v3 entry — same gating semantics as v2 plus agent_profile_id attribution
    // appended at the tail of the argument list. Lambda always routes v3 so
    // ExecutionReportCreatedV3 indexer sees uniform shape; aer.agentProfileId
    // is None when the caller did not surface an AgentProfile id.
    target: `${AER_PACKAGE_ID}::aer::create_report_with_receipt_capability_v3`,
    arguments: [
      tx.object(AER_REGISTRY_ID),                                            // 1 registry (mut)
      tx.object(BARAM_REGISTRY_ID),                                          // 2 baram_registry (imm)
      receipt,                                                               // 3 SettlementReceipt (hot-potato)
      tx.object(aer.capabilityId),                                           // 4 cap (imm shared)
      tx.pure.u64(BigInt(aer.expectedCapabilityVersion)),                    // 5 expected_capability_version
      // Requester
      tx.pure.address(aer.initiator),                                        // 6 initiator
      tx.pure.vector('address', aer.delegationPath),                         // 7 delegation_path
      // Executor
      tx.pure(bcs.option(bcs.Address).serialize(aer.executorPrincipal)),     // 8 executor_principal
      // Payment
      tx.pure(bcs.option(bcs.string()).serialize(aer.feeDetail)),            // 9 fee_detail
      tx.pure(bcs.option(bcs.Address).serialize(aer.budgetId)),              // 10 budget_id
      tx.pure(bcs.option(bcs.u64()).serialize(aer.budgetRemaining != null ? BigInt(aer.budgetRemaining) : null)), // 11 budget_remaining
      // Inference
      tx.pure(bcs.option(bcs.string()).serialize(aer.modelMetadata)),        // 12 model_metadata
      tx.pure.vector('u8', promptHashBytes),                                 // 13 input_hash
      // Why
      tx.pure(bcs.option(bcs.string()).serialize(aer.purpose)),              // 14 purpose
      tx.pure(bcs.option(bcs.string()).serialize(aer.constraints)),          // 15 constraints
      // Trust
      tx.pure.u8(aer.executorTier),                                          // 16 executor_tier
      tx.pure.u64(aer.executorReputation),                                   // 17 executor_reputation
      tx.pure.u64(aer.executorStakeAmount),                                  // 18 executor_stake_amount
      tx.pure.bool(aer.teeVerified),                                         // 19 tee_verified
      tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(aer.teeAttestationHash)), // 20 tee_attestation_hash
      // When
      tx.pure.u64(request.createdAt),                                        // 21 requested_at
      // Chain
      tx.pure(bcs.option(bcs.Address).serialize(aer.triggeredBy)),           // 22 triggered_by
      tx.pure(bcs.option(bcs.Address).serialize(aer.triggeredAction)),       // 23 triggered_action
      tx.pure.vector('u8', intentId),                                        // 24 intent_id (16 bytes)
      tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(parentIntentBytes)), // 25 parent_intent_id
      tx.pure.u32(requestId),                                                // 26 execution_id
      // Envelope
      tx.pure.u8(aer.eventClass),                                            // 27 event_class
      tx.pure.string(aer.actionType),                                        // 28 action_type
      tx.pure.u16(aer.actionSchemaVersion),                                  // 29 action_schema_version
      tx.pure.string(PAYLOAD_CODEC),                                         // 30 payload_codec
      tx.pure.vector('u8', payloadHash),                                     // 31 payload_hash
      tx.pure.vector('u8', payloadBytes),                                    // 32 payload_bytes
      tx.pure.string(summary),                                               // 33 action_summary
      tx.pure.u8(aer.actionOutcome),                                         // 34 action_outcome
      // Wake
      tx.pure.u8(aer.triggeredByType),                                       // 35 triggered_by_type
      tx.pure(bcs.option(bcs.string()).serialize(aer.triggeredByRef)),       // 36 triggered_by_ref
      // Replay
      tx.pure.string(aer.modelVersion),                                      // 37 model_version
      tx.pure.vector('u8', promptTemplateHashBytes),                         // 38 prompt_template_hash
      tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(marketSnapshotHashBytes)), // 39 market_snapshot_hash
      // replay_extras: capability_id (Lambda-injected) + caller-supplied
      // extras (e.g. strategy_id, market_snapshot, cycle_at_ms from trader
      // runtime). Merged + sorted canonically by buildReplayExtrasArgs;
      // contract aborts on duplicate keys via vec_map::insert.
      tx.pure.vector('string', replayExtraKeys),                             // 40 replay_extras_keys
      tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize(replayExtraVals)),  // 41 replay_extras_vals
      // v3 attribution. AgentProfile object id (encoded as Option<ID>).
      tx.pure(bcs.option(bcs.Address).serialize(aer.agentProfileId ?? null)), // 42 agent_profile_id
    ],
  });

  appendExecutorHeartbeat(tx, requestId);

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: {
      showEffects: true,
      showEvents: true,
    },
  });

  if (result.effects?.status?.status !== 'success') {
    const error = result.effects?.status?.error || 'Unknown error';
    throw new Error(`Transaction failed: ${error}`);
  }

  console.log(`[Sui] Proof + AER submitted: ${result.digest}`);
  return result.digest;
}

/**
 * Fetch executor stats from ExecutorRegistry for compliance snapshots.
 * Returns defaults if registry is not configured or fetch fails.
 */
export async function getExecutorStats(executorAddress: string): Promise<{
  reputation: number;
  slashCount: number;
  stakeAmount: number;
  tier: number;
}> {
  const defaults = { reputation: 0, slashCount: 0, stakeAmount: 0, tier: 0 };

  if (!EXECUTOR_REGISTRY_ID) {
    console.warn('[Sui] ExecutorRegistry not configured, using defaults');
    return defaults;
  }

  const client = getClient();

  try {
    const registry = await client.getObject({
      id: EXECUTOR_REGISTRY_ID,
      options: { showContent: true },
    });

    if (!registry.data?.content || registry.data.content.dataType !== 'moveObject') {
      return defaults;
    }

    const fields = registry.data.content.fields as Record<string, unknown>;
    const executorsTable = fields.executors as { fields?: { id?: { id: string } } };
    const tableId = executorsTable?.fields?.id?.id;

    if (!tableId) return defaults;

    const fieldData = await client.getDynamicFieldObject({
      parentId: tableId,
      name: { type: 'address', value: executorAddress },
    });

    if (!fieldData.data?.content || fieldData.data.content.dataType !== 'moveObject') {
      return defaults;
    }

    const content = fieldData.data.content.fields as Record<string, unknown>;
    const valueWrapper = content.value as { fields?: Record<string, unknown> } | Record<string, unknown>;
    const value = ('fields' in valueWrapper && valueWrapper.fields)
      ? valueWrapper.fields
      : valueWrapper as Record<string, unknown>;

    const v = value as Record<string, unknown>;
    return {
      reputation: Number(v['reputation'] || 0),
      slashCount: Number(v['failed_jobs'] || 0),
      stakeAmount: 0, // StakingRegistry lookup deferred -- requires separate query
      tier: 0,        // TierRegistry lookup deferred -- requires separate query
    };
  } catch (error) {
    console.warn('[Sui] Failed to fetch executor stats:', error);
    return defaults;
  }
}

/**
 * Capability hard-rail fields needed for /infer + /execute-capability gating.
 *
 * Mirrors `baram_aer::capability::Capability` shape (owner, version) plus
 * the runtime-relevant gate booleans. Owner is normalized to lower-case 0x
 * for case-insensitive comparison against principalAddress.
 */
export interface CapabilityFields {
  owner: string;        // 0x<64 hex lower>
  version: string;      // u64 decimal
  pauseMode: number;    // 0=active, 2=wake_blocked
  revoked: boolean;
}

/**
 * Fetch live capability fields from a shared `Capability` object.
 *
 * Used by /infer + /execute-capability to enforce:
 *   - cap.owner == principalAddress      (caller is delegating from their own cap)
 *   - cap.version == expectedVersion     (no mid-flight rotation)
 *   - !cap.revoked && pauseMode == 0     (operational gates; on-chain enforces too)
 *
 * Throws on RPC failure or schema mismatch so the caller can map to a 503.
 */
export async function getCapabilityFields(capabilityId: string): Promise<CapabilityFields> {
  if (!/^0x[0-9a-fA-F]{1,64}$/.test(capabilityId)) {
    throw new Error(`Invalid capabilityId: ${capabilityId}`);
  }
  const client = getClient();
  const obj = await client.getObject({
    id: capabilityId,
    options: { showContent: true },
  });
  if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
    throw new Error(`Capability ${capabilityId} not found or non-Move object`);
  }
  const fields = obj.data.content.fields as Record<string, unknown>;
  const ownerRaw = fields.owner;
  const versionRaw = fields.version;
  const pauseRaw = fields.pause_mode;
  const revokedRaw = fields.revoked;
  if (typeof ownerRaw !== 'string' || typeof versionRaw !== 'string') {
    throw new Error('Capability fields owner/version missing or not strings');
  }
  const ownerNormalized = ownerRaw.toLowerCase().startsWith('0x')
    ? ownerRaw.toLowerCase()
    : `0x${ownerRaw.toLowerCase()}`;
  return {
    owner: ownerNormalized,
    version: versionRaw,
    pauseMode: typeof pauseRaw === 'number' ? pauseRaw : Number(pauseRaw ?? 0),
    revoked: revokedRaw === true,
  };
}

/**
 * Extended capability fields for the PR1.5 swap path. Adds `allowed_assets`,
 * `risk_limits.max_slippage_bps`, and the `initial_shared_version` of the
 * Capability shared object. Used by spec §4 steps 8–12 (asset coverage,
 * slippage cap, initialSharedVersion self-check).
 *
 * Asset type strings are normalized to the canonical `0x<addr>::module::Type`
 * form so the wire body's `spend.coinAssetType` and `actionCall.typeArguments`
 * can be compared by simple lower-case string equality. TypeName JSON shape
 * is `{ name: "addr::module::Type" }` -- Sui returns the address WITHOUT the
 * leading 0x and WITHOUT zero-padding, so we prepend `0x` and let the caller
 * normalize via `normalizeSuiAddress` for full-length comparison.
 */
export interface CapabilityFieldsFull extends CapabilityFields {
  /** Canonicalized type strings in the form `0x<addr>::module::Type`. */
  allowedAssets: string[];
  maxSlippageBps: number;
  initialSharedVersion: string;
}

function normalizeTypeName(raw: unknown): string | null {
  // TypeName JSON in Move objects: `{ name: "addr::mod::Type" }` OR
  // `{ fields: { name: "addr::mod::Type" } }`. Address is hex w/o 0x.
  if (!raw || typeof raw !== 'object') return null;
  const direct = (raw as { name?: unknown }).name;
  const nested = (raw as { fields?: { name?: unknown } }).fields?.name;
  const name = typeof direct === 'string' ? direct : typeof nested === 'string' ? nested : null;
  if (!name) return null;
  const colonIdx = name.indexOf('::');
  if (colonIdx < 0) return null;
  const addr = name.slice(0, colonIdx);
  const rest = name.slice(colonIdx);
  const addrLower = addr.toLowerCase();
  return `0x${addrLower}${rest}`;
}

export async function getCapabilityFieldsFull(capabilityId: string): Promise<CapabilityFieldsFull> {
  if (!/^0x[0-9a-fA-F]{1,64}$/.test(capabilityId)) {
    throw new Error(`Invalid capabilityId: ${capabilityId}`);
  }
  const client = getClient();
  const obj = await client.getObject({
    id: capabilityId,
    options: { showContent: true, showOwner: true },
  });
  if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
    throw new Error(`Capability ${capabilityId} not found or non-Move object`);
  }
  const fields = obj.data.content.fields as Record<string, unknown>;
  const ownerRaw = fields.owner;
  const versionRaw = fields.version;
  const pauseRaw = fields.pause_mode;
  const revokedRaw = fields.revoked;
  if (typeof ownerRaw !== 'string' || typeof versionRaw !== 'string') {
    throw new Error('Capability fields owner/version missing or not strings');
  }
  const ownerNormalized = ownerRaw.toLowerCase().startsWith('0x')
    ? ownerRaw.toLowerCase()
    : `0x${ownerRaw.toLowerCase()}`;

  // allowed_assets: vector<TypeName>. Each element is the wrapped struct shape
  // described in normalizeTypeName(). Filter nulls but treat decode failure as
  // a hard error -- better to fail closed than silently allow a type through.
  const rawAssets = fields.allowed_assets;
  if (!Array.isArray(rawAssets)) {
    throw new Error('Capability allowed_assets is not an array');
  }
  const allowedAssets: string[] = [];
  for (const entry of rawAssets) {
    const norm = normalizeTypeName(entry);
    if (!norm) {
      throw new Error('Capability allowed_assets contains unparseable TypeName entry');
    }
    allowedAssets.push(norm);
  }

  // risk_limits: struct. Shape: { fields: { max_slippage_bps, ... } } or flat.
  const rl = fields.risk_limits;
  const rlFields = rl && typeof rl === 'object'
    ? ((rl as { fields?: Record<string, unknown> }).fields ?? (rl as Record<string, unknown>))
    : null;
  const slipRaw = rlFields ? rlFields.max_slippage_bps : null;
  const maxSlippageBps = typeof slipRaw === 'number'
    ? slipRaw
    : typeof slipRaw === 'string' ? Number(slipRaw) : NaN;
  if (!Number.isFinite(maxSlippageBps)) {
    throw new Error('Capability risk_limits.max_slippage_bps missing or non-numeric');
  }

  // owner descriptor → initial_shared_version. Cap must be a shared object.
  const ownerDesc = obj.data.owner;
  const sharedRaw = ownerDesc && typeof ownerDesc === 'object' && 'Shared' in ownerDesc
    ? (ownerDesc as { Shared: { initial_shared_version: number | string } }).Shared.initial_shared_version
    : null;
  if (sharedRaw === null || sharedRaw === undefined) {
    throw new Error(`Capability ${capabilityId} is not a shared object`);
  }
  const initialSharedVersion = String(sharedRaw);

  return {
    owner: ownerNormalized,
    version: versionRaw,
    pauseMode: typeof pauseRaw === 'number' ? pauseRaw : Number(pauseRaw ?? 0),
    revoked: revokedRaw === true,
    allowedAssets,
    maxSlippageBps,
    initialSharedVersion,
  };
}

// ============================================================================
// PR1.5 -- 6-call atomic swap PTB (Cmd 0–5) + AER (Cmd 6+)
// ============================================================================

const DEEP_TYPE_DEFAULT_ENV = 'DEEP_TYPE';

interface SwapPTBInput {
  // Wire blocks (already validated by spec §4 1–12)
  actionCall: {
    targetPackage: string;
    module: string;
    fn: string;
    typeArguments: string[];      // [Base, Quote]
    args: Array<{
      kind: 'object' | 'pure' | 'pipe';
      id?: string;
      bytes?: string;
      from?: 'withdraw_coin' | 'zero_deep';
    }>;
  };
  escrow: {
    objectId: string;
    initialSharedVersion: string;
    capabilityId: string;
    capabilityInitialSharedVersion: string;
  };
  spend: {
    coinAssetType: string;        // canonicalized 0x<addr>::mod::Type
    amount: string;               // u64 decimal
  };
  expectedCapabilityVersion: string;
}

/**
 * Submit the 6-call swap PTB + AER (Cmd 6+) atomically, signed by the Lambda
 * executor keypair. Reference layout: spec §2.1.
 *
 * Cmd 0  aer::escrow::withdraw_for_action<T_in>  → (Coin<T_in>, ActionObligation)
 * Cmd 1  0x2::coin::zero<DEEP>                   → Coin<DEEP>
 * Cmd 2  <deepbookPackage>::pool::<swap_fn>      → (Coin<Base>, Coin<Quote>, Coin<DEEP>)
 * Cmd 3  0x2::coin::destroy_zero<DEEP>           (S14 whitelist invariant)
 * Cmd 4  aer::escrow::deposit_swap_leftover<T_in>
 * Cmd 5  aer::escrow::settle_action<T_out>       (consumes obligation)
 * Cmd 6+ baram::submit_proof_with_receipt + aer::create_report_with_receipt_capability
 *
 * Direction encoding follows the swap fn name:
 *   BUY  (swap_exact_quote_for_base): T_in=Quote, T_out=Base, leftover=quoteOut, primary=baseOut
 *   SELL (swap_exact_base_for_quote): T_in=Base,  T_out=Quote, leftover=baseOut, primary=quoteOut
 *
 * Any abort in the swap portion rolls back the entire PTB -- escrow untouched
 * and ActionObligation auto-aborts (no `drop`/`store` abilities).
 */
export async function submitSwapPTBWithAER(
  requestId: number,
  resultHash: string,
  executionTimeMs: number,
  request: ComputeRequestOnChain,
  aer: AERReportData,
  swap: SwapPTBInput,
  deepType: string,
): Promise<string> {
  if (!AER_PACKAGE_ID || !AER_REGISTRY_ID) {
    throw new Error('AER not configured: AER_PACKAGE_ID and AER_REGISTRY_ID required');
  }
  if (resultHash.length !== 64 || !/^[0-9a-f]+$/i.test(resultHash)) {
    throw new Error(`Invalid result hash: expected 64 hex chars, got ${resultHash.length}`);
  }
  if (!deepType) {
    throw new Error(`Missing ${DEEP_TYPE_DEFAULT_ENV} env`);
  }

  const direction = swap.actionCall.fn === 'swap_exact_quote_for_base'
    ? 'BUY'
    : swap.actionCall.fn === 'swap_exact_base_for_quote' ? 'SELL' : null;
  if (!direction) {
    throw new Error(`Unsupported swap fn: ${swap.actionCall.fn}`);
  }
  if (swap.actionCall.typeArguments.length !== 2) {
    throw new Error('actionCall.typeArguments must have exactly [Base, Quote]');
  }
  const [baseType, quoteType] = swap.actionCall.typeArguments;

  const client = getClient();
  const keypair = getKeypair();
  console.log(`[Sui] Submitting swap PTB + AER for request ${requestId} (${direction})`);

  const tx = new Transaction();

  // Shared object refs -- escrow mutable (withdraw/leftover/settle take &mut),
  // capability immutable (all swap-path entries take &Capability).
  const escrowRef = tx.sharedObjectRef({
    objectId: swap.escrow.objectId,
    initialSharedVersion: swap.escrow.initialSharedVersion,
    mutable: true,
  });
  const capArg = tx.sharedObjectRef({
    objectId: swap.escrow.capabilityId,
    initialSharedVersion: swap.escrow.capabilityInitialSharedVersion,
    mutable: false,
  });

  // Cmd 0: withdraw_for_action<T_in>(escrow, &cap, amount, expected_cap_version)
  //        → (Coin<T_in>, ActionObligation)
  const [coinIn, obligation] = tx.moveCall({
    target: `${AER_PACKAGE_ID}::escrow::withdraw_for_action`,
    typeArguments: [swap.spend.coinAssetType],
    arguments: [
      escrowRef,
      capArg,
      tx.pure.u64(BigInt(swap.spend.amount)),
      tx.pure.u64(BigInt(swap.expectedCapabilityVersion)),
    ],
  });

  // Cmd 1: 0x2::coin::zero<DEEP>() -- whitelisted-pool DEEP is always zero.
  const [zeroDeep] = tx.moveCall({
    target: '0x2::coin::zero',
    typeArguments: [deepType],
  });

  // Cmd 2: <deepbookPackage>::pool::<swap_fn>(pool, coin_in, deep_in, min_out, clock)
  //        → (Coin<Base>, Coin<Quote>, Coin<DEEP>)
  // Resolve runtime-provided args list. kind=object → tx.object/tx.sharedObjectRef
  // is left to the SDK via tx.object (pool is shared; SDK auto-resolves).
  // kind=pipe → pipe from prior commands. kind=pure → raw base64 BCS bytes.
  const swapArgs = swap.actionCall.args.map((a, idx) => {
    if (a.kind === 'object') {
      if (!a.id) throw new Error(`actionCall.args[${idx}].id missing for kind=object`);
      // Normalize so short-form ids do not resolve to a different object than
      // the allow-list match (which compares against normalizeSuiAddress).
      return tx.object(normalizeSuiAddress(a.id));
    }
    if (a.kind === 'pipe') {
      if (a.from === 'withdraw_coin') return coinIn;
      if (a.from === 'zero_deep') return zeroDeep;
      throw new Error(`actionCall.args[${idx}] unknown pipe.from=${a.from}`);
    }
    if (a.kind === 'pure') {
      if (!a.bytes) throw new Error(`actionCall.args[${idx}].bytes missing for kind=pure`);
      return tx.pure(Buffer.from(a.bytes, 'base64'));
    }
    throw new Error(`actionCall.args[${idx}] unknown kind=${(a as { kind: string }).kind}`);
  });

  const [baseOut, quoteOut, deepOut] = tx.moveCall({
    target: `${swap.actionCall.targetPackage}::${swap.actionCall.module}::${swap.actionCall.fn}`,
    typeArguments: swap.actionCall.typeArguments,
    arguments: swapArgs,
  });

  // Cmd 3: 0x2::coin::destroy_zero<DEEP>(deep_out) -- S14 invariant on
  //        whitelisted Pado pool. Aborts the PTB if DEEP ever becomes non-zero.
  tx.moveCall({
    target: '0x2::coin::destroy_zero',
    typeArguments: [deepType],
    arguments: [deepOut],
  });

  // Cmd 4: deposit_swap_leftover<T_in>(escrow, &cap, leftoverInput) -- returns
  //        the unspent input-side dust back to the agent's escrow.
  const leftoverInput = direction === 'BUY' ? quoteOut : baseOut;
  tx.moveCall({
    target: `${AER_PACKAGE_ID}::escrow::deposit_swap_leftover`,
    typeArguments: [swap.spend.coinAssetType],
    arguments: [escrowRef, capArg, leftoverInput],
  });

  // Cmd 5: settle_action<T_out>(escrow, &cap, obligation, primary) -- consumes
  //        the hot-potato obligation. Move enforces cap.allowed_assets cover
  //        T_out at this entry (E_ASSET_NOT_ALLOWED 572) as defense in depth.
  const outputType = direction === 'BUY' ? baseType : quoteType;
  const primaryOutput = direction === 'BUY' ? baseOut : quoteOut;
  tx.moveCall({
    target: `${AER_PACKAGE_ID}::escrow::settle_action`,
    typeArguments: [outputType],
    arguments: [escrowRef, capArg, obligation, primaryOutput],
  });

  // Cmd 6+: AER (submit_proof_with_receipt + create_report_with_receipt_capability).
  // Mirrors submitProofWithAER() -- same 41-arg AER call inlined here so the
  // entire swap + report is one atomic PTB. Any AER abort rolls back the swap.
  const resultHashBytes = Array.from(Buffer.from(resultHash, 'hex'));
  const promptHashBytes = Array.isArray(request.promptHash)
    ? request.promptHash
    : Array.from(Buffer.from(request.promptHash, 'hex'));

  const [receipt] = tx.moveCall({
    target: `${BARAM_PACKAGE_ID}::baram::submit_proof_with_receipt`,
    arguments: [
      tx.object(BARAM_REGISTRY_ID),
      tx.pure.u64(requestId),
      tx.pure.vector('u8', resultHashBytes),
      tx.pure.u64(executionTimeMs),
      tx.object(SUI_CLOCK_ID),
    ],
  });

  const intentId = computeIntentId(requestId);
  const parentIntentBytes = aer.parentIntentId
    ? Array.from(Buffer.from(aer.parentIntentId, 'hex'))
    : null;
  if (parentIntentBytes && parentIntentBytes.length !== INTENT_ID_LENGTH) {
    throw new Error(`parentIntentId must be ${INTENT_ID_LENGTH} bytes hex`);
  }
  const actionTypeBytes = Buffer.from(aer.actionType, 'utf-8');
  const payloadBytes: number[] = [];
  const payloadHash = Array.from(sha256Bytes(actionTypeBytes));
  const summary = truncateToBytes(aer.actionSummary, MAX_ACTION_SUMMARY_BYTES);
  const swapPromptTemplateHashBytes = hashOrZero('promptTemplateHash', aer.promptTemplateHash);
  const swapMarketSnapshotHashBytes = optionalHash('marketSnapshotHash', aer.marketSnapshotHash);
  const { keys: swapReplayExtraKeys, vals: swapReplayExtraVals } = buildReplayExtrasArgs(aer);

  tx.moveCall({
    // v3 entry — see /execute callsite above for routing rationale.
    target: `${AER_PACKAGE_ID}::aer::create_report_with_receipt_capability_v3`,
    arguments: [
      tx.object(AER_REGISTRY_ID),
      tx.object(BARAM_REGISTRY_ID),
      receipt,
      capArg,
      tx.pure.u64(BigInt(aer.expectedCapabilityVersion)),
      tx.pure.address(aer.initiator),
      tx.pure.vector('address', aer.delegationPath),
      tx.pure(bcs.option(bcs.Address).serialize(aer.executorPrincipal)),
      tx.pure(bcs.option(bcs.string()).serialize(aer.feeDetail)),
      tx.pure(bcs.option(bcs.Address).serialize(aer.budgetId)),
      tx.pure(bcs.option(bcs.u64()).serialize(aer.budgetRemaining != null ? BigInt(aer.budgetRemaining) : null)),
      tx.pure(bcs.option(bcs.string()).serialize(aer.modelMetadata)),
      tx.pure.vector('u8', promptHashBytes),
      tx.pure(bcs.option(bcs.string()).serialize(aer.purpose)),
      tx.pure(bcs.option(bcs.string()).serialize(aer.constraints)),
      tx.pure.u8(aer.executorTier),
      tx.pure.u64(aer.executorReputation),
      tx.pure.u64(aer.executorStakeAmount),
      tx.pure.bool(aer.teeVerified),
      tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(aer.teeAttestationHash)),
      tx.pure.u64(request.createdAt),
      tx.pure(bcs.option(bcs.Address).serialize(aer.triggeredBy)),
      tx.pure(bcs.option(bcs.Address).serialize(aer.triggeredAction)),
      tx.pure.vector('u8', intentId),
      tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(parentIntentBytes)),
      tx.pure.u32(requestId),
      tx.pure.u8(aer.eventClass),
      tx.pure.string(aer.actionType),
      tx.pure.u16(aer.actionSchemaVersion),
      tx.pure.string(PAYLOAD_CODEC),
      tx.pure.vector('u8', payloadHash),
      tx.pure.vector('u8', payloadBytes),
      tx.pure.string(summary),
      tx.pure.u8(aer.actionOutcome),
      tx.pure.u8(aer.triggeredByType),
      tx.pure(bcs.option(bcs.string()).serialize(aer.triggeredByRef)),
      tx.pure.string(aer.modelVersion),
      tx.pure.vector('u8', swapPromptTemplateHashBytes),
      tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(swapMarketSnapshotHashBytes)),
      tx.pure.vector('string', swapReplayExtraKeys),
      tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize(swapReplayExtraVals)),
      // v3 attribution. AgentProfile object id (encoded as Option<ID>).
      tx.pure(bcs.option(bcs.Address).serialize(aer.agentProfileId ?? null)),
    ],
  });

  appendExecutorHeartbeat(tx, requestId);

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true, showEvents: true },
  });
  if (result.effects?.status?.status !== 'success') {
    const error = result.effects?.status?.error || 'Unknown error';
    throw new Error(`Swap PTB failed: ${error}`);
  }
  console.log(`[Sui] Swap PTB + AER submitted: ${result.digest}`);
  return result.digest;
}

/**
 * Mark request as executing (optional status update)
 */
export async function markExecuting(requestId: number): Promise<string> {
  const client = getClient();
  const keypair = getKeypair();

  const tx = new Transaction();

  tx.moveCall({
    target: `${BARAM_PACKAGE_ID}::baram::mark_executing`,
    arguments: [
      tx.object(BARAM_REGISTRY_ID),
      tx.pure.u64(requestId),
      tx.object(SUI_CLOCK_ID),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });

  if (result.effects?.status?.status !== 'success') {
    const error = result.effects?.status?.error || 'Unknown error';
    throw new Error(`Mark executing failed: ${error}`);
  }

  console.log(`[Sui] Request ${requestId} marked as executing: ${result.digest}`);
  return result.digest;
}
