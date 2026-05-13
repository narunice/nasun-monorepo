/**
 * Host /infer + /execute-capability HTTP client (Plan C C3-v2 §5.1).
 *
 * Two-call shape:
 *
 *   1. POST /infer        — encrypted prompt → enclave → result + HMAC token
 *   2. POST /execute-capability — parsed decision → AER + (optional) atomic swap
 *
 * The HMAC token (spendToken, nonce, expiresAt) binds the LLM result to
 * the (requestId, walletAddress) identity; a tampered resultHash or
 * replayed token fails closed on the host side. See DV8.
 *
 * Trader cognition-only flow (HOLD): /infer → parse → /execute-capability
 * with envelope=cognition, actionCall=null, escrow=undefined.
 *
 * Trader execution flow (BUY/SELL): same prefix + actionCall=swap spec,
 * escrow={objectId, initialSharedVersion, capabilityId}, spend={asset, amount}.
 */

import type {
  TraderEnvelopeMeta,
  TraderLineageMeta,
  TraderWakeMeta,
  TraderReplayMeta,
} from './presets/trader-envelope.js';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;
const FETCH_TIMEOUT_MS = 60_000;

// ============================================================================
// /infer
// ============================================================================

export interface InferRequest {
  requestId: number;
  /** Plain prompt text. Wrapped as base64 for transport. TLS provides
   *  transport security in the non-TEE prototype. */
  prompt: string;
  model: string;
  capabilityId: string;
  walletAddress: string;
}

export interface InferResponse {
  success: boolean;
  result?: string;
  resultHash?: string;
  executionTimeMs?: number;
  spendToken?: string;
  nonce?: string;
  expiresAt?: number;
  preflightDenied?: boolean;
  preflightReason?: string;
  error?: string;
}

export async function infer(
  hostUrl: string,
  apiKey: string,
  input: InferRequest,
): Promise<InferResponse> {
  const body = JSON.stringify({
    requestId: input.requestId,
    encryptedPrompt: Buffer.from(input.prompt, 'utf-8').toString('base64'),
    model: input.model,
    capabilityId: input.capabilityId,
    walletAddress: input.walletAddress,
  });
  return postWithRetry<InferResponse>(`${hostUrl}/infer`, apiKey, body, (data) => ({
    success: true,
    result: typeof data.result === 'string' ? data.result : undefined,
    resultHash: typeof data.resultHash === 'string' ? data.resultHash : undefined,
    executionTimeMs:
      typeof data.executionTimeMs === 'number' ? data.executionTimeMs : undefined,
    spendToken: typeof data.spendToken === 'string' ? data.spendToken : undefined,
    nonce: typeof data.nonce === 'string' ? data.nonce : undefined,
    expiresAt: typeof data.expiresAt === 'number' ? data.expiresAt : undefined,
  }));
}

// ============================================================================
// /execute-capability
// ============================================================================

export interface ActionCallArg {
  kind: 'object' | 'pure' | 'pipe';
  /** kind=object */
  id?: string;
  /** kind=pure (base64) */
  bytes?: string;
  /** kind=pipe */
  from?: 'withdraw_coin' | 'zero_deep';
}

export interface ActionCallSpecWire {
  targetPackage: string;
  module: string;
  fn: string;
  typeArguments: string[];
  args: ActionCallArg[];
}

export interface ExecuteCapabilityRequest {
  requestId: number;
  resultHash: string;
  executionTimeMs: number;
  spendToken: string;
  nonce: string;
  expiresAt: number;
  model: string;
  budgetId?: string;
  capabilityId: string;
  walletAddress: string;
  envelope: TraderEnvelopeMeta;
  lineage: TraderLineageMeta;
  wake: TraderWakeMeta;
  replay: TraderReplayMeta;
  proposal: {
    eventClass: 1 | 2 | 3;
    actionType: string;
    paymentAmount: string;
    exec?: {
      targetPackage: string;
      module: string;
      fn: string;
      inputAssetType: string;
      outputAssetType: string;
      inputAmount: string;
      maxSlippageBps: number;
      poolId: string;
    } | null;
  };
  actionCall?: ActionCallSpecWire | null;
  escrow?: {
    objectId: string;
    initialSharedVersion: string;
    capabilityId: string;
  } | null;
  spend?: { coinAssetType: string; amount: string } | null;
  purpose?: string | null;
  constraints?: string | null;
  triggeredBy?: string | null;
  triggeredAction?: string | null;
}

