/**
 * Host /infer + /execute-capability HTTP client (PR1.A: split-inference +
 * agent-signed settlement, HOLD-only).
 *
 * Two-call shape:
 *
 *   1. POST /infer              — encrypted prompt → LLM → result + cap version
 *   2. POST /execute-capability — agent-signed settlement intent → AER
 *
 * The HMAC spend-token shape from C3-v2 has been retired. PR1.A binds the
 * settlement via:
 *   - L1 API key (x-api-key, both calls)
 *   - L2 agent wallet signature over the canonical settlement string (sig2,
 *     /execute-capability only — see sig.ts)
 *   - L3 chain verifyRequest (both calls)
 *   - L4 capability owner/version assertion (both calls)
 *
 * actionCall/escrow/spend are reserved (must be null) — PR1.5 will re-enable
 * the atomic swap path once the 5-call PTB is wired.
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
  /** Cap owner address (also the request requester) — Lambda asserts
   *  cap.owner === principalAddress. In the current prod topology this
   *  equals the agent keypair's address; the schema keeps them distinct
   *  for forward compat. */
  principalAddress: string;
  /** sha256 of the prompt, 0x-prefixed 64-char lower hex. Lambda re-checks
   *  this against the on-chain ComputeRequest AND against the locally
   *  decoded encryptedPrompt. */
  promptHash: string;
  /** Caller-asserted cap.version snapshotted at cycle start (u64 decimal). */
  expectedCapabilityVersion: string;
}

export interface InferResponse {
  success: boolean;
  result?: string;
  resultHash?: string;
  capabilityVersion?: string;
  executionTimeMs?: number;
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
    principalAddress: input.principalAddress,
    promptHash: input.promptHash,
    expectedCapabilityVersion: input.expectedCapabilityVersion,
  });
  return postWithRetry<InferResponse>(`${hostUrl}/infer`, apiKey, body, (data) => ({
    success: true,
    result: typeof data.result === 'string' ? data.result : undefined,
    resultHash: typeof data.resultHash === 'string' ? data.resultHash : undefined,
    capabilityVersion:
      typeof data.capabilityVersion === 'string' ? data.capabilityVersion : undefined,
    executionTimeMs:
      typeof data.executionTimeMs === 'number' ? data.executionTimeMs : undefined,
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
  promptHash: string;                   // 0x<64 hex lower>
  resultHash: string;                   // 0x<64 hex lower>
  result: string;                       // Lambda re-hashes to guard host bugs
  executionTimeMs: number;
  model: string;
  budgetId?: string;
  capabilityId: string;
  agentAddress: string;                 // 0x<64 hex> — sig recover target
  principalAddress: string;             // 0x<64 hex> — cap.owner
  expectedCapabilityVersion: string;    // u64 decimal
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
  envelopeHash: string;                 // 0x<64 hex lower> sha256(canonicalJson(envelope))
  actionCallHash: string;               // PR1.A: 0x00..00 — sig-covered slot for PR1.5 swap path
  sig2: string;                         // base64 personal-message signature over canonicalSettle()
  // PR1.A: callers MUST pass null. Lambda 400s on non-null actionCall with
  // reason='swap_in_pr1_5'. Typed as optional/nullable so the dead PR1.5
  // swap path in manual-execution still compiles; the runtime guard at
  // entry blocks reaching the Lambda anyway.
  actionCall: ActionCallSpecWire | null;
  escrow: { objectId: string; initialSharedVersion: string; capabilityId: string } | null;
  spend: { coinAssetType: string; amount: string } | null;
  purpose?: string | null;
  constraints?: string | null;
  triggeredBy?: string | null;
  triggeredAction?: string | null;
}

export interface ExecuteCapabilityResponse {
  success: boolean;
  txDigest?: string;
  capabilityVersion?: string;
  resultHash?: string;
  executionTimeMs?: number;
  error?: string;
  preflightDenied?: boolean;
  preflightReason?: string;
}

export async function executeCapability(
  hostUrl: string,
  apiKey: string,
  input: ExecuteCapabilityRequest,
): Promise<ExecuteCapabilityResponse> {
  const body = JSON.stringify({
    requestId: input.requestId,
    promptHash: input.promptHash,
    resultHash: input.resultHash,
    result: input.result,
    executionTimeMs: input.executionTimeMs,
    model: input.model,
    ...(input.budgetId ? { budgetId: input.budgetId } : {}),
    capabilityId: input.capabilityId,
    agentAddress: input.agentAddress,
    principalAddress: input.principalAddress,
    expectedCapabilityVersion: input.expectedCapabilityVersion,
    envelope: input.envelope,
    lineage: input.lineage,
    wake: input.wake,
    replay: input.replay,
    proposal: input.proposal,
    envelopeHash: input.envelopeHash,
    actionCallHash: input.actionCallHash,
    sig2: input.sig2,
    actionCall: null,
    escrow: null,
    spend: null,
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
      resultHash: typeof data.resultHash === 'string' ? data.resultHash : undefined,
      executionTimeMs:
        typeof data.executionTimeMs === 'number' ? data.executionTimeMs : undefined,
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
