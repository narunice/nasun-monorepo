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
 * Fetch executor stats from ExecutorRegistry for compliance snapshots
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

  try {
    const registry = await sui.getObject({
      id: cfg.executorRegistryId,
      options: { showContent: true },
    });

    if (!registry.data?.content || registry.data.content.dataType !== 'moveObject') {
      return defaults;
    }

    const fields = registry.data.content.fields as Record<string, unknown>;
    const executorsTable = fields['executors'] as { fields?: { id?: { id: string } } };
    const tableId = executorsTable?.fields?.id?.id;
    if (!tableId) return defaults;

    const fieldData = await sui.getDynamicFieldObject({
      parentId: tableId,
      name: { type: 'address', value: executorAddress },
    });

    if (!fieldData.data?.content || fieldData.data.content.dataType !== 'moveObject') {
      return defaults;
    }

    const content = fieldData.data.content.fields as Record<string, unknown>;
    const valueWrapper = content['value'] as { fields?: Record<string, unknown> } | Record<string, unknown>;
    const v = ('fields' in valueWrapper && valueWrapper.fields)
      ? valueWrapper.fields as Record<string, unknown>
      : valueWrapper as Record<string, unknown>;

    return {
      reputation: Number(v['reputation'] || 0),
      slashCount: Number(v['failed_jobs'] || 0),
      stakeAmount: 0, // StakingRegistry lookup deferred
      tier: 0,        // TierRegistry lookup deferred
    };
  } catch (error) {
    console.warn('[Sui] Failed to fetch executor stats:', error);
    return defaults;
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
