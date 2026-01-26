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

/**
 * Initialize Sui client and executor keypair
 */
export function initSui(config: {
  rpcUrl: string;
  packageId: string;
  registryId: string;
  executorPrivateKey: string;
}): void {
  suiClient = new SuiClient({ url: config.rpcUrl });
  BARAM_PACKAGE_ID = config.packageId;
  BARAM_REGISTRY_ID = config.registryId;

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
    const requestsTable = fields.requests as { fields: { id: { id: string } } } | undefined;

    if (!requestsTable?.fields?.id?.id) {
      console.error('[Sui] Requests table not found in registry');
      return null;
    }

    // Query dynamic field for specific request
    const dynamicField = await client.getDynamicFieldObject({
      parentId: requestsTable.fields.id.id,
      name: { type: 'u64', value: requestId.toString() },
    });

    if (!dynamicField.data?.content || dynamicField.data.content.dataType !== 'moveObject') {
      console.log(`[Sui] Request ${requestId} not found`);
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
