// Shared Alchemy getOwnersForContract holder-set fetch. Two callers:
//   - handlers-ecosystem.ts: on-demand activate (single-wallet lookup via a module-cached holder set).
//   - eth-ownership-job.ts: weekly Ship-2 collector (full holder set intersected with registered wallets).
// Byte-parity with the lambda's two independent copies (ecosystem-api/eth-rpc getErc1155TokenIds +
// nft-snapshot/eth-collector-v2 fetchContractOwners): paginate getOwnersForContract?withTokenBalances=true
// -> { ownerAddress(lower-cased): tokenId[] }. The box unifies them in ONE place so the on-demand activate
// path and the daily/weekly collector can never diverge on holder-set semantics.

import { ECOSYSTEM } from './config';

interface AlchemyOwnersResponse {
  owners?: Array<{ ownerAddress: string; tokenBalances: Array<{ tokenId: string; balance: string }> }>;
  pageKey?: string;
}

// Hard cap on pages. A closed ~400-holder GP contract is ~4 pages (getOwnersForContract returns up to ~100/
// page); 50 leaves ample headroom while bounding a runaway loop (the long-lived box has no per-invoke ceiling
// the lambda relied on). Tripping it THROWS -> the collector counts a fetch-failure (skip cleanup/verify) and
// the on-demand path 503s, rather than spinning forever.
const MAX_PAGES = 50;

// Fetch the full on-chain holder set for an ERC-1155/721 contract, lower-casing owner addresses and
// concatenating token ids across pages. THROWS when the Alchemy key is unset (caller maps to 503 / abort),
// any page returns non-2xx, a 2xx page lacks an owners array (a malformed-but-200 body must NOT be treated as
// an authoritative empty set), the page cap is exceeded, or a pageKey repeats (a non-advancing cursor would
// otherwise loop forever) -- a partial/looping holder set must NOT be returned as truncated-but-clean, since
// the collector's fetch-failure guard relies on this throwing.
export async function fetchHoldersForContract(contract: string): Promise<Record<string, string[]>> {
  if (!ECOSYSTEM.alchemyApiKey) throw new Error('ALCHEMY_API_KEY not configured');
  const out: Record<string, string[]> = {};
  const seenPageKeys = new Set<string>();
  let pageKey: string | undefined;
  let page = 0;
  do {
    if (page >= MAX_PAGES) throw new Error(`getOwnersForContract exceeded ${MAX_PAGES} pages (suspected pagination loop)`);
    if (pageKey) {
      if (seenPageKeys.has(pageKey)) throw new Error('getOwnersForContract returned a repeating pageKey (pagination loop)');
      seenPageKeys.add(pageKey);
    }
    const params = new URLSearchParams({ contractAddress: contract, withTokenBalances: 'true' });
    if (pageKey) params.set('pageKey', pageKey);
    const url = `${ECOSYSTEM.alchemyNftBaseUrl}/${ECOSYSTEM.alchemyApiKey}/getOwnersForContract?${params}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(ECOSYSTEM.holderFetchTimeoutMs) });
    if (!res.ok) throw new Error(`getOwnersForContract HTTP ${res.status}`);
    const data = (await res.json()) as AlchemyOwnersResponse;
    if (!Array.isArray(data.owners)) throw new Error('getOwnersForContract returned no owners array (malformed 2xx body)');
    for (const o of data.owners) {
      const a = o.ownerAddress.toLowerCase();
      const ids = o.tokenBalances.map((tb) => tb.tokenId);
      if (out[a]) out[a].push(...ids);
      else out[a] = ids;
    }
    pageKey = data.pageKey;
    page++;
  } while (pageKey);
  return out;
}
