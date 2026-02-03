/**
 * BaramClient — High-level SDK client for Baram AI Settlement Layer
 *
 * Provides programmatic access to Baram's escrow → execution → settlement → ECR pipeline.
 * Designed for Node.js agents, CLI tools, and backend services.
 */

import { SuiClient } from '@mysten/sui/client';
import type { Keypair } from '@mysten/sui/cryptography';
import type {
  BaramConfig,
  ExecuteParams,
  ExecuteResult,
  ExecutorInfo,
  ECRData,
  TierLevel,
} from './types';
import { MODEL_PRICING, EXECUTOR_SELECTION } from './types';
import { sha256, hexToBytes } from './services/encoding';
import { getNusdcCoins } from './services/coin';
import { fetchExecutors, selectExecutorWeightedRandom } from './services/executor';
import { buildCreateRequestTransaction, buildCancelRequestTransaction } from './services/transaction';
import { fetchECRByRequestId } from './services/ecr';

export interface BaramClientOptions {
  config: BaramConfig;
  signer: Keypair;
}

export class BaramClient {
  private client: SuiClient;
  private config: BaramConfig;
  private signer: Keypair;
  private address: string;

  constructor(options: BaramClientOptions) {
    this.config = options.config;
    this.signer = options.signer;
    this.address = options.signer.toSuiAddress();
    this.client = new SuiClient({ url: options.config.rpcUrl });
  }

  /**
   * Get the wallet address derived from the signer.
   */
  getAddress(): string {
    return this.address;
  }

  /**
   * Fetch all active executors from the on-chain registry.
   */
  async getExecutors(): Promise<ExecutorInfo[]> {
    return fetchExecutors(this.client, this.config);
  }

  /**
   * Fetch an ECR (ExecutionComplianceRecord) by request ID.
   */
  async getECR(requestId: number): Promise<ECRData | null> {
    return fetchECRByRequestId(this.client, this.config, requestId);
  }

  /**
   * Get NUSDC balance for the signer's address.
   * @returns Balance in NUSDC (6 decimal places)
   */
  async getBalance(): Promise<number> {
    const coins = await this.client.getCoins({
      owner: this.address,
      coinType: this.config.tokens.nusdcType,
    });
    return coins.data.reduce((sum, c) => sum + Number(c.balance), 0);
  }

  /**
   * Execute an AI inference request through the Baram pipeline.
   *
   * Flow:
   * 1. Select executor (weighted random, tier-filtered)
   * 2. Hash prompt (SHA-256)
   * 3. Create on-chain request (escrow NUSDC)
   * 4. Call executor API
   * 5. Fetch ECR (on-chain compliance record)
   *
   * @throws Error if no eligible executor, insufficient balance, or execution fails
   */
  async execute(params: ExecuteParams): Promise<ExecuteResult> {
    const { prompt, model, minTier, teeRequired } = params;

    // Resolve model pricing
    const modelInfo = MODEL_PRICING[model];
    if (!modelInfo) {
      throw new Error(`Unknown model: ${model}. Available: ${Object.keys(MODEL_PRICING).join(', ')}`);
    }
    const price = modelInfo.price;

    // Fetch executors and select one
    const executors = await this.getExecutors();
    const effectiveMinTier: TierLevel = minTier ?? (teeRequired ? 1 : EXECUTOR_SELECTION.MIN_TIER);
    const excludeIds = new Set<string>();
    let selectedExecutor: ExecutorInfo | null = null;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < EXECUTOR_SELECTION.MAX_RETRIES; attempt++) {
      selectedExecutor = selectExecutorWeightedRandom(executors, excludeIds, effectiveMinTier, model);
      if (!selectedExecutor) break;

      try {
        const result = await this.executeWithExecutor(prompt, model, price, selectedExecutor);
        return result;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        excludeIds.add(selectedExecutor.id);
        selectedExecutor = null;
      }
    }

