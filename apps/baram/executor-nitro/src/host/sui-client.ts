/**
 * Sui Client for Nitro Host — Settlement + AER (capability-gated).
 *
 * Plan C removed the legacy `submitProofWithAER` / `submitProofWithAERRetry`
 * helpers because the underlying `aer::create_report_with_receipt` entry now
 * only accepts settlement-class events. All cognition/execution AERs flow
 * through `submitProofWithAERCapability`. Settlement-class AERs (executor
 * fee, gas refund) still exist on-chain but are emitted by Move-internal
 * paths, not by the host directly.
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { bcs } from '@mysten/sui/bcs';
import { createHash } from 'crypto';

import type { CapabilityRef } from './capability.js';

// On-chain request structure (mirrors baram.move ComputeRequest)
export interface ComputeRequestOnChain {
  requestId: number;
  requester: string;
  executor: string;
  price: number;
  promptHash: string; // hex
  model: string;
  createdAt: number;
  timeoutAt: number;
  status: number;
}

export interface AERReportData {
  // WHO — Requester (initiator derived from request)
  delegationPath: string[];
  // WHO — Executor
  executorPrincipal: string | null;
  // HOW MUCH (payment_amount, executor_received, payment_token from receipt)
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
}

export interface SuiConfig {
  rpcUrl: string;
  packageId: string;
  registryId: string;
  executorPrivateKey: string;
  aerPackageId: string;
  aerRegistryId: string;
  executorRegistryId: string;
  attestationRegistryId: string;
  stakingRegistryId: string;
  tierRegistryId: string;
  executorPackageId: string;         // baram_executor package ID
  processedRequestsId: string;       // ProcessedRequests shared object ID
  executorStakeId: string;           // ExecutorStake owned object ID (for tier refresh)
  /** Plan B: shared `CapabilityRegistry` object id. Currently used only for
   *  bookkeeping/source-of-events; not referenced in the gated PTB itself. */
  capabilityRegistryId?: string;
}

let client: SuiClient | null = null;
let keypair: Ed25519Keypair | null = null;
let config: SuiConfig | null = null;

export function initSuiClient(cfg: SuiConfig): void {
  client = new SuiClient({ url: cfg.rpcUrl });
  const raw = cfg.executorPrivateKey;
  keypair = Ed25519Keypair.fromSecretKey(
    raw.startsWith('suiprivkey1')
      ? raw
      : /^(0x)?[0-9a-fA-F]{64}$/.test(raw)
        ? Buffer.from(raw.replace(/^0x/, ''), 'hex')
        : Buffer.from(raw, 'base64'),
  );
  // Clear raw private key from config — keypair holds the derived key internally
  config = { ...cfg, executorPrivateKey: '' };
  console.log(`[Sui] Initialized with executor: ${keypair.getPublicKey().toSuiAddress()}`);
}

function getClient(): SuiClient {
  if (!client) throw new Error('Sui client not initialized');
  return client;
}

function getKeypair(): Ed25519Keypair {
  if (!keypair) throw new Error('Sui keypair not initialized');
  return keypair;
}

function getConfig(): SuiConfig {
  if (!config) throw new Error('Sui config not initialized');
  return config;
}

export function getExecutorAddress(): string {
  return getKeypair().getPublicKey().toSuiAddress();
}

/**
 * Verify that EXECUTOR_PRIVATE_KEY derives to an address registered
 * in the on-chain ExecutorRegistry. Prevents silent settlement failures
 * caused by key mismatch (E_NOT_EXECUTOR).
 */
