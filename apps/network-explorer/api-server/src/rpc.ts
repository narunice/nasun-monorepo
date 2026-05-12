/**
 * Shared Sui JSON-RPC client for the Explorer API server.
 * Uses native fetch — no SDK dependency needed.
 */

export const SUI_RPC_URL = process.env.SUI_RPC_URL || 'https://rpc.devnet.nasun.io';

interface JsonRpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

let reqId = 0;

// Retry config for transient upstream errors (502/503/504, timeouts, network errors).
// Fullnode restart windows on devnet are ~10-15s; 3 attempts with exponential
// backoff covers most cases without blocking the caller for too long.
const MAX_RPC_ATTEMPTS = 3;
const RETRY_BASE_MS = 500; // 1st backoff
const RETRY_FACTOR = 3; // 500 -> 1500 -> 3500
const RETRY_JITTER = 0.2; // +/- 20%
const RETRY_AFTER_CAP_MS = 5000; // honor nginx Retry-After up to this cap

const RETRYABLE_STATUS = new Set([502, 503, 504]);

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
}

function backoffMs(attempt: number): number {
  // attempt is 1-indexed retry number (1 = first retry)
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
      const res = await fetch(SUI_RPC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        if (RETRYABLE_STATUS.has(res.status) && attempt < MAX_RPC_ATTEMPTS - 1) {
          const retryAfter = parseRetryAfter(res.headers.get('retry-after'));
          const delay = retryAfter ?? backoffMs(attempt + 1);
          console.warn(
            `RPC ${method} ${res.status}, retry ${attempt + 1}/${MAX_RPC_ATTEMPTS - 1} in ${delay}ms`,
          );
          // Drain body to free the connection before sleeping
          await res.text().catch(() => undefined);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw new Error(`RPC HTTP error: ${res.status}`);
      }

      const json = (await res.json()) as JsonRpcResponse<T>;
      if (json.error) {
        // JSON-RPC application errors are not retried (not idempotent, and
        // typically deterministic given the same params).
        throw new Error(`RPC error ${json.error.code}: ${json.error.message}`);
      }
      return json.result as T;
    } catch (err) {
      lastErr = err;
      // Retry on timeouts and low-level network errors; do not retry on
      // application errors thrown above (they re-enter as Error instances and
      // are caught here, but their message doesn't start with "RPC HTTP error"
      // or match abort).
      const retriable =
        isAbortError(err) ||
        (err instanceof TypeError) || // fetch network failure
        (err instanceof Error && /RPC HTTP error: 50[234]/.test(err.message));
      if (!retriable || attempt >= MAX_RPC_ATTEMPTS - 1) {
        throw err;
      }
      const delay = backoffMs(attempt + 1);
      const reason = err instanceof Error ? err.message : 'unknown';
      console.warn(
        `RPC ${method} failed (${reason}), retry ${attempt + 1}/${MAX_RPC_ATTEMPTS - 1} in ${delay}ms`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('RPC exhausted retries');
}

export interface RpcBalance {
  coinType: string;
  coinObjectCount: number;
  totalBalance: string;
  lockedBalance: Record<string, unknown>;
}

// Sui address format: 0x + 1-64 hex chars
const SUI_ADDRESS_RE = /^0x[0-9a-f]{1,64}$/i;

/**
 * Get native SUI (NSN) balance for an address via RPC.
 */
export async function getBalance(address: string): Promise<RpcBalance> {
  if (!SUI_ADDRESS_RE.test(address)) {
    throw new Error(`Invalid address format: ${address.slice(0, 20)}`);
  }
  return rpcCall<RpcBalance>('suix_getBalance', [address]);
}

// ============================================
// Address Discovery via Transaction Queries
// ============================================

interface TxEffectsOwner {
  AddressOwner?: string;
  ObjectOwner?: string;
  Shared?: unknown;
}

interface TxObjectRef {
  owner: TxEffectsOwner;
}

interface TxQueryResult {
  data: Array<{
    digest: string;
    effects?: {
      created?: TxObjectRef[];
      mutated?: TxObjectRef[];
    };
  }>;
  nextCursor: string | null;
  hasNextPage: boolean;
}

const MAX_DISCOVERY_PAGES = 100;

/**
 * Discover unique addresses by scanning transactions from a given sender.
 * Extracts object owners from created/mutated objects in transaction effects.
 */
async function discoverAddressesFromSender(senderAddress: string): Promise<Set<string>> {
  const addresses = new Set<string>();
  let cursor: string | null = null;

  for (let page = 0; page < MAX_DISCOVERY_PAGES; page++) {
    const result: TxQueryResult = await rpcCall<TxQueryResult>('suix_queryTransactionBlocks', [
      { filter: { FromAddress: senderAddress }, options: { showEffects: true } },
      cursor,
      50,
      false,
    ]);

    for (const tx of result.data) {
      const effects = tx.effects;
      if (!effects) continue;
      for (const obj of [...(effects.created ?? []), ...(effects.mutated ?? [])]) {
        const owner = obj.owner?.AddressOwner;
        if (owner && SUI_ADDRESS_RE.test(owner)) {
          addresses.add(owner);
        }
      }
    }

    if (!result.hasNextPage) break;
    cursor = result.nextCursor;
  }

  return addresses;
}

/**
 * Discover all active addresses on the network by scanning transactions
 * from known genesis/faucet addresses.
 * GENESIS_ADDRESSES env: comma-separated list of addresses to scan.
 */
export async function discoverAddressesViaRpc(): Promise<string[]> {
  const genesisAddrs = (process.env.GENESIS_ADDRESSES || '').split(',').filter(Boolean);
  if (genesisAddrs.length === 0) return [];

  const allAddresses = new Set<string>();
  for (const addr of genesisAddrs) {
    try {
      const found = await discoverAddressesFromSender(addr.trim());
      for (const a of found) allAddresses.add(a);
    } catch (err) {
      console.warn(`Failed to discover addresses from ${addr.slice(0, 16)}:`, err instanceof Error ? err.message : 'Unknown');
    }
  }

  // Remove zero address
  allAddresses.delete('0x0000000000000000000000000000000000000000000000000000000000000000');
  return [...allAddresses];
}
