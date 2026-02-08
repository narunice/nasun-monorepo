/**
 * BaramClient — High-level SDK client for Baram AI Settlement Layer
 *
 * Provides programmatic access to Baram's escrow → execution → settlement → AER pipeline.
 * Designed for Node.js agents, CLI tools, and backend services.
 */

import { SuiClient } from '@mysten/sui/client';
import type { Keypair } from '@mysten/sui/cryptography';
import type {
  BaramConfig,
  ExecuteParams,
  ExecuteResult,
  ExecutorInfo,
  AERData,
  TierLevel,
  BudgetInfo,
  CreateBudgetParams,
  ExecuteWithBudgetParams,
  UpdateBudgetConstraintsParams,
} from './types';
import { MODEL_PRICING, EXECUTOR_SELECTION } from './types';
import {
  BaramError,
  NoExecutorError,
  ExecutorApiError,
  TransactionError,
  TimeoutError,
} from './errors';
import { sha256, hexToBytes } from './services/encoding';
import { getNusdcCoins } from './services/coin';
import { fetchExecutors, selectExecutorWeightedRandom } from './services/executor';
import { buildCreateRequestTransaction, buildCancelRequestTransaction } from './services/transaction';
import { fetchAERByRequestId } from './services/aer';
import { encryptForTee, decryptResponse } from './services/tee';
import {
  fetchBudget,
  fetchBudgetsByOwner,
  fetchBudgetsByAgent,
  buildCreateBudgetTransaction,
  buildDepositToBudgetTransaction,
  buildWithdrawFromBudgetTransaction,
  buildDeactivateBudgetTransaction,
  buildUpdateConstraintsTransaction,
  buildCreateRequestWithBudgetTransaction,
} from './services/budget';

export interface BaramClientOptions {
  config: BaramConfig;
  signer: Keypair;
  /** Timeout for executor API calls in ms (default: 30000) */
  executorTimeoutMs?: number;
  /** Interval between AER poll attempts in ms (default: 2000) */
  aerPollIntervalMs?: number;
  /** Number of AER poll retries (default: 3) */
  aerPollRetries?: number;
}

const DEFAULT_EXECUTOR_TIMEOUT_MS = 30_000;
const DEFAULT_AER_POLL_INTERVAL_MS = 2_000;
const DEFAULT_AER_POLL_RETRIES = 3;

export class BaramClient {
  private client: SuiClient;
  private config: BaramConfig;
  private signer: Keypair;
  private address: string;
  private executorTimeoutMs: number;
  private aerPollIntervalMs: number;
  private aerPollRetries: number;