export async function verifyExecutorRegistration(): Promise<void> {
  const sui = getClient();
  const cfg = getConfig();
  const executorAddress = getExecutorAddress();

  if (!cfg.executorRegistryId) {
    console.warn('[Sui] EXECUTOR_REGISTRY_ID not set, skipping registration check');
    return;
  }

  const registry = await sui.getObject({
    id: cfg.executorRegistryId,
    options: { showContent: true },
  });

  if (!registry.data?.content || registry.data.content.dataType !== 'moveObject') {
    console.warn('[Sui] Could not read ExecutorRegistry, skipping registration check');
    return;
  }

  const fields = registry.data.content.fields as Record<string, unknown>;
  const executorsTable = fields['executors'] as { fields?: { id?: { id: string } } };
  const tableId = executorsTable?.fields?.id?.id;
  if (!tableId) {
    console.warn('[Sui] ExecutorRegistry has no executors table');
    return;
  }

  try {
    const fieldData = await sui.getDynamicFieldObject({
      parentId: tableId,
      name: { type: 'address', value: executorAddress },
    });

    if (!fieldData.data?.content) {
      throw new Error(
        `Executor address ${executorAddress} is NOT registered in ExecutorRegistry ${cfg.executorRegistryId}. ` +
        `Settlement will fail with E_NOT_EXECUTOR. ` +
        `Check EXECUTOR_PRIVATE_KEY in .env — it must derive to the on-chain executor operator address.`
      );
    }

    console.log(`[Sui] Executor registration verified: ${executorAddress}`);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('NOT registered')) {
      throw err;
    }
    console.warn('[Sui] Could not verify executor registration:', err instanceof Error ? err.message : err);
  }
}

/**
 * Fetch request from BaramRegistry by request_id
 */
export async function getRequest(requestId: number): Promise<ComputeRequestOnChain | null> {
  const sui = getClient();
  const cfg = getConfig();

  try {
    const registry = await sui.getObject({
      id: cfg.registryId,
      options: { showContent: true },
    });

    if (!registry.data?.content || registry.data.content.dataType !== 'moveObject') {
      return null;
    }

    const fields = registry.data.content.fields as Record<string, unknown>;
    const requestsTable = fields['requests'] as { fields?: { id?: { id: string } } };
    const tableId = requestsTable?.fields?.id?.id;
    if (!tableId) return null;

    // Retry: on-chain state may not have propagated yet
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const dynamicField = await sui.getDynamicFieldObject({
          parentId: tableId,
          name: { type: 'u64', value: requestId.toString() },
        });

        if (dynamicField.data?.content && dynamicField.data.content.dataType === 'moveObject') {
          const dfFields = dynamicField.data.content.fields as Record<string, unknown>;
          const valueWrapper = dfFields['value'] as { fields?: Record<string, unknown> } | Record<string, unknown>;
          const v = ('fields' in valueWrapper && valueWrapper.fields)
            ? valueWrapper.fields as Record<string, unknown>
            : valueWrapper as Record<string, unknown>;

          return {
            requestId: Number(v['request_id']),
            requester: v['requester'] as string,
            executor: v['executor'] as string,
            price: Number(v['price']),
            promptHash: v['prompt_hash'] as string,
            model: (v['model'] as { fields?: { name?: string } })?.fields?.name ?? '',
            createdAt: Number(v['created_at']),
            timeoutAt: Number(v['timeout_at']),
            status: Number(v['status']),
          };
        }
      } catch {
        // Retry
      }

      if (attempt < 5) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    return null;
  } catch (error) {
    console.error('[Sui] Error getting request:', error);
    return null;
  }
}

/**
 * Fetch executor stats from ExecutorRegistry, StakingRegistry, and TierRegistry
 */
export async function getExecutorStats(executorAddress: string): Promise<{
  reputation: number;
  slashCount: number;
  stakeAmount: number;
  tier: number;
}> {
  const defaults = { reputation: 0, slashCount: 0, stakeAmount: 0, tier: 0 };
  const sui = getClient();
  const cfg = getConfig();

  if (!cfg.executorRegistryId) return defaults;

  // Run all three registry lookups in parallel
  const [executorResult, stakeResult, tierResult] = await Promise.allSettled([
    fetchExecutorRegistryStats(sui, cfg, executorAddress),
    fetchStakeAmount(sui, cfg, executorAddress),
    fetchTier(sui, cfg, executorAddress),
  ]);

  const executor = executorResult.status === 'fulfilled' ? executorResult.value : null;
  const stakeAmount = stakeResult.status === 'fulfilled' ? stakeResult.value : 0;
  const tier = tierResult.status === 'fulfilled' ? tierResult.value : 0;

  if (executorResult.status === 'rejected') {
    console.warn('[Sui] ExecutorRegistry lookup failed:', executorResult.reason);
  }
  if (stakeResult.status === 'rejected') {
    console.warn('[Sui] StakingRegistry lookup failed:', stakeResult.reason);
  }
  if (tierResult.status === 'rejected') {
    console.warn('[Sui] TierRegistry lookup failed:', tierResult.reason);
  }

  return {
    reputation: executor?.reputation ?? 0,
    slashCount: executor?.slashCount ?? 0,
    stakeAmount,
    tier,
  };
}

