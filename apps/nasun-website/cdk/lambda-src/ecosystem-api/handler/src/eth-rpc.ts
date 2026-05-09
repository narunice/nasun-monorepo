/**
 * On-demand NFT ownership helpers for the activate flow.
 *
 * Two code paths because cheap eth_call balanceOf(address) only works for
 * ERC-721. ERC-1155 uses balanceOf(address,uint256) and reverts on the 721
 * selector, which is what broke Genesis Pass activation in production.
 *
 * Cost minimization:
 *   - ERC-721: eth_call balanceOf (26 CU) per fallback. Same as before.
 *   - ERC-1155: getOwnersForContract (~150 CU) once per FRESHNESS_MS, cached
 *     globally in DDB and shared across all activate attempts. Avoids paying
 *     per-wallet NFT API cost while still handling holders the daily snapshot
 *     hasn't caught up to yet (e.g. just-purchased GP).
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || "";
const ALCHEMY_RPC_BASE_URL =
  process.env.ALCHEMY_BASE_URL || "https://eth-mainnet.g.alchemy.com/v2";
const ALCHEMY_NFT_BASE_URL =
  process.env.ALCHEMY_NFT_BASE_URL || "https://eth-mainnet.g.alchemy.com/nft/v3";
const NFT_OWNERSHIP_TABLE = process.env.NFT_OWNERSHIP_TABLE_NAME!;
const TIMEOUT_MS = 8_000;
const HOLDER_CACHE_FRESHNESS_MS = 60 * 60 * 1000; // 1h
const HOLDER_CACHE_FETCH_TIMEOUT_MS = 30_000;

// ERC-721 / ERC-20 balanceOf(address) selector
const BALANCE_OF_SELECTOR = "0x70a08231";

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

interface JsonRpcResponse {
  result?: string;
  error?: { code: number; message: string };
}

/**
 * ERC-721 balanceOf(owner). Throws on RPC failure. Returns 0 for non-holders.
 * Calling this on an ERC-1155 contract reverts; use getErc1155TokenIds.
 */
export async function getErc721Balance(
  wallet: string,
  contractAddress: string,
): Promise<number> {
  if (!ALCHEMY_API_KEY) {
    throw new Error("ALCHEMY_API_KEY not configured");
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    throw new Error(`Invalid wallet address: ${wallet}`);
  }

  const owner = wallet.toLowerCase().replace(/^0x/, "").padStart(64, "0");
  const data = `${BALANCE_OF_SELECTOR}${owner}`;

  const res = await fetch(`${ALCHEMY_RPC_BASE_URL}/${ALCHEMY_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: contractAddress, data }, "latest"],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`eth_call HTTP ${res.status}`);
  }

  const json = (await res.json()) as JsonRpcResponse;
  if (json.error) {
    throw new Error(`eth_call error: ${json.error.message}`);
  }
  if (!json.result) {
    throw new Error("eth_call returned empty result");
  }

  const count = Number.parseInt(json.result, 16);
  if (!Number.isFinite(count) || count < 0) {
    throw new Error(`eth_call returned invalid balance: ${json.result}`);
  }
  return count;
}

/**
 * Return the list of ERC-1155 token ids `wallet` holds in `contractAddress`.
 * Empty array means non-holder.
 *
 * Uses a single getOwnersForContract call cached globally in DDB so that all
 * concurrent activate attempts share one Alchemy call per FRESHNESS window.
 * Designed for closed/finite collections (Genesis Pass: ~400 holders).
 */
export async function getErc1155TokenIds(
  wallet: string,
  contractAddress: string,
): Promise<string[]> {
  if (!ALCHEMY_API_KEY) {
    throw new Error("ALCHEMY_API_KEY not configured");
  }
  const lowerWallet = wallet.toLowerCase();
  const lowerContract = contractAddress.toLowerCase();

  const holders = await loadOrRefreshHolderSet(lowerContract);
  return holders[lowerWallet] ?? [];
}

interface HolderCacheRecord {
  pk: string;
  sk: string;
  contractAddress: string;
  holders: Record<string, string[]>; // wallet -> tokenIds
  holderCount: number;
  lastUpdatedAt: string;
  source: "alchemy-getOwnersForContract";
}

async function loadOrRefreshHolderSet(
  contract: string,
): Promise<Record<string, string[]>> {
  const cacheKey = { pk: "ETH#HOLDERS", sk: `CONTRACT#${contract}` };
  const existing = await ddb.send(
    new GetCommand({ TableName: NFT_OWNERSHIP_TABLE, Key: cacheKey }),
  );
  const cached = existing.Item as HolderCacheRecord | undefined;
  if (cached && isFresh(cached.lastUpdatedAt)) {
    return cached.holders;
  }

  // Stale or missing: refetch.
  const holders = await fetchHoldersForContract(contract);
  const record: HolderCacheRecord = {
    ...cacheKey,
    contractAddress: contract,
    holders,
    holderCount: Object.keys(holders).length,
    lastUpdatedAt: new Date().toISOString(),
    source: "alchemy-getOwnersForContract",
  };
  await ddb.send(new PutCommand({ TableName: NFT_OWNERSHIP_TABLE, Item: record }));
  return holders;
}

function isFresh(lastUpdatedAt: string | undefined): boolean {
  if (!lastUpdatedAt) return false;
  const age = Date.now() - new Date(lastUpdatedAt).getTime();
  return Number.isFinite(age) && age < HOLDER_CACHE_FRESHNESS_MS;
}

interface AlchemyOwnersResponse {
  owners: Array<{
    ownerAddress: string;
    tokenBalances: Array<{ tokenId: string; balance: string }>;
  }>;
  pageKey?: string;
}

async function fetchHoldersForContract(
  contract: string,
): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  let pageKey: string | undefined;
  do {
    const params = new URLSearchParams({
      contractAddress: contract,
      withTokenBalances: "true",
    });
    if (pageKey) params.set("pageKey", pageKey);
    const url = `${ALCHEMY_NFT_BASE_URL}/${ALCHEMY_API_KEY}/getOwnersForContract?${params}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(HOLDER_CACHE_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`getOwnersForContract HTTP ${res.status}`);
    }
    const data = (await res.json()) as AlchemyOwnersResponse;
    for (const o of data.owners) {
      const addr = o.ownerAddress.toLowerCase();
      const ids = o.tokenBalances.map((tb) => tb.tokenId);
      const existing = out[addr];
      if (existing) existing.push(...ids);
      else out[addr] = ids;
    }
    pageKey = data.pageKey;
  } while (pageKey);
  return out;
}
