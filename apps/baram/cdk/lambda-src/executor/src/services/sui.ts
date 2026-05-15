/**
 * Sui Client Service - Baram contract interaction
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { bcs } from '@mysten/sui/bcs';
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
let EXECUTOR_REGISTRY_ID = '';

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
  executorRegistryId?: string;
}): void {
  suiClient = new SuiClient({ url: config.rpcUrl });
  BARAM_PACKAGE_ID = config.packageId;
  BARAM_REGISTRY_ID = config.registryId;
  AER_PACKAGE_ID = config.aerPackageId || '';
  AER_REGISTRY_ID = config.aerRegistryId || '';
  EXECUTOR_REGISTRY_ID = config.executorRegistryId || '';

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
  // WHO — Requester
  initiator: string;
  delegationPath: string[];
  // WHO — Executor
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
}

// Caps mirrored from contracts-aer/sources/aer.move. Keep in sync.
const INTENT_ID_LENGTH = 16;
const HASH_LENGTH = 32;
const PAYLOAD_CODEC = 'bcs';
const MAX_ACTION_SUMMARY_BYTES = 240; // contract cap 280; leave a safety margin
const ZERO_HASH_32: number[] = Array(HASH_LENGTH).fill(0);

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

  tx.moveCall({
    target: `${AER_PACKAGE_ID}::aer::create_report_with_receipt_capability`,
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
      tx.pure.vector('u8', ZERO_HASH_32),                                    // 38 prompt_template_hash
      tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(null)),             // 39 market_snapshot_hash
      // replay_extras: capability_id raw 32 bytes. Single-key VecMap so no
      // sort needed (contract requires strict-ascending UTF-8 byte order when
      // we ever add a second key — keep this comment if extending).
      tx.pure.vector('string', ['capability_id']),                           // 40 replay_extras_keys
      tx.pure(bcs.vector(bcs.vector(bcs.u8())).serialize([
        Array.from(Buffer.from(aer.capabilityId.replace(/^0x/, ''), 'hex')),
      ])),                                                                   // 41 replay_extras_vals
    ],
  });

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
      stakeAmount: 0, // StakingRegistry lookup deferred — requires separate query
      tier: 0,        // TierRegistry lookup deferred — requires separate query
    };
  } catch (error) {
    console.warn('[Sui] Failed to fetch executor stats:', error);
    return defaults;
  }
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
