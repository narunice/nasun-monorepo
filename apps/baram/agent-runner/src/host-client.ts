/**
 * Host /execute-capability HTTP client (Plan C C2 — replaces the legacy
 * Lambda /execute path for the trader preset).
 *
 * The host (apps/baram/executor-nitro) accepts the encrypted prompt + the
 * AER metadata blocks (envelope/lineage/wake/replay) + an action proposal
 * for the soft-rail preflight + an optional actionCall for atomic
 * settlement. It returns the LLM result, the result hash, and the AER
 * settlement digest.
 *
 * For the trader v1 prototype `actionCall` is always null — swaps stay
 * agent-signed; the AER is a cognition record. See trader-envelope.ts for
 * the rationale.
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

export interface HostExecuteCapabilityInput {
  requestId: number;
  /** Plain prompt text. The host accepts this as a base64-encoded string —
   *  TLS provides transport security in the non-TEE prototype. */
  prompt: string;
  model: string;
  budgetId?: string;
  capabilityId: string;
  /** cap.owner — the user wallet, NOT the agent wallet. */
  walletAddress: string;
  envelope: TraderEnvelopeMeta;
  lineage: TraderLineageMeta;
  wake: TraderWakeMeta;
  replay: TraderReplayMeta;
  /** Cognition AERs MUST pass null. Execution AERs require a non-null
   *  actionCall; the trader prototype does not emit those yet. */
  actionCall: null;
  proposal: {
    eventClass: 1 | 2 | 3;
    actionType: string;
    /** bigint as decimal string — host parses to u64 server-side. */
    paymentAmount: string;
  };
  purpose?: string | null;
  constraints?: string | null;
  triggeredBy?: string | null;
  triggeredAction?: string | null;
}

export interface HostExecuteCapabilityResult {
  success: boolean;
  result?: string;
  resultHash?: string;
  executionTimeMs?: number;
  txDigest?: string;
  capabilityVersion?: string;
  error?: string;
  /** Set to true for HTTP 403 preflight denials (caller may want to log
   *  the reason but should NOT retry). */
  preflightDenied?: boolean;
  /** Host's preflight reason code when preflightDenied=true. */
  preflightReason?: string;
}

/** POST /execute-capability with retry. 4xx responses are NOT retried — they
 *  signal a caller / cap shape problem that won't fix itself. */
export async function executeCapability(
  hostUrl: string,
  apiKey: string,
  input: HostExecuteCapabilityInput,
): Promise<HostExecuteCapabilityResult> {
  const body = JSON.stringify({
    requestId: input.requestId,
    encryptedPrompt: Buffer.from(input.prompt, 'utf-8').toString('base64'),
    model: input.model,
    ...(input.budgetId ? { budgetId: input.budgetId } : {}),
    capabilityId: input.capabilityId,
    walletAddress: input.walletAddress,
    envelope: input.envelope,
    lineage: input.lineage,
    wake: input.wake,
    replay: input.replay,
    actionCall: input.actionCall,
    proposal: input.proposal,
    ...(input.purpose ? { purpose: input.purpose } : {}),
    ...(input.constraints ? { constraints: input.constraints } : {}),
    ...(input.triggeredBy ? { triggeredBy: input.triggeredBy } : {}),
    ...(input.triggeredAction ? { triggeredAction: input.triggeredAction } : {}),
  });

  let lastError: string | undefined;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(`${hostUrl}/execute-capability`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body,
        signal: controller.signal,
      });

      // 403 = preflight denial (cap revoked/paused/owner mismatch/etc.).
      // The host already encoded the reason; surface it without retry.
      if (response.status === 403) {
        const data = await safeJson(response);
        return {
          success: false,
          preflightDenied: true,
          preflightReason: typeof data?.reason === 'string' ? data.reason : undefined,
          error: typeof data?.error === 'string' ? data.error : 'Capability preflight denied',
        };
      }

      if (response.status >= 400 && response.status < 500) {
        // Other 4xx (400 shape error, 404 request not found, etc.) — these
        // do not improve on retry.
        const text = await response.text().catch(() => 'Unknown error');
        const truncated = text.length > 200 ? text.slice(0, 200) + '...' : text;
        return { success: false, error: `HTTP ${response.status}: ${truncated}` };
      }

      if (!response.ok) {
        const text = await response.text().catch(() => 'Unknown error');
        const truncated = text.length > 200 ? text.slice(0, 200) + '...' : text;
        lastError = `HTTP ${response.status}: ${truncated}`;
        if (attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * attempt);
          continue;
        }
        return { success: false, error: lastError };
      }

      const data = (await response.json()) as Record<string, unknown>;
      return {
        success: true,
        result: typeof data.result === 'string' ? data.result : undefined,
        resultHash: typeof data.resultHash === 'string' ? data.resultHash : undefined,
        executionTimeMs:
          typeof data.executionTimeMs === 'number' ? data.executionTimeMs : undefined,
        txDigest: typeof data.txDigest === 'string' ? data.txDigest : undefined,
        capabilityVersion:
          typeof data.capabilityVersion === 'string' ? data.capabilityVersion : undefined,
      };
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

  return { success: false, error: lastError ?? 'All retries exhausted' };
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
