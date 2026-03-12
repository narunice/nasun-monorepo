/**
 * Nasun Devnet RPC Client
 *
 * Provides address discovery (via faucet TX scanning) and
 * per-address daily activity checking. Pattern adapted from
 * apps/network-explorer/api-server/src/rpc.ts
 */

import type { TxQueryResult, TxBlockResponse, CheckpointResponse } from './types';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
const RPC_TIMEOUT_MS = 15_000;
const SUI_ADDRESS_RE = /^0x[0-9a-f]{1,64}$/i;
const MAX_DISCOVERY_PAGES = 200;

// -- Generic RPC caller --

let reqId = 0;

interface JsonRpcResponse<T> {
  jsonrpc: string;
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

async function rpcCall<T>(method: string, params: unknown[] = []): Promise<T> {
  const id = ++reqId;
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`RPC HTTP error: ${res.status}`);
  }

  const json = (await res.json()) as JsonRpcResponse<T>;
  if (json.error) {
    throw new Error(`RPC error ${json.error.code}: ${json.error.message}`);
  }

  return json.result as T;
}

// -- Health check (returns latest checkpoint sequence) --

export async function healthCheck(): Promise<string> {
  const seq = await rpcCall<string>('sui_getLatestCheckpointSequenceNumber');
  if (!seq || Number(seq) <= 0) {
    throw new Error(`RPC health check failed: invalid checkpoint sequence ${seq}`);
  }
  return seq;
}

// -- Checkpoint data --

export async function getCheckpoint(seq: string): Promise<CheckpointResponse> {
  return rpcCall<CheckpointResponse>('sui_getCheckpoint', [seq]);
}

// -- Address discovery from faucet transactions --

export interface DiscoveryResult {
  addresses: string[];
  lastCursor: string | null;
}

/**
 * Discover addresses by scanning faucet-sent transactions.
 * Extracts AddressOwner from created/mutated objects in TX effects.
 * Supports incremental scanning via cursor.
 */
export async function discoverAddressesFromFaucet(
  faucetAddress: string,
  excludedAddresses: Set<string>,
  startCursor: string | null = null,
): Promise<DiscoveryResult> {
  const addresses = new Set<string>();
  let cursor = startCursor;
  let lastCursor: string | null = startCursor;

  for (let page = 0; page < MAX_DISCOVERY_PAGES; page++) {
    const result = await rpcCall<TxQueryResult>('suix_queryTransactionBlocks', [
      { filter: { FromAddress: faucetAddress }, options: { showEffects: true } },
      cursor,
      50,
      false, // ascending for incremental scanning
    ]);

    for (const tx of result.data) {
      const effects = tx.effects;
      if (!effects) continue;
      for (const obj of [...(effects.created ?? []), ...(effects.mutated ?? [])]) {
        const owner = obj.owner?.AddressOwner;
        if (owner && SUI_ADDRESS_RE.test(owner) && !excludedAddresses.has(owner)) {
          addresses.add(owner);
        }
      }
    }

    lastCursor = result.nextCursor;
    if (!result.hasNextPage) break;
    cursor = result.nextCursor;
  }

  return {
    addresses: [...addresses],
    lastCursor,
  };
}

// -- Per-address daily activity check --

/**
 * Check if an address sent any transaction on the given day (UTC).
 * Uses descending order with early termination when TX timestamp < day start.
 */
export async function checkAddressActivity(
  address: string,
  dayStartMs: number,
  dayEndMs: number,
): Promise<boolean> {
  let cursor: string | null = null;

  for (let page = 0; page < 20; page++) {
    const result = await rpcCall<TxQueryResult>('suix_queryTransactionBlocks', [
      { filter: { FromAddress: address }, options: {} },
      cursor,
      50,
      true, // descending: newest first
    ]);

    if (result.data.length === 0) return false;

    // Need timestamps: fetch full TX details
    const digests = result.data.map((tx) => tx.digest);
    const txBlocks = await rpcCall<TxBlockResponse[]>('sui_multiGetTransactionBlocks', [
      digests,
      { showInput: false, showEffects: false },
    ]);

    for (const tx of txBlocks) {
      const ts = Number(tx.timestampMs || 0);
      if (ts >= dayStartMs && ts < dayEndMs) return true;
      if (ts < dayStartMs) return false; // Past target day, stop
    }

    if (!result.hasNextPage) break;
    cursor = result.nextCursor;
  }

  return false;
}

// -- Batch activity check with concurrency --

interface ActivityResult {
  address: string;
  active: boolean;
  error: boolean;
}

/**
 * Check activity for multiple addresses with concurrency limit.
 * Returns per-address results and overall failure count.
 */
export async function checkBatchActivity(
  addresses: string[],
  dayStartMs: number,
  dayEndMs: number,
  concurrency = 10,
): Promise<{ results: ActivityResult[]; failureCount: number }> {
  const results: ActivityResult[] = new Array(addresses.length);
  let failureCount = 0;
  let idx = 0;

  async function worker() {
    while (idx < addresses.length) {
      const i = idx++;
      try {
        const active = await checkAddressActivity(addresses[i], dayStartMs, dayEndMs);
        results[i] = { address: addresses[i], active, error: false };
      } catch (err) {
        console.warn(`Activity check failed for ${addresses[i].slice(0, 16)}:`, err instanceof Error ? err.message : 'Unknown');
        results[i] = { address: addresses[i], active: false, error: true };
        failureCount++;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, addresses.length) }, () => worker()),
  );

  return { results, failureCount };
}