  constructor(options: BaramClientOptions) {
    this.config = options.config;
    this.signer = options.signer;
    this.address = options.signer.toSuiAddress();
    this.client = new SuiClient({ url: options.config.rpcUrl });

    const timeout = options.executorTimeoutMs ?? DEFAULT_EXECUTOR_TIMEOUT_MS;
    const pollInterval = options.aerPollIntervalMs ?? DEFAULT_AER_POLL_INTERVAL_MS;
    const pollRetries = options.aerPollRetries ?? DEFAULT_AER_POLL_RETRIES;

    if (timeout <= 0) throw new BaramError('executorTimeoutMs must be positive', 'INVALID_CONFIG');
    if (pollInterval <= 0) throw new BaramError('aerPollIntervalMs must be positive', 'INVALID_CONFIG');
    if (pollRetries < 0) throw new BaramError('aerPollRetries must be non-negative', 'INVALID_CONFIG');

    this.executorTimeoutMs = timeout;
    this.aerPollIntervalMs = pollInterval;
    this.aerPollRetries = pollRetries;
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
   * Fetch an AER (AI Execution Report) by request ID.
   */
  async getAER(requestId: number): Promise<AERData | null> {
    return fetchAERByRequestId(this.client, this.config, requestId);
  }

  /**
   * Get NUSDC balance for the signer's address.
   * @returns Balance in NUSDC smallest units (1,000,000 = 1 NUSDC)
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
   * 5. Fetch AER (on-chain execution report)
   *
   * @throws {BaramError} if no eligible executor, insufficient balance, or execution fails
   */
  async execute(params: ExecuteParams): Promise<ExecuteResult> {
    const { prompt, model, minTier, teeRequired } = params;

    // Resolve model pricing
    const modelInfo = MODEL_PRICING[model];
    if (!modelInfo) {
      const available = Object.keys(MODEL_PRICING).join(', ');
      throw new BaramError(`Unknown model: ${model}. Available: ${available}`, 'UNKNOWN_MODEL');
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
      throw new NoExecutorError(model, effectiveMinTier);
    }

    throw lastError ?? new NoExecutorError(model, effectiveMinTier);
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

  // ========== Budget Methods (AI Agent Delegation) ==========

  /**
   * Check if Budget functionality is available (contract deployed).
   */
  hasBudgetSupport(): boolean {
    return !!this.config.budget?.packageId;
  }

  /**
   * Get Budget info by object ID.
   */
  async getBudget(budgetId: string): Promise<BudgetInfo | null> {
    return fetchBudget(this.client, this.config, budgetId);
  }

  /**
   * Get all Budgets owned by the signer.
   */
  async getOwnedBudgets(): Promise<BudgetInfo[]> {
    return fetchBudgetsByOwner(this.client, this.config, this.address);
  }

  /**
   * Get all Budgets where the signer is the authorized agent.
   */
  async getAgentBudgets(): Promise<BudgetInfo[]> {
    return fetchBudgetsByAgent(this.client, this.config, this.address);
  }

  /**
   * Create a new Budget for delegating compute spending to an AI agent.
   *
   * @param params - Budget creation parameters
   * @returns Transaction digest and Budget ID
   */
  async createBudget(
    params: CreateBudgetParams
  ): Promise<{ txDigest: string; budgetId: string }> {
    if (!this.config.budget) {
      throw new BaramError('Budget contract not configured', 'BUDGET_NOT_CONFIGURED');
    }

    const coins = await getNusdcCoins(
      this.client,
      this.address,
      params.deposit,
      this.config.tokens.nusdcType
    );

    const tx = buildCreateBudgetTransaction(this.config, params, coins);
    const result = await this.client.signAndExecuteTransaction({
      transaction: tx,
      signer: this.signer,
      options: { showEvents: true, showObjectChanges: true },
    });

    // Extract Budget ID from created objects (not BudgetReceipt)
    let budgetId = '';
    if (result.objectChanges) {
      for (const change of result.objectChanges) {
        if (
          change.type === 'created' &&
          change.objectType?.endsWith('::budget::Budget')
        ) {
          budgetId = change.objectId;
          break;
        }
      }
    }

    return { txDigest: result.digest, budgetId };
  }

  /**
   * Deposit additional NUSDC to an existing Budget.
   */
  async depositToBudget(budgetId: string, amount: number): Promise<string> {
    if (!this.config.budget) {
      throw new BaramError('Budget contract not configured', 'BUDGET_NOT_CONFIGURED');
    }

    const coins = await getNusdcCoins(
      this.client,
      this.address,
      amount,
      this.config.tokens.nusdcType
    );

    const tx = buildDepositToBudgetTransaction(this.config, budgetId, amount, coins);
    const result = await this.client.signAndExecuteTransaction({
      transaction: tx,
      signer: this.signer,
    });

    return result.digest;
  }

  /**
   * Withdraw NUSDC from a Budget (owner only).
   */
  async withdrawFromBudget(budgetId: string, amount: number): Promise<string> {
    if (!this.config.budget) {
      throw new BaramError('Budget contract not configured', 'BUDGET_NOT_CONFIGURED');
    }

    const tx = buildWithdrawFromBudgetTransaction(this.config, budgetId, amount);
    const result = await this.client.signAndExecuteTransaction({
      transaction: tx,
      signer: this.signer,
    });

    return result.digest;
  }

  /**
   * Deactivate a Budget and withdraw all remaining funds (owner only).
   */
  async deactivateBudget(budgetId: string): Promise<string> {
    if (!this.config.budget) {
      throw new BaramError('Budget contract not configured', 'BUDGET_NOT_CONFIGURED');
    }

    const tx = buildDeactivateBudgetTransaction(this.config, budgetId);
    const result = await this.client.signAndExecuteTransaction({
      transaction: tx,
      signer: this.signer,
    });

    return result.digest;
  }

  /**
   * Update Budget constraints (owner only).
   */
  async updateBudgetConstraints(params: UpdateBudgetConstraintsParams): Promise<string> {
    if (!this.config.budget) {
      throw new BaramError('Budget contract not configured', 'BUDGET_NOT_CONFIGURED');
    }

    const tx = buildUpdateConstraintsTransaction(this.config, params);
    const result = await this.client.signAndExecuteTransaction({
      transaction: tx,
      signer: this.signer,
    });

    return result.digest;
  }

  /**
   * Execute an AI inference request using Budget delegation.
   *
   * This is for AI agents that have been granted a Budget by a user.
   * The agent calls this method to spend from the delegated Budget.
   *
   * @throws {BaramError} if Budget not found, expired, or constraints violated
   */
  async executeWithBudget(params: ExecuteWithBudgetParams): Promise<ExecuteResult> {
    if (!this.config.budget) {
      throw new BaramError('Budget contract not configured', 'BUDGET_NOT_CONFIGURED');
    }

    const { budgetId, prompt, model, minTier, teeRequired } = params;

    // Verify budget exists and agent is authorized
    const budget = await this.getBudget(budgetId);
    if (!budget) {
      throw new BaramError(`Budget not found: ${budgetId}`, 'BUDGET_NOT_FOUND');
    }
    if (budget.agent !== this.address) {
      throw new BaramError('Not authorized agent for this budget', 'BUDGET_NOT_AUTHORIZED');
    }
    if (!budget.isActive) {
      throw new BaramError('Budget is deactivated', 'BUDGET_INACTIVE');
    }
    if (budget.isExpired) {
      throw new BaramError('Budget is expired', 'BUDGET_EXPIRED');
    }

    // Check model allowlist
    if (budget.allowedModels.length > 0 && !budget.allowedModels.includes(model)) {
      throw new BaramError(`Model ${model} not allowed by budget`, 'MODEL_NOT_ALLOWED');
    }

    // Resolve model pricing
    const modelInfo = MODEL_PRICING[model];
    if (!modelInfo) {
      throw new BaramError(`Unknown model: ${model}`, 'UNKNOWN_MODEL');
    }
    const price = modelInfo.price;

    // Check balance
    if (budget.balance < price) {
      throw new BaramError(
        `Insufficient budget balance: ${budget.balance} < ${price}`,
        'INSUFFICIENT_BUDGET'
      );
    }

    // Fetch executors and select one
    const executors = await this.getExecutors();
    const effectiveMinTier: TierLevel = minTier ?? (teeRequired ? 1 : EXECUTOR_SELECTION.MIN_TIER);

    // Filter by budget's allowed executors if specified
    let filteredExecutors = executors;
    if (budget.allowedExecutors.length > 0) {
      filteredExecutors = executors.filter(e =>
        budget.allowedExecutors.includes(e.operator)
      );
    }

    const selectedExecutor = selectExecutorWeightedRandom(
      filteredExecutors,
      new Set(),
      effectiveMinTier,
      model
    );

    if (!selectedExecutor) {
      throw new NoExecutorError(model, effectiveMinTier);
    }

    // Check executor allowlist
    if (
      budget.allowedExecutors.length > 0 &&
      !budget.allowedExecutors.includes(selectedExecutor.operator)
    ) {
      throw new BaramError(
        `Executor ${selectedExecutor.operator} not allowed by budget`,
        'EXECUTOR_NOT_ALLOWED'
      );
    }

    // Hash the prompt
    const promptHashHex = await sha256(prompt);
    const promptHashBytes = hexToBytes(promptHashHex);

    // Build and submit create_request_with_budget transaction
    const tx = buildCreateRequestWithBudgetTransaction(
      this.config,
      budgetId,
      promptHashBytes,
      model,
      selectedExecutor.operator
    );

    const txResult = await this.client.signAndExecuteTransaction({
      transaction: tx,
      signer: this.signer,
      options: { showEvents: true },
    });

    // Extract requestId from event
    const requestId = this.extractRequestId(txResult);
    if (requestId === null) {
      throw new TransactionError(
        'Failed to extract requestId from transaction events',
        txResult.digest
      );
    }

    // Call executor API
    let response: string;
    let resultHash: string;
    let executionTimeMs: number;
    let txDigest: string;
    let teeEncrypted = false;

    try {
      const execResult = await this.callExecutor(
        selectedExecutor,
        requestId,
        prompt,
        model
      );
      response = execResult.response;
      resultHash = execResult.resultHash;
      executionTimeMs = execResult.executionTimeMs;
      txDigest = execResult.txDigest;
      teeEncrypted = execResult.teeEncrypted;
    } catch (err) {
      // Note: Budget requests cannot be cancelled by agent
      // The Budget owner can cancel or funds will timeout
      throw err;
    }

    // Fetch AER
    let aer: AERData | null = null;
    for (let i = 0; i < this.aerPollRetries; i++) {
      aer = await this.getAER(requestId);
      if (aer) break;
      await new Promise(resolve => setTimeout(resolve, this.aerPollIntervalMs));
    }

    return {
      requestId,
      response,
      resultHash,
      txDigest,
      executionTimeMs,
      aer,
      executor: selectedExecutor,
      teeEncrypted,
    };
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
      throw new TransactionError('Failed to extract requestId from transaction events', txResult.digest);
    }

    // 5. Call executor API
    let response: string;
    let resultHash: string;
    let executionTimeMs: number;
    let txDigest: string;

    let teeEncrypted = false;
    try {
      const execResult = await this.callExecutor(executor, requestId, prompt, model);
      response = execResult.response;
      resultHash = execResult.resultHash;
      executionTimeMs = execResult.executionTimeMs;
      txDigest = execResult.txDigest;
      teeEncrypted = execResult.teeEncrypted;
    } catch (err) {
      // Auto-cancel on executor failure to release escrow
      try {
        await this.cancel(requestId);
      } catch {
        // Cancel may fail if already timed out — escrow auto-refunds after timeout
      }
      throw err;
    }

    // 6. Fetch AER (may need a short delay for on-chain propagation)
    let aer: AERData | null = null;
    for (let i = 0; i < this.aerPollRetries; i++) {
      aer = await this.getAER(requestId);
      if (aer) break;
      await new Promise(resolve => setTimeout(resolve, this.aerPollIntervalMs));
    }

    return {
      requestId,
      response,
      resultHash,
      txDigest,
      executionTimeMs,
      aer,
      executor,
      teeEncrypted,
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
  ): Promise<{ response: string; resultHash: string; executionTimeMs: number; txDigest: string; teeEncrypted: boolean }> {
    // Validate executor URL to prevent SSRF
    const rawUrl = executor.endpointUrl.replace(/\/$/, '');
    try {
      const parsed = new URL(rawUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new BaramError(`Invalid executor URL protocol: ${parsed.protocol}`, 'INVALID_EXECUTOR_URL');
      }
    } catch (err) {
      if (err instanceof BaramError) throw err;
      throw new BaramError(`Invalid executor URL: ${rawUrl}`, 'INVALID_EXECUTOR_URL');
    }
    const url = rawUrl;

    // TEE executors: RSA-OAEP + AES-256-GCM E2E encryption
    // Non-TEE executors: Base64 encoding only
    const needsTee = executor.teeType > 0;
    let encodedPrompt: string;
    let aesKeyBytes: Uint8Array | null = null;

    if (needsTee) {
      const result = await encryptForTee(prompt, url);
      encodedPrompt = result.encrypted;
      aesKeyBytes = result.aesKeyBytes;
    } else {
      encodedPrompt = Buffer.from(prompt, 'utf-8').toString('base64');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.executorTimeoutMs);

    let res: Response;
    try {
      res = await fetch(`${url}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId,
          encryptedPrompt: encodedPrompt,
          model,
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new TimeoutError('Executor API call', this.executorTimeoutMs);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new ExecutorApiError(res.status, body);
    }

    const data = await res.json() as {
      result?: string;
      encrypted?: boolean;
      resultHash?: string;
      executionTimeMs?: number;
      txDigest?: string;
    };

    if (!data.result) {
      throw new ExecutorApiError(200, 'Executor returned empty result');
    }

    // Decrypt E2E-encrypted response from TEE executor
    let response = data.result;
    if (data.encrypted && aesKeyBytes) {
      try {
        response = await decryptResponse(response, aesKeyBytes);
      } finally {
        aesKeyBytes.fill(0);
      }
    }

    return {
      response,
      resultHash: data.resultHash ?? '',
      executionTimeMs: data.executionTimeMs ?? 0,
      txDigest: data.txDigest ?? '',
      teeEncrypted: needsTee,
    };
  }
}