export interface ExecuteCapabilityResponse {
  success: boolean;
  txDigest?: string;
  capabilityVersion?: string;
  error?: string;
  preflightDenied?: boolean;
  preflightReason?: string;
}

export async function executeCapability(
  hostUrl: string,
  apiKey: string,
  input: ExecuteCapabilityRequest,
): Promise<ExecuteCapabilityResponse> {
  // Build wire body. Coerce bigint-ish fields that the consumer passes
  // as strings already; we don't accept bigints at the interface to
  // keep JSON serialisation honest.
  const body = JSON.stringify({
    requestId: input.requestId,
    resultHash: input.resultHash,
    executionTimeMs: input.executionTimeMs,
    spendToken: input.spendToken,
    nonce: input.nonce,
    expiresAt: input.expiresAt,
    model: input.model,
    ...(input.budgetId ? { budgetId: input.budgetId } : {}),
    capabilityId: input.capabilityId,
    walletAddress: input.walletAddress,
    envelope: input.envelope,
    lineage: input.lineage,
    wake: input.wake,
    replay: input.replay,
    proposal: input.proposal,
    ...(input.actionCall ? { actionCall: input.actionCall } : { actionCall: null }),
    ...(input.escrow ? { escrow: input.escrow } : {}),
    ...(input.spend ? { spend: input.spend } : {}),
    ...(input.purpose ? { purpose: input.purpose } : {}),
    ...(input.constraints ? { constraints: input.constraints } : {}),
    ...(input.triggeredBy ? { triggeredBy: input.triggeredBy } : {}),
    ...(input.triggeredAction ? { triggeredAction: input.triggeredAction } : {}),
  });
  return postWithRetry<ExecuteCapabilityResponse>(
    `${hostUrl}/execute-capability`,
    apiKey,
    body,
    (data) => ({
      success: true,
      txDigest: typeof data.txDigest === 'string' ? data.txDigest : undefined,
      capabilityVersion:
        typeof data.capabilityVersion === 'string' ? data.capabilityVersion : undefined,
    }),
  );
}

// ============================================================================
// Shared transport
// ============================================================================

async function postWithRetry<T extends { success: boolean; preflightDenied?: boolean; preflightReason?: string; error?: string }>(
  url: string,
  apiKey: string,
  body: string,
  successFromJson: (data: Record<string, unknown>) => T,
): Promise<T> {
  let lastError: string | undefined;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body,
        signal: controller.signal,
      });

      if (response.status === 403) {
        const data = await safeJson(response);
        return {
          success: false,
          preflightDenied: true,
          preflightReason: typeof data?.reason === 'string' ? data.reason : undefined,
          error: typeof data?.error === 'string' ? data.error : 'preflight denied',
        } as T;
      }
      if (response.status >= 400 && response.status < 500) {
        const text = await response.text().catch(() => 'Unknown error');
        const truncated = text.length > 200 ? text.slice(0, 200) + '...' : text;
        return { success: false, error: `HTTP ${response.status}: ${truncated}` } as T;
      }
      if (!response.ok) {
        const text = await response.text().catch(() => 'Unknown error');
        const truncated = text.length > 200 ? text.slice(0, 200) + '...' : text;
        lastError = `HTTP ${response.status}: ${truncated}`;
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * attempt);
          continue;
        }
        return { success: false, error: lastError } as T;
      }
      const data = (await response.json()) as Record<string, unknown>;
      return successFromJson(data);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }
  return { success: false, error: lastError ?? 'All retries exhausted' } as T;
}

async function safeJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