    if (!selectedExecutor && excludeIds.size === 0) {
      throw new Error(`No eligible executor found for model "${model}" with tier >= ${effectiveMinTier}`);
    }

    throw lastError ?? new Error('All executor attempts failed');
  }

  /**
   * Cancel a pending request and release escrowed NUSDC.
   */
  async cancel(requestId: number): Promise<string> {
    const tx = buildCancelRequestTransaction(this.config, requestId);
    const result = await this.client.signAndExecuteTransaction({
      transaction: tx,
      signer: this.signer,
      options: { showEvents: true },
    });
    return result.digest;
  }

  // --- Private helpers ---

  private async executeWithExecutor(
    prompt: string,
    model: string,
    price: number,
    executor: ExecutorInfo,
  ): Promise<ExecuteResult> {
    // 1. Hash the prompt
    const promptHashHex = await sha256(prompt);
    const promptHashBytes = hexToBytes(promptHashHex);

    // 2. Get NUSDC coins for payment
    const coins = await getNusdcCoins(this.client, this.address, price, this.config.tokens.nusdcType);

    // 3. Build and submit create_request transaction
    const tx = buildCreateRequestTransaction(this.config, {
      coins,
      promptHashBytes,
      model,
      executorOperator: executor.operator,
      price,
    });

    const txResult = await this.client.signAndExecuteTransaction({
      transaction: tx,
      signer: this.signer,
      options: { showEvents: true },
    });

    // 4. Extract requestId from RequestCreated event
    const requestId = this.extractRequestId(txResult);
    if (requestId === null) {
      throw new Error('Failed to extract requestId from transaction events');
    }

    // 5. Call executor API
    let response: string;
    let resultHash: string;
    let executionTimeMs: number;
    let txDigest: string;

    try {
      const execResult = await this.callExecutor(executor, requestId, prompt, model);
      response = execResult.response;
      resultHash = execResult.resultHash;
      executionTimeMs = execResult.executionTimeMs;
      txDigest = execResult.txDigest;
    } catch (err) {
      // Auto-cancel on executor failure to release escrow
      try {
        await this.cancel(requestId);
      } catch {
        // Cancel may fail if already timed out — escrow auto-refunds after timeout
      }
      throw err;
    }

    // 6. Fetch ECR (may need a short delay for on-chain propagation)
    let ecr: ECRData | null = null;
    for (let i = 0; i < 3; i++) {
      ecr = await this.getECR(requestId);
      if (ecr) break;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return {
      requestId,
      response,
      resultHash,
      txDigest,
      executionTimeMs,
      ecr,
      executor,
    };
  }

  private extractRequestId(txResult: { events?: Array<{ parsedJson?: unknown }> | null }): number | null {
    if (!txResult.events) return null;

    for (const event of txResult.events) {
      const json = event.parsedJson as { request_id?: string | number } | undefined;
      if (json?.request_id !== undefined) {
        return Number(json.request_id);
      }
    }
    return null;
  }

  private async callExecutor(
    executor: ExecutorInfo,
    requestId: number,
    prompt: string,
    model: string,
  ): Promise<{ response: string; resultHash: string; executionTimeMs: number; txDigest: string }> {
    const url = executor.endpointUrl.replace(/\/$/, '');

    // Encode prompt as base64 for non-TEE executors
    const encodedPrompt = Buffer.from(prompt, 'utf-8').toString('base64');

    const res = await fetch(`${url}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId,
        encryptedPrompt: encodedPrompt,
        model,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Executor returned ${res.status}: ${body}`);
    }

    const data = await res.json() as {
      result?: string;
      resultHash?: string;
      executionTimeMs?: number;
      txDigest?: string;
    };

    if (!data.result) {
      throw new Error('Executor returned empty result');
    }

    return {
      response: data.result,
      resultHash: data.resultHash ?? '',
      executionTimeMs: data.executionTimeMs ?? 0,
      txDigest: data.txDigest ?? '',
    };
  }
}