/**
 * Fetch reputation + failed_jobs from ExecutorRegistry
 */
async function fetchExecutorRegistryStats(
  sui: SuiClient,
  cfg: SuiConfig,
  executorAddress: string,
): Promise<{ reputation: number; slashCount: number } | null> {
  const registry = await sui.getObject({
    id: cfg.executorRegistryId,
    options: { showContent: true },
  });

  if (!registry.data?.content || registry.data.content.dataType !== 'moveObject') {
    return null;
  }

  const fields = registry.data.content.fields as Record<string, unknown>;
  const executorsTable = fields['executors'] as { fields?: { id?: { id: string } } };
  const tableId = executorsTable?.fields?.id?.id;
  if (!tableId) return null;

  const fieldData = await sui.getDynamicFieldObject({
    parentId: tableId,
    name: { type: 'address', value: executorAddress },
  });

  if (!fieldData.data?.content || fieldData.data.content.dataType !== 'moveObject') {
    return null;
  }

  const content = fieldData.data.content.fields as Record<string, unknown>;
  const valueWrapper = content['value'] as { fields?: Record<string, unknown> } | Record<string, unknown>;
  const v = ('fields' in valueWrapper && valueWrapper.fields)
    ? valueWrapper.fields as Record<string, unknown>
    : valueWrapper as Record<string, unknown>;

  return {
    reputation: Number(v['reputation'] || 0),
    slashCount: Number(v['failed_jobs'] || 0),
  };
}

/**
 * Fetch staked amount from StakingRegistry.
 * StakingRegistry.stakes: Table<address, ID> → ExecutorStake object → staked_amount
 */
async function fetchStakeAmount(
  sui: SuiClient,
  cfg: SuiConfig,
  executorAddress: string,
): Promise<number> {
  if (!cfg.stakingRegistryId) return 0;

  const registry = await sui.getObject({
    id: cfg.stakingRegistryId,
    options: { showContent: true },
  });

  if (!registry.data?.content || registry.data.content.dataType !== 'moveObject') {
    return 0;
  }

  const fields = registry.data.content.fields as Record<string, unknown>;
  const stakesTable = fields['stakes'] as { fields?: { id?: { id: string } } };
  const tableId = stakesTable?.fields?.id?.id;
  if (!tableId) return 0;

  // Table<address, ID> — value is the object ID of ExecutorStake
  const fieldData = await sui.getDynamicFieldObject({
    parentId: tableId,
    name: { type: 'address', value: executorAddress },
  });

  if (!fieldData.data?.content || fieldData.data.content.dataType !== 'moveObject') {
    return 0;
  }

  const dfFields = fieldData.data.content.fields as Record<string, unknown>;
  const stakeObjectId = dfFields['value'] as string;
  if (!stakeObjectId) return 0;

  // Fetch the ExecutorStake object to read staked_amount (Balance<SUI>)
  const stakeObj = await sui.getObject({
    id: stakeObjectId,
    options: { showContent: true },
  });

  if (!stakeObj.data?.content || stakeObj.data.content.dataType !== 'moveObject') {
    return 0;
  }

  const stakeFields = stakeObj.data.content.fields as Record<string, unknown>;
  // Balance<SUI> is represented as { value: u64 } on-chain
  const stakedAmount = stakeFields['staked_amount'] as { fields?: { value?: string } } | string | number;
  if (typeof stakedAmount === 'object' && stakedAmount !== null) {
    return Number(stakedAmount.fields?.value || 0);
  }
  return Number(stakedAmount || 0);
}

/**
 * Fetch tier from TierRegistry.
 * TierRegistry.tiers: Table<address, u8>
 */
async function fetchTier(
  sui: SuiClient,
  cfg: SuiConfig,
  executorAddress: string,
): Promise<number> {
  if (!cfg.tierRegistryId) return 0;

  const registry = await sui.getObject({
    id: cfg.tierRegistryId,
    options: { showContent: true },
  });

  if (!registry.data?.content || registry.data.content.dataType !== 'moveObject') {
    return 0;
  }

  const fields = registry.data.content.fields as Record<string, unknown>;
  const tiersTable = fields['tiers'] as { fields?: { id?: { id: string } } };
  const tableId = tiersTable?.fields?.id?.id;
  if (!tableId) return 0;

  const fieldData = await sui.getDynamicFieldObject({
    parentId: tableId,
    name: { type: 'address', value: executorAddress },
  });

  if (!fieldData.data?.content || fieldData.data.content.dataType !== 'moveObject') {
    return 0;
  }

  const dfFields = fieldData.data.content.fields as Record<string, unknown>;
  return Number(dfFields['value'] || 0);
}

