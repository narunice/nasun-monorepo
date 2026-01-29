/**
 * Sui Client for Nitro Host — Settlement + Compliance
 *
 * Handles on-chain settlement (submit_proof) and compliance recording (create_record)
 * after the Enclave returns execution results.
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { createHash } from 'crypto';

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

export interface ComplianceData {
  teeType: number;
  pcr0: number[];
  attestationHash: number[];
  pcrBaselineVersion: number;
  pcrVerified: boolean;
  executorReputation: number;
  executorStakeAmount: number;
  executorSlashCount: number;
  executorTier: number;
}

export interface SuiConfig {
  rpcUrl: string;
  packageId: string;
  registryId: string;
  executorPrivateKey: string;
  compliancePackageId: string;
  complianceRegistryId: string;
  executorRegistryId: string;
  attestationRegistryId: string;
  stakingRegistryId: string;
  tierRegistryId: string;
}

let client: SuiClient | null = null;
let keypair: Ed25519Keypair | null = null;
let config: SuiConfig | null = null;

export function initSuiClient(cfg: SuiConfig): void {
  client = new SuiClient({ url: cfg.rpcUrl });
  keypair = Ed25519Keypair.fromSecretKey(Buffer.from(cfg.executorPrivateKey, 'hex'));
  config = cfg;
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
 * Submit proof + create compliance record in the same PTB (atomic).
 * Called after Enclave returns execution results.
 */
export async function submitProofWithCompliance(
  requestId: number,
  resultHash: string,
  executionTimeMs: number,
  request: ComputeRequestOnChain,
  compliance: ComplianceData,
): Promise<string> {
  const sui = getClient();
  const kp = getKeypair();
  const cfg = getConfig();

  console.log(`[Sui] Submitting proof + compliance for request ${requestId}`);

  const tx = new Transaction();

  const resultHashBytes = Array.from(Buffer.from(resultHash, 'hex'));
  const promptHashBytes = Array.isArray(request.promptHash)
    ? request.promptHash as unknown as number[]
    : Array.from(Buffer.from(request.promptHash, 'hex'));

  // Call 1: submit_proof (settlement + payment)
  tx.moveCall({
    target: `${cfg.packageId}::baram::submit_proof`,
    arguments: [
      tx.object(cfg.registryId),
      tx.pure.u64(requestId),
      tx.pure.vector('u8', resultHashBytes),
      tx.pure.u64(executionTimeMs),
      tx.object('0x6'), // Clock
    ],
  });

  // Call 2: create_record (compliance — same PTB for atomicity)
  if (cfg.compliancePackageId && cfg.complianceRegistryId) {
    tx.moveCall({
      target: `${cfg.compliancePackageId}::compliance::create_record`,
      arguments: [
        tx.object(cfg.complianceRegistryId),
        tx.pure.u64(requestId),
        tx.pure.address(request.requester),
        tx.pure.address(request.executor),
        tx.pure.string(request.model),
        tx.pure.vector('u8', promptHashBytes),
        tx.pure.vector('u8', resultHashBytes),
        tx.pure.u64(executionTimeMs),
        tx.pure.u8(compliance.teeType),
        tx.pure.vector('u8', compliance.pcr0),
        tx.pure.vector('u8', compliance.attestationHash),
        tx.pure.u64(compliance.pcrBaselineVersion),
        tx.pure.bool(compliance.pcrVerified),
        tx.pure.u64(compliance.executorReputation),
        tx.pure.u64(compliance.executorStakeAmount),
        tx.pure.u64(compliance.executorSlashCount),
        tx.pure.u8(compliance.executorTier),
        tx.pure.u64(request.price),
        tx.pure.u64(request.createdAt),
        tx.object('0x6'), // Clock
      ],
    });
  } else {
    console.warn('[Sui] Compliance not configured, submitting proof only');
  }

  const result = await sui.signAndExecuteTransaction({
    signer: kp,
    transaction: tx,
    options: { showEffects: true, showEvents: true },
  });

  if (result.effects?.status?.status !== 'success') {
    const error = result.effects?.status?.error || 'Unknown error';
    throw new Error(`Transaction failed: ${error}`);
  }

  console.log(`[Sui] Proof + compliance submitted: ${result.digest}`);
  return result.digest;
}

/**
 * SHA-256 hash as byte array
 */
export function sha256Bytes(content: string): number[] {
  return Array.from(createHash('sha256').update(content, 'utf-8').digest());
}
