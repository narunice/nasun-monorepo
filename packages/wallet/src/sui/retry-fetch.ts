/**
 * Retry + exponential backoff wrapper for SUI JSON-RPC HTTP transport.
 *
 * Wraps the global `fetch` and retries on 5xx/network errors so that the
 * Nasun Devnet Fullnode restart window (~15s, 0/8/16 UTC) is absorbed
 * transparently. Read-only RPC methods are retried; writes
 * (executeTransactionBlock) are never retried to avoid double-spend risk.
 *
 * Inject into SuiClient via SuiHTTPTransport:
 *
 *   new SuiClient({
 *     transport: new SuiHTTPTransport({ url, fetch: createRetryFetch() }),
 *   });
 */

const RETRY_STATUSES = new Set([502, 503, 504]);

// Read-only JSON-RPC methods. Writes (executeTransactionBlock) are excluded.
// Matches methods like: sui_getObject, suix_queryEvents, sui_dryRunTransactionBlock,
// sui_devInspectTransactionBlock, sui_tryMultiGetPastObjects, sui_multiGetObjects.
const RETRIABLE_METHOD_REGEX = /^sui[x]?_(get|multi|query|dryRun|devInspect|tryMulti)/;

export interface RetryFetchOptions {
  /** Max total attempts including the first. Default 5 (~6.2s max wait). */
  maxAttempts?: number;
  /** Initial delay in milliseconds. Default 200. */
  initialDelayMs?: number;
  /** Backoff multiplier per attempt. Default 2. */
  backoffFactor?: number;
  /** Jitter ratio (±). 0.2 means ±20%. Default 0.2. */
  jitter?: number;
  /** Called once per retry. Defaults to console.warn in dev, noop in prod. */
  onRetry?: (info: { method: string; attempt: number; delayMs: number; reason: string }) => void;
  /** Fetch implementation. Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
}

function defaultOnRetry(info: { method: string; attempt: number; delayMs: number; reason: string }): void {
  // Dev-only log. In browsers Vite sets import.meta.env.DEV, in Node we fall back to NODE_ENV.
  const isDev =
    (typeof import.meta !== 'undefined' && (import.meta as { env?: { DEV?: boolean } }).env?.DEV) ||
    (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production');
  if (isDev) {
    console.warn(
      `[RPC retry] ${info.method} attempt=${info.attempt} delay=${Math.round(info.delayMs)}ms reason=${info.reason}`
    );
  }
}

function parseRpcMethod(body: BodyInit | null | undefined): string | null {
  if (typeof body !== 'string') return null;
  try {
    const parsed = JSON.parse(body);
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
 * Build a fetch function that retries on 502/503/504 and network errors
 * for read-only SUI JSON-RPC calls.
 */
export function createRetryFetch(options: RetryFetchOptions = {}): typeof fetch {
  const {
    maxAttempts = 5,
    initialDelayMs = 200,
    backoffFactor = 2,
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
    const signal = init?.signal ?? undefined;

    let delay = initialDelayMs;
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const res = await resolvedFetch(input, init);
        if (res.ok) return res;
        if (!RETRY_STATUSES.has(res.status) || attempt === attempts) return res;
        lastError = `HTTP ${res.status}`;
        // Drain body to free the connection before retry.
        try {
          await res.arrayBuffer();
        } catch {
          // best-effort; ignore drain failures
        }
      } catch (err) {
        if (signal?.aborted) throw err;
        lastError = err;
        if (attempt === attempts) throw err;
      }

      const jitterFactor = 1 - jitter + Math.random() * jitter * 2;
      const wait = delay * jitterFactor;
      onRetry({
        method: method ?? '(unknown)',
        attempt,
        delayMs: wait,
        reason: typeof lastError === 'string' ? lastError : (lastError as Error)?.message ?? 'network error',
      });
      await sleep(wait, signal);
      delay *= backoffFactor;
    }

    // Unreachable: either returned a Response or threw above.
    throw new Error('retryFetch: exhausted attempts without result');
  };
}