/**
 * Fetch active PCR baseline from AttestationRegistry.
 * Returns null if registry not configured or no active baseline.
 */
export async function getAttestationBaseline(): Promise<{
  version: number;
  pcr0: string; // hex
  pcr1: string; // hex
  pcr2: string; // hex
} | null> {
  const sui = getClient();
  const cfg = getConfig();

  if (!cfg.attestationRegistryId) return null;

  try {
    const registry = await sui.getObject({
      id: cfg.attestationRegistryId,
      options: { showContent: true },
    });

    if (!registry.data?.content || registry.data.content.dataType !== 'moveObject') {
      return null;
    }

    const fields = registry.data.content.fields as Record<string, unknown>;
    const currentVersion = Number(fields['current_version'] || 0);
    if (currentVersion === 0) {
      console.log('[Sui] No active attestation baseline (version=0)');
      return null;
    }

    // Fetch baseline from Table<u64, PCRBaseline>
    const baselinesTable = fields['baselines'] as { fields?: { id?: { id: string } } };
    const tableId = baselinesTable?.fields?.id?.id;
    if (!tableId) return null;

    const baselineField = await sui.getDynamicFieldObject({
      parentId: tableId,
      name: { type: 'u64', value: currentVersion.toString() },
    });

    if (!baselineField.data?.content || baselineField.data.content.dataType !== 'moveObject') {
      return null;
    }

    const bfFields = baselineField.data.content.fields as Record<string, unknown>;
    const valueWrapper = bfFields['value'] as { fields?: Record<string, unknown> } | Record<string, unknown>;
    const v = ('fields' in valueWrapper && valueWrapper.fields)
      ? valueWrapper.fields as Record<string, unknown>
      : valueWrapper as Record<string, unknown>;

    const bytesToHex = (bytes: unknown): string => {
      if (Array.isArray(bytes)) return Buffer.from(bytes).toString('hex');
      if (typeof bytes === 'string') return bytes;
      return '';
    };

    const baseline = {
      version: currentVersion,
      pcr0: bytesToHex(v['pcr0']),
      pcr1: bytesToHex(v['pcr1']),
      pcr2: bytesToHex(v['pcr2']),
    };

    console.log(`[Sui] Loaded attestation baseline v${baseline.version} (pcr0: ${baseline.pcr0.slice(0, 16)}...)`);
    return baseline;
  } catch (error) {
    console.warn('[Sui] Failed to fetch attestation baseline:', error);
    return null;
  }
}

/**
 * SHA-256 hash as byte array
 */
export function sha256Bytes(content: string): number[] {
  return Array.from(createHash('sha256').update(content, 'utf-8').digest());
}

// ============================================================================
// Plan B B2: Capability-gated AER PTB
// ============================================================================

/** The seven AER sub-categories the v2 entry adds on top of `AERReportData`.
 *  Each maps 1:1 to a sub-struct in the Move contract (see Plan A §1). The
 *  host fills these from request metadata; trader presets (Plan C) will
 *  produce richer values, but a minimal cognition-noop AER can be built from
 *  the same shape using `defaultCognitionEnvelope`. */
export interface AEREnvelopeMeta {
  /** 1=cognition, 2=execution. Settlement class is the legacy ungated path. */
  eventClass: 1 | 2;
  actionType: string;
  actionSchemaVersion: number;
  payloadCodec: 'bcs';
  /** SHA-256(action_type_bytes || payload_bytes) — caller computes. */
  payloadHash: number[];
  payloadBytes: number[];
  actionSummary: string;
  /** 1=success, 2=hold-noop, 3=failure. */
  actionOutcome: 1 | 2 | 3;
}

export interface AERLineageMeta {
  /** UUIDv7, 16 bytes. Generate via `capability.generateIntentId` or pass through. */
  intentId: number[];
  parentIntentId: number[] | null;
  /** Local retry counter within the intent. 1 for first attempt. */
  executionId: number;
}

export interface AERWakeMeta {
  /** 1=heartbeat, 2=user_message, 3=price_alert, 4=manual. */
  triggeredByType: 1 | 2 | 3 | 4;
  triggeredByRef: string | null;
}

