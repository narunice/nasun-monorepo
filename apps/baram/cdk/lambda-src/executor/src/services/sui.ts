/**
 * Sui Client Service - Baram contract interaction
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { ComputeRequestOnChain, STATUS } from '../types';

let suiClient: SuiClient | null = null;
let executorKeypair: Ed25519Keypair | null = null;

// Contract configuration
let BARAM_PACKAGE_ID = '';
let BARAM_REGISTRY_ID = '';
let COMPLIANCE_PACKAGE_ID = '';
let COMPLIANCE_REGISTRY_ID = '';
let EXECUTOR_REGISTRY_ID = '';

/**
 * Initialize Sui client and executor keypair
 */
export function initSui(config: {
  rpcUrl: string;
  packageId: string;
  registryId: string;
  executorPrivateKey: string;
  compliancePackageId?: string;
  complianceRegistryId?: string;
  executorRegistryId?: string;
}): void {
  suiClient = new SuiClient({ url: config.rpcUrl });
  BARAM_PACKAGE_ID = config.packageId;
  BARAM_REGISTRY_ID = config.registryId;
  COMPLIANCE_PACKAGE_ID = config.compliancePackageId || '';
  COMPLIANCE_REGISTRY_ID = config.complianceRegistryId || '';
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

    // Retry logic: wait for on-chain state to propagate
    let dynamicField = null;
    const maxRetries = 5;
    const retryDelay = 1000; // 1 second

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
        console.log(`[Sui] Request ${requestId} not found, retrying in ${retryDelay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
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
 * Submit execution proof and receive payment
 *
 * @param requestId - Request ID
 * @param resultHash - SHA-256 hash of result (32 bytes hex)
 * @param executionTimeMs - Execution time in milliseconds
 * @returns Transaction digest
 */
export async function submitProof(
  requestId: number,
  resultHash: string,
  executionTimeMs: number
): Promise<string> {
  const client = getClient();
  const keypair = getKeypair();

  console.log(`[Sui] Submitting proof for request ${requestId}`);

  // Build transaction
  const tx = new Transaction();

  // Convert result hash from hex to bytes
  const resultHashBytes = Array.from(Buffer.from(resultHash, 'hex'));

  tx.moveCall({
    target: `${BARAM_PACKAGE_ID}::baram::submit_proof`,
    arguments: [
      tx.object(BARAM_REGISTRY_ID), // registry
      tx.pure.u64(requestId), // request_id
      tx.pure.vector('u8', resultHashBytes), // result_hash
      tx.pure.u64(executionTimeMs), // execution_time_ms
      tx.object('0x6'), // Clock
    ],
  });

  // Sign and execute
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

  console.log(`[Sui] Proof submitted successfully: ${result.digest}`);
  return result.digest;
}

/**
 * Compliance data for create_record call
 */
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

/**
 * Submit proof + create compliance record in the same PTB (atomic).
 * Used for TEE executions that require compliance recording.
 */
export async function submitProofWithCompliance(
  requestId: number,
  resultHash: string,
  executionTimeMs: number,
  request: ComputeRequestOnChain,
  compliance: ComplianceData,
): Promise<string> {
  if (!COMPLIANCE_PACKAGE_ID || !COMPLIANCE_REGISTRY_ID) {
    console.warn('[Sui] Compliance not configured, falling back to submitProof');
    return submitProof(requestId, resultHash, executionTimeMs);
  }

  const client = getClient();
  const keypair = getKeypair();

  console.log(`[Sui] Submitting proof + compliance record for request ${requestId}`);

  const tx = new Transaction();

  const resultHashBytes = Array.from(Buffer.from(resultHash, 'hex'));
  const promptHashBytes = Array.isArray(request.promptHash)
    ? request.promptHash
    : Array.from(Buffer.from(request.promptHash, 'hex'));

  // Call 1: submit_proof (settlement + payment)
  tx.moveCall({
    target: `${BARAM_PACKAGE_ID}::baram::submit_proof`,
    arguments: [
      tx.object(BARAM_REGISTRY_ID),
      tx.pure.u64(requestId),
      tx.pure.vector('u8', resultHashBytes),
      tx.pure.u64(executionTimeMs),
      tx.object('0x6'), // Clock
    ],
  });

  // Call 2: create_record (compliance — same PTB for atomicity)
  tx.moveCall({
    target: `${COMPLIANCE_PACKAGE_ID}::compliance::create_record`,
    arguments: [
      tx.object(COMPLIANCE_REGISTRY_ID),       // registry
      tx.pure.u64(requestId),                  // request_id
      tx.pure.address(request.requester),      // requester
      tx.pure.address(request.executor),       // executor
      tx.pure.string(request.model),           // model
      tx.pure.vector('u8', promptHashBytes),   // prompt_hash
      tx.pure.vector('u8', resultHashBytes),   // result_hash
      tx.pure.u64(executionTimeMs),            // execution_time_ms
      tx.pure.u8(compliance.teeType),          // tee_type
      tx.pure.vector('u8', compliance.pcr0),   // pcr0
      tx.pure.vector('u8', compliance.attestationHash), // attestation_hash
      tx.pure.u64(compliance.pcrBaselineVersion),       // pcr_baseline_version
      tx.pure.bool(compliance.pcrVerified),    // pcr_verified
      tx.pure.u64(compliance.executorReputation),       // executor_reputation
      tx.pure.u64(compliance.executorStakeAmount),      // executor_stake_amount
      tx.pure.u64(compliance.executorSlashCount),       // executor_slash_count
      tx.pure.u8(compliance.executorTier),     // executor_tier
      tx.pure.u64(request.price),              // payment_amount
      tx.pure.u64(request.createdAt),          // request_created_at
      tx.object('0x6'),                        // Clock
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

  console.log(`[Sui] Proof + compliance record submitted: ${result.digest}`);
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
      tx.object('0x6'), // Clock
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
