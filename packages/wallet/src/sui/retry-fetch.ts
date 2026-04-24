/**
 * Retry + exponential backoff wrapper for SUI JSON-RPC HTTP transport.
 *
 * Wraps the global `fetch` and retries on 5xx/429/network errors so that the
 * Nasun Devnet Fullnode restart window (~15s, 0/8/16 UTC) is absorbed
 * transparently. Read-only RPC methods are retried; writes
 * (executeTransactionBlock) are never retried to avoid double-spend risk.
 *
 * Effective coverage with defaults (maxAttempts=7, initialDelayMs=200,
 * backoffFactor=2, capDelayMs=2000): final attempt fires at t~7.0s.
 * The last delay is intentionally not slept (attempt == maxAttempts exits
 * the loop), so cumulative wait = sum of first (N-1) delays.
 *
 * Inject into SuiClient via SuiHTTPTransport:
 *
 *   new SuiClient({
 *     transport: new SuiHTTPTransport({ url, fetch: createRetryFetch() }),
 *   });
 */

// 429 included: after a restart, clients often get throttled as they reconnect.
const RETRY_STATUSES = new Set([429, 502, 503, 504]);

// Read-only JSON-RPC methods. Writes (executeTransactionBlock) are excluded.
// Matches methods like: sui_getObject, suix_queryEvents, sui_dryRunTransactionBlock,
// sui_devInspectTransactionBlock, sui_tryMultiGetPastObjects, sui_multiGetObjects.
const RETRIABLE_METHOD_REGEX = /^sui[x]?_(get|multi|query|dryRun|devInspect|tryMulti)/;

// Upper bound for server-supplied Retry-After. Prevents a malformed or
// adversarial header from stalling the UI for minutes.
const MAX_RETRY_AFTER_MS = 10_000;

export interface RetryFetchOptions {
  /** Max total attempts including the first. Default 7. */
  maxAttempts?: number;
  /** Initial delay in milliseconds. Default 200. */
  initialDelayMs?: number;
  /** Backoff multiplier per attempt. Default 2. */
  backoffFactor?: number;
  /** Per-step delay cap in milliseconds. Default 2000. */
  capDelayMs?: number;
  /** Jitter ratio (±). 0.2 means ±20%. Default 0.2. */
  jitter?: number;
  /** Called once per retry. Defaults to console.warn in dev, noop in prod. */
  onRetry?: (info: { method: string; attempt: number; delayMs: number; reason: string }) => void;
  /** Fetch implementation. Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
}

// Vite sets import.meta.env.DEV at build time (true in dev, false in prod bundles).
// In Node (vitest, bots) import.meta.env is undefined, so we fall back to NODE_ENV.
function isDevEnv(): boolean {
  const viteDev = (import.meta as { env?: { DEV?: boolean } }).env?.DEV;
  if (viteDev === true) return true;
  if (viteDev === false) return false;
  return typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
}

function defaultOnRetry(info: { method: string; attempt: number; delayMs: number; reason: string }): void {
  if (!isDevEnv()) return;
  console.warn(
    `[RPC retry] ${info.method} attempt=${info.attempt} delay=${Math.round(info.delayMs)}ms reason=${info.reason}`
  );
}

function parseRpcMethod(body: BodyInit | null | undefined): string | null {
  if (typeof body !== 'string') return null;
  try {
    const parsed = JSON.parse(body);
    // Batch requests: we cannot guarantee every sub-call is idempotent
    // (a batch could mix reads with executeTransactionBlock). Never retry.
    if (Array.isArray(parsed)) return null;
    if (parsed && typeof parsed.method === 'string') return parsed.method;
  } catch {
    // body is not JSON; treat as non-retriable
  }
  return null;
}

function isRetriableMethod(method: string | null): boolean {
  if (!method) return false;
  return RETRIABLE_METHOD_REGEX.test(method);
}

// Parse RFC 7231 Retry-After: either delta-seconds or HTTP-date.
// Returns milliseconds, or null if the header is missing/unparseable.
function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  // Number('') === 0 would otherwise turn a blank header into "retry now".
  // Require at least one digit before accepting delta-seconds.
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  }
  const date = Date.parse(trimmed);
  if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  return null;
}

function isAbortError(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === 'AbortError';
}

function extractSignal(input: RequestInfo | URL, init?: RequestInit): AbortSignal | undefined {
  if (init?.signal) return init.signal;
  if (typeof Request !== 'undefined' && input instanceof Request) return input.signal;
  return undefined;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      signal?.removeEventListener('abort', onAbort);
      reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort);
  });
}

/**
 * Build a fetch function that retries on 429/502/503/504 and network errors
 * for read-only SUI JSON-RPC calls. Respects Retry-After when present.
 */
export function createRetryFetch(options: RetryFetchOptions = {}): typeof fetch {
  const {
    maxAttempts = 7,
    initialDelayMs = 200,
    backoffFactor = 2,
    capDelayMs = 2000,
    jitter = 0.2,
    onRetry = defaultOnRetry,
    fetchImpl,
  } = options;

  const resolvedFetch: typeof fetch =
    fetchImpl ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));

  return async function retryFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const method = parseRpcMethod(init?.body);
    const canRetry = isRetriableMethod(method);
    const attempts = canRetry ? maxAttempts : 1;
    const signal = extractSignal(input, init);

    let delay = initialDelayMs;
    let lastError: unknown;
    let retryAfterMs: number | null = null;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      retryAfterMs = null;
      try {
        const res = await resolvedFetch(input, init);
        if (res.ok) return res;
        if (!RETRY_STATUSES.has(res.status) || attempt === attempts) return res;
        lastError = `HTTP ${res.status}`;
        retryAfterMs = parseRetryAfter(res.headers.get('retry-after'));
        // Drain body to free the connection before retry.
        try {
          await res.arrayBuffer();
        } catch {
          // best-effort; ignore drain failures
        }
      } catch (err) {
        // AbortError propagates immediately regardless of signal state,
        // so an unrelated failure after an abort still gets retry budget.
        if (isAbortError(err)) throw err;
        lastError = err;
        if (attempt === attempts) throw err;
      }

      // Server-supplied Retry-After wins over exponential backoff when present,
      // clamped to MAX_RETRY_AFTER_MS to avoid multi-minute UI stalls.
      const base =
        retryAfterMs != null ? Math.min(retryAfterMs, MAX_RETRY_AFTER_MS) : delay;
      const jitterFactor = 1 - jitter + Math.random() * jitter * 2;
      const wait = base * jitterFactor;
      onRetry({
        method: method ?? '(unknown)',
        attempt,
        delayMs: wait,
        reason: typeof lastError === 'string' ? lastError : (lastError as Error)?.message ?? 'network error',
      });
      await sleep(wait, signal);
      delay = Math.min(delay * backoffFactor, capDelayMs);
    }

    // Unreachable: either returned a Response or threw above.
    throw new Error('retryFetch: exhausted attempts without result', { cause: lastError });
  };
}