export interface AERReplayMeta {
  modelVersion: string;
  /** SHA-256 of the rendered prompt template. */
  promptTemplateHash: number[];
  marketSnapshotHash: number[] | null;
  /** Strict-ascending UTF-8 byte order by key; caller's responsibility. */
  replayExtras: Array<[string, number[]]>;
}

/** The optional execution action the host appends to the PTB. For
 *  HOLD/cognition AERs this is `null` — the PTB has just the settlement +
 *  AER commands. Plan C C3-v2 DV12 adds the `pipe` arg kind: the host
 *  resolves pipe sentinels into PTB returns from the upstream escrow
 *  withdraw + inline `coin::zero<DEEP>` commands when composing the
 *  execution path. */
export type ActionCallArg =
  | { kind: 'object'; id: string }
  | { kind: 'pure'; bytes: Uint8Array }
  | { kind: 'pipe'; from: 'withdraw_coin' | 'zero_deep' };

export interface ActionCallSpec {
  targetPackage: string;
  module: string;
  fn: string;
  /** Type arguments for generic Move calls. Pado pool swap calls
   *  parameterize on `<BaseAsset, QuoteAsset>`. */
  typeArguments: string[];
  args: ActionCallArg[];
}

/** Plan C C3-v2 §4.3: execution-only PTB plumbing. When present together
 *  with `actionCall`, the host emits the full 10-cmd execution path
 *  (DV9: escrow withdraw + inline DEEP zero + swap + settle + leftover
 *  deposit + DEEP destroy + receipt + AER + housekeeping). */
export interface ExecutionPlanInput {
  /** Shared `AgentEscrow` ref. */
  escrow: {
    objectId: string;
    initialSharedVersion: bigint;
    /** Reciprocal check: must equal capRef.objectId. Server enforces. */
    capabilityId: string;
  };
  /** What to withdraw on Cmd 0. */
  spend: {
    /** Fully-qualified TypeName of the input coin (= type T for
     *  `withdraw_for_action<T>` and `deposit_swap_leftover<T>`). */
    inputAssetType: string;
    amount: bigint;
  };
  /** Fully-qualified TypeName of the swap's primary output coin (= type
   *  U for `settle_action<U>`). Derived from the action-classes function
   *  entry given the input asset. */
  outputAssetType: string;
  /** Fully-qualified TypeName of DEEP (for inline `coin::zero<DEEP>`
   *  and `coin::destroy_zero<DEEP>`). */
  deepType: string;
  /** Tuple positions in the swap's 3-coin return. */
  outputCoinResult: {
    primary: number;
    leftoverInput: number;
    leftoverDeep: number;
  };
  /** Expected `cap.version` for the contract's stale-cap guard
   *  (`withdraw_for_action` aborts on mismatch). */
  expectedCapabilityVersion: bigint;
}

export interface SubmitProofWithCapabilityInput {
  requestId: number;
  resultHash: string;
  executionTimeMs: number;
  request: ComputeRequestOnChain;
  aer: AERReportData;
  capRef: CapabilityRef;
  envelope: AEREnvelopeMeta;
  lineage: AERLineageMeta;
  wake: AERWakeMeta;
  replay: AERReplayMeta;
  /** Optional execution action. Null for HOLD/cognition AERs. */
  actionCall?: ActionCallSpec | null;
  /** Optional execution-path plumbing. Must be present iff
   *  `envelope.eventClass === 2`. Server validates the invariant. */
  execution?: ExecutionPlanInput | null;
}

/**
 * Submit the capability-gated atomic settlement PTB.
 *
 * PTB layout (Plan C C3-v2 §DV9):
 *   Cmd 0 (exec only): escrow::withdraw_for_action<T> → (Coin<T>, Obligation)
 *   Cmd 1 (exec only): coin::zero<DEEP> → Coin<DEEP>
 *   Cmd 2 (exec only): pool::swap_exact_* → 3-coin tuple
 *   Cmd 3 (exec only): escrow::settle_action<U> (consumes obligation,
 *                       deposits primary output)
 *   Cmd 4 (exec only): escrow::deposit_swap_leftover<T> (lot-size dust)
 *   Cmd 5 (exec only): coin::destroy_zero<DEEP>
 *   Cmd 6: baram::submit_proof_with_receipt → SettlementReceipt
 *   Cmd 7: aer::create_report_with_receipt_capability(receipt, cap, ...)
 *   Cmd 8/9: record_job_completion + refresh_tier_from_state
 *
 * The capability is referenced via `tx.sharedObjectRef({ mutable: false })`
 * so the cap read stays off the consensus-serialized path. Code-review C-3.
 *
 * Aborts at Cmd 2 if cap is revoked / paused / owner mismatch / version
 * mismatch / action_type not allowed / payment_amount > notional cap. PTB
 * rollback means receipt is NOT consumed (no payout to executor) — correct
 * incentive: if the AER never materialized, the inference is unsettled.
 */
