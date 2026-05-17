/**
 * Sui JSON-RPC client with centralized retry+backoff.
 *
 * Port of apps/network-explorer/api-server/src/rpc.ts (2026-05-12 mitigation).
 * Same parameters: 3 attempts, exponential backoff (500ms / 1500ms / 4500ms)
 * with ±20% jitter, honors nginx `Retry-After` up to 5s.
 *
 * Retries 502/503/504, AbortError (timeout), TypeError (network failure).
 * JSON-RPC application errors are NOT retried (deterministic given params).
 */

import { env } from './env.js';

interface JsonRpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

let reqId = 0;

const MAX_RPC_ATTEMPTS = Math.max(1, env.rpc.retryMax);
const RETRY_BASE_MS = 500;
const RETRY_FACTOR = 3;
const RETRY_JITTER = 0.2;
const RETRY_AFTER_CAP_MS = 5000;
const RPC_TIMEOUT_MS = 10_000;

const RETRYABLE_STATUS = new Set([502, 503, 504]);

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
}

function backoffMs(attempt: number): number {
  const base = RETRY_BASE_MS * Math.pow(RETRY_FACTOR, attempt - 1);
  const jitter = 1 + (Math.random() * 2 - 1) * RETRY_JITTER;
  return Math.floor(base * jitter);
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.min(seconds * 1000, RETRY_AFTER_CAP_MS);
}

export async function rpcCall<T>(method: string, params: unknown[] = []): Promise<T> {
  const id = ++reqId;
  let lastErr: unknown;

  for (let attempt = 0; attempt < MAX_RPC_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(env.rpc.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
      });

      if (!res.ok) {
        if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_RPC_ATTEMPTS - 1) {
          const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
          const delay = retryAfter ?? backoffMs(attempt + 1);
          console.warn(
            `[rpc] ${method} ${res.status}, retry ${attempt + 1}/${MAX_RPC_ATTEMPTS} in ${delay}ms`
          );
          await res.text().catch(() => undefined);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw new Error(`RPC HTTP error: ${res.status}`);
      }

      const json = (await res.json()) as JsonRpcResponse<T>;
      if (json.error) {
        throw new Error(`RPC error ${json.error.code}: ${json.error.message}`);
      }
      return json.result as T;
    } catch (err) {
      lastErr = err;
      const retriable =
        isAbortError(err) ||
        err instanceof TypeError ||
        (err instanceof Error && /RPC HTTP error: 50[234]/.test(err.message));
      if (!retriable || attempt >= MAX_RPC_ATTEMPTS - 1) throw err;
      const delay = backoffMs(attempt + 1);
      const reason = err instanceof Error ? err.message : 'unknown';
      console.warn(
        `[rpc] ${method} failed (${reason}), retry ${attempt + 1}/${MAX_RPC_ATTEMPTS} in ${delay}ms`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('RPC exhausted retries');
}

// =============================================================================
// queryEvents helpers (Sui Events API)
// =============================================================================

export interface SuiEventEnvelope<T = unknown> {
  id: { txDigest: string; eventSeq: string };
  packageId: string;
  transactionModule: string;
  sender: string;
  type: string;
  parsedJson: T;
  bcs: string;
  timestampMs?: string;
}

export interface EventCursor {
  txDigest: string;
  eventSeq: string;
}

export interface QueryEventsResult<T = unknown> {
  data: SuiEventEnvelope<T>[];
  nextCursor: EventCursor | null;
  hasNextPage: boolean;
}

/**
 * suix_queryEvents wrapper. Use `MoveEventType` filter to target a single
 * `<originalPackageId>::<module>::<EventName>`.
 */
export async function queryEventsByType<T = unknown>(
  eventType: string,
  cursor: EventCursor | null,
  limit = 50,
  descendingOrder = false
): Promise<QueryEventsResult<T>> {
  return rpcCall<QueryEventsResult<T>>('suix_queryEvents', [
    { MoveEventType: eventType },
    cursor,
    limit,
    descendingOrder,
  ]);
}
