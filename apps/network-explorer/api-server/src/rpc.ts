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

export async function rpcCall<T>(method: string, params: unknown[] = []): Promise<T> {
  const id = ++reqId;
  const res = await fetch(SUI_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    signal: AbortSignal.timeout(10_000),
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
    const result = await rpcCall<TxQueryResult>('suix_queryTransactionBlocks', [
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