export async function submitProofWithAERCapability(
  input: SubmitProofWithCapabilityInput,
): Promise<string> {
  const sui = getClient();
  const kp = getKeypair();
  const cfg = getConfig();

  console.log(
    `[Sui] Submitting capability-gated PTB for request ${input.requestId} (` +
      `action=${input.envelope.actionType} class=${input.envelope.eventClass})`,
  );

  const tx = buildAERTransaction(input, cfg);

  const result = await sui.signAndExecuteTransaction({
    signer: kp,
    transaction: tx,
    options: { showEffects: true, showEvents: true },
  });

  if (result.effects?.status?.status !== 'success') {
    const error = result.effects?.status?.error || 'Unknown error';
    throw new Error(`Capability-gated PTB failed: ${error}`);
  }

  console.log(`[Sui] Capability-gated PTB submitted: ${result.digest}`);
  return result.digest;
}

/**
 * Pure PTB composer for the capability-gated AER tx. Extracted so
 * tests can inspect the command graph without a live keypair / RPC.
 * `cfg` is the same shape as SuiConfig (but without the executor key).
 */
export function buildAERTransaction(
  input: SubmitProofWithCapabilityInput,
  cfg: Pick<
    SuiConfig,
    | 'packageId'
    | 'registryId'
    | 'aerPackageId'
    | 'aerRegistryId'
    | 'executorPackageId'
    | 'executorRegistryId'
    | 'tierRegistryId'
    | 'executorStakeId'
    | 'processedRequestsId'
  >,
): Transaction {
  const tx = new Transaction();

  // Cap shared-object ref. Shared across both the execution path
  // (read by withdraw_for_action / settle_action / deposit_swap_leftover)
  // and the AER call. mutable:false because all three contract entries
  // take cap as `&Capability` (immutable).
  const capArg = tx.sharedObjectRef({
    objectId: input.capRef.objectId,
    initialSharedVersion: input.capRef.initialSharedVersion.toString(),
    mutable: false,
  });

  // Execution path (Cmd 0–5). Only for execution-class AERs with a
  // fully-resolved execution plan.
  if (input.actionCall && input.execution) {
    if (input.execution.escrow.capabilityId !== input.capRef.objectId) {
      throw new Error(
        `execution.escrow.capabilityId mismatch with capRef.objectId — refusing to compose PTB`,
      );
    }
    const exec = input.execution;
    const escrowArg = tx.sharedObjectRef({
      objectId: exec.escrow.objectId,
      initialSharedVersion: exec.escrow.initialSharedVersion.toString(),
      mutable: true,
    });

    // Cmd 0: escrow::withdraw_for_action<T>(escrow, cap, amount, ver)
    //          -> (Coin<T>, SpendObligation)
    const withdrawRet = tx.moveCall({
      target: `${cfg.aerPackageId}::escrow::withdraw_for_action`,
      typeArguments: [exec.spend.inputAssetType],
      arguments: [
        escrowArg,
        capArg,
        tx.pure.u64(exec.spend.amount),
        tx.pure.u64(exec.expectedCapabilityVersion),
      ],
    });
    const withdrawCoin = withdrawRet[0];
    const obligation = withdrawRet[1];

    // Cmd 1: coin::zero<DEEP>(ctx) -> Coin<DEEP>
    const [zeroDeep] = tx.moveCall({
      target: '0x2::coin::zero',
      typeArguments: [exec.deepType],
    });

    // Cmd 2: swap (substitutes pipe sentinels with Cmd 0.0 + Cmd 1)
    const ac = input.actionCall;
    const swapRet = tx.moveCall({
      target: `${ac.targetPackage}::${ac.module}::${ac.fn}`,
      typeArguments: ac.typeArguments,
      arguments: ac.args.map((a) => {
        if (a.kind === 'object') return tx.object(a.id);
        if (a.kind === 'pure') return tx.pure(a.bytes);
        // pipe substitution
        if (a.from === 'withdraw_coin') return withdrawCoin;
        if (a.from === 'zero_deep') return zeroDeep;
        throw new Error(`Unknown pipe source: ${(a as { from: string }).from}`);
      }),
    });
    const primaryOut = swapRet[exec.outputCoinResult.primary];
    const leftoverInput = swapRet[exec.outputCoinResult.leftoverInput];
    const leftoverDeep = swapRet[exec.outputCoinResult.leftoverDeep];

    // Cmd 3: escrow::settle_action<U>(escrow, cap, obligation, primaryOut)
    tx.moveCall({
      target: `${cfg.aerPackageId}::escrow::settle_action`,
      typeArguments: [exec.outputAssetType],
      arguments: [escrowArg, capArg, obligation, primaryOut],
    });

    // Cmd 4: escrow::deposit_swap_leftover<T>(escrow, cap, leftoverInput)
    tx.moveCall({
      target: `${cfg.aerPackageId}::escrow::deposit_swap_leftover`,
      typeArguments: [exec.spend.inputAssetType],
      arguments: [escrowArg, capArg, leftoverInput],
    });

    // Cmd 5: coin::destroy_zero<DEEP>(leftoverDeep)
    //   Predicated on Pado pools being DEEP-whitelisted. Smoke S14
    //   verifies. Mitigation if pools drift: replace with
    //   deposit_swap_leftover<DEEP> + add DEEP to cap.allowed_assets.
    tx.moveCall({
      target: '0x2::coin::destroy_zero',
      typeArguments: [exec.deepType],
      arguments: [leftoverDeep],
    });
  } else if (input.actionCall && !input.execution) {
    // Plan C C3-v2 invariant: execution AERs MUST carry an execution
    // plan. server.ts validates this before reaching us; the guard here
    // is belt-and-suspenders. Refuse to compose a half-formed PTB.
    throw new Error('actionCall present without execution plan');
  }

  // Cmd 6: submit_proof_with_receipt (settlement)
  const resultHashBytes = Array.from(Buffer.from(input.resultHash, 'hex'));
  const [receipt] = tx.moveCall({
    target: `${cfg.packageId}::baram::submit_proof_with_receipt`,
    arguments: [
      tx.object(cfg.registryId),
      tx.pure.u64(input.requestId),
      tx.pure.vector('u8', resultHashBytes),
      tx.pure.u64(input.executionTimeMs),
      tx.object('0x6'), // Clock
    ],
  });

  // Cmd 7: capability-gated AER creation
  const promptHashBytes = Array.isArray(input.request.promptHash)
    ? (input.request.promptHash as unknown as number[])
    : Array.from(Buffer.from(input.request.promptHash, 'hex'));

  tx.moveCall({
    target: `${cfg.aerPackageId}::aer::create_report_with_receipt_capability`,
    arguments: [
      tx.object(cfg.aerRegistryId),
      tx.object(cfg.registryId),
      receipt,
      capArg,
      tx.pure.u64(input.capRef.cap.version),

      // Requester
      tx.pure.address(input.request.requester),
      tx.pure.vector('address', input.aer.delegationPath),
      // Executor
      tx.pure(bcs.option(bcs.Address).serialize(input.aer.executorPrincipal)),
      // Payment
      tx.pure(bcs.option(bcs.string()).serialize(input.aer.feeDetail)),
      tx.pure(bcs.option(bcs.Address).serialize(input.aer.budgetId)),
      tx.pure(
        bcs
          .option(bcs.u64())
          .serialize(input.aer.budgetRemaining != null ? BigInt(input.aer.budgetRemaining) : null),
      ),
      // Inference
      tx.pure(bcs.option(bcs.string()).serialize(input.aer.modelMetadata)),
      tx.pure.vector('u8', promptHashBytes),
      // Why
      tx.pure(bcs.option(bcs.string()).serialize(input.aer.purpose)),
      tx.pure(bcs.option(bcs.string()).serialize(input.aer.constraints)),
      // Trust
      tx.pure.u8(input.aer.executorTier),
      tx.pure.u64(input.aer.executorReputation),
      tx.pure.u64(input.aer.executorStakeAmount),
      tx.pure.bool(input.aer.teeVerified),
      tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(input.aer.teeAttestationHash)),
      // Time
      tx.pure.u64(input.request.createdAt),
      // Chain
      tx.pure(bcs.option(bcs.Address).serialize(input.aer.triggeredBy)),
      tx.pure(bcs.option(bcs.Address).serialize(input.aer.triggeredAction)),
      tx.pure.vector('u8', input.lineage.intentId),
      tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(input.lineage.parentIntentId)),
      tx.pure.u32(input.lineage.executionId),
      // Envelope
      tx.pure.u8(input.envelope.eventClass),
      tx.pure.string(input.envelope.actionType),
      tx.pure.u16(input.envelope.actionSchemaVersion),
      tx.pure.string(input.envelope.payloadCodec),
      tx.pure.vector('u8', input.envelope.payloadHash),
      tx.pure.vector('u8', input.envelope.payloadBytes),
      tx.pure.string(input.envelope.actionSummary),
      tx.pure.u8(input.envelope.actionOutcome),
      // Wake
      tx.pure.u8(input.wake.triggeredByType),
      tx.pure(bcs.option(bcs.string()).serialize(input.wake.triggeredByRef)),
      // Replay
      tx.pure.string(input.replay.modelVersion),
      tx.pure.vector('u8', input.replay.promptTemplateHash),
      tx.pure(bcs.option(bcs.vector(bcs.u8())).serialize(input.replay.marketSnapshotHash)),
      tx.pure.vector('string', input.replay.replayExtras.map(([k]) => k)),
      tx.pure(
        bcs
          .vector(bcs.vector(bcs.u8()))
          .serialize(input.replay.replayExtras.map(([, v]) => v)),
      ),
    ],
  });

  // Cmd 8: record_job_completion (existing)
  if (cfg.executorPackageId && cfg.executorRegistryId && cfg.processedRequestsId) {
    tx.moveCall({
      target: `${cfg.executorPackageId}::executor::record_job_completion`,
      arguments: [
        tx.object(cfg.executorRegistryId),
        tx.object(cfg.processedRequestsId),
        tx.pure.u64(input.requestId),
        tx.object('0x6'),
      ],
    });
  }

  // Cmd 9: refresh_tier_from_state (existing)
  if (
    cfg.executorPackageId &&
    cfg.tierRegistryId &&
    cfg.executorRegistryId &&
    cfg.executorStakeId
  ) {
    tx.moveCall({
      target: `${cfg.executorPackageId}::executor_tier::refresh_tier_from_state`,
      arguments: [
        tx.object(cfg.tierRegistryId),
        tx.object(cfg.executorRegistryId),
        tx.object(cfg.executorStakeId),
      ],
    });
  }

  return tx;
}

/**
 * SHA-256 of (action_type bytes || payload_bytes) as a number[] for PTB pure args.
 * Plan A D4: this binds the action_type label to the payload schema.
 */
export function actionPayloadHash(actionType: string, payloadBytes: Uint8Array | number[]): number[] {
  const h = createHash('sha256');
  h.update(Buffer.from(actionType, 'utf-8'));
  h.update(Buffer.from(payloadBytes as Uint8Array));
  return Array.from(h.digest());
}

/**
 * Build a `noop.v1` cognition envelope for the HOLD path or for soft-rail
 * rejections. The payload is the BCS encoding of `{ reason_code: u8,
 * rationale_hash: vector<u8> }` per AER_V2_CODEC §7.
 */
export function defaultCognitionEnvelope(args: {
  reasonCode: number;
  rationaleHash: number[];
  summary: string;
}): AEREnvelopeMeta {
  // BCS layout for noop.v1 payload — match the codec doc.
  const payloadBytes = Array.from(
    bcs
      .struct('NoopV1', { reason_code: bcs.u8(), rationale_hash: bcs.vector(bcs.u8()) })
      .serialize({ reason_code: args.reasonCode, rationale_hash: args.rationaleHash })
      .toBytes(),
  );
  return {
    eventClass: 1,
    actionType: 'noop.v1',
    actionSchemaVersion: 1,
    payloadCodec: 'bcs',
    payloadHash: actionPayloadHash('noop.v1', Uint8Array.from(payloadBytes)),
    payloadBytes,
    actionSummary: args.summary.slice(0, 280),
    actionOutcome: 2, // hold-noop
  };
}
