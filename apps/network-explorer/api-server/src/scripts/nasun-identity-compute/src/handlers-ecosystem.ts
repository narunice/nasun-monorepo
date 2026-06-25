// Ship1 ecosystem NFT-activation + genesis-pass/check de-Lambda (AWS-exit #5).
// Ports cdk/lambda-src/ecosystem-api/handler (status/activate/deactivate + eth-rpc) and
// cdk/lambda-src/genesis-pass/check. Reads run on the compute_ro PG pool (the `sql` instance the server
// owns); the authoritative ecosystem_activations / nft_ownership WRITES delegate to the box identity
// service (:3211) via clients.ts (compute_ro is SELECT-only). On-demand ownership uses Alchemy egress
// (getOwnersForContract) with an IN-MEMORY holder-set cache -- the long-lived box process replaces the
// lambda's DDB ETH#HOLDERS cache, with identical holder-set output (infra adaptation, NOT a behavior
// change). The ONE deliberate behavior delta vs the lambda is the anti-Sybil social gate on activate
// genesis-pass (the lambda's header comment claimed it but the code lacked it; plan §2 Ship1-d).

import type { Sql } from 'postgres';
import { ECOSYSTEM } from './config';
import {
  ecosystemActivationUpsert,
  ecosystemActivationDeactivate,
  nftOwnershipUpsert,
} from './clients';

type Db = Sql<{}>;
type Result = { status: number; body: Record<string, unknown> };

const VALID_NFT_TYPES = ['alliance', 'genesis-pass', 'battalion'] as const;
type NftType = (typeof VALID_NFT_TYPES)[number];

const EVM_REGEX = /^0x[a-fA-F0-9]{40}$/;
const SUI_REGEX = /^0x[a-fA-F0-9]{64}$/;
const ON_DEMAND_FRESHNESS_MS = ECOSYSTEM.onDemandFreshnessMs;

interface NftHolding {
  contractAddress: string;
  chain: string;
  tokenCount: number;
}

// ===================== profile + ownership reads (compute_ro) =====================

interface ProfileRow {
  identity_id: string;
  wallet_address: string | null;
  twitter_id: string | null;
  telegram_user_id: string | null;
  linked_accounts: Record<string, unknown> | null;
  linked_to_primary_id: string | null;
  attributes: Record<string, unknown> | null;
}

async function readProfileRow(sql: Db, schema: string, identityId: string): Promise<ProfileRow | null> {
  const rows = await sql<ProfileRow[]>`
    SELECT identity_id, wallet_address, twitter_id, telegram_user_id,
           linked_accounts, linked_to_primary_id, attributes
    FROM ${sql(schema)}.user_profiles WHERE identity_id = ${identityId}`;
  return rows[0] ?? null;
}

// Returns the box nft_ownership ETH#LATEST attributes jsonb (holdings/source/lastUpdatedAt/totalNftCount)
// for a wallet, or null when no snapshot row exists. The box promotes pk/sk/wallet_address/snapshot_date to
// columns and keeps the rest in attributes, so the lambda's "walletRecord" == this attributes object.
async function readOwnershipAttrs(sql: Db, schema: string, evmWallet: string): Promise<Record<string, unknown> | null> {
  const rows = await sql<{ attributes: Record<string, unknown> | null }[]>`
    SELECT attributes FROM ${sql(schema)}.nft_ownership
    WHERE pk = 'ETH#LATEST' AND sk = ${'WALLET#' + evmWallet.toLowerCase()}`;
  const attrs = rows[0]?.attributes;
  return attrs && typeof attrs === 'object' ? attrs : null;
}

// anti-Sybil social link: X (twitter) OR Telegram, from the promoted columns OR linked_accounts (inclusive,
// to avoid false-blocking a legit holder whose social sits in only one of the two representations).
function hasSocialLink(p: ProfileRow): boolean {
  if (p.twitter_id != null || p.telegram_user_id != null) return true;
  const la = p.linked_accounts;
  if (la && typeof la === 'object' && ((la as Record<string, unknown>).twitter || (la as Record<string, unknown>).telegram)) {
    return true;
  }
  return false;
}

// activate EVM wallet: ONLY linkedAccounts.metamask.walletAddress (lambda activateEthNft, index.ts:328-330
// reads nothing else). Lower-cased; no regex (the lambda doesn't validate here, the snapshot/Alchemy lookup
// simply misses a malformed address).
function evmForActivate(p: ProfileRow): string | null {
  const la = p.linked_accounts as Record<string, any> | null;
  const w = la?.metamask?.walletAddress;
  return typeof w === 'string' ? w.toLowerCase() : null;
}

// check EVM wallet (3-hop, broader): linkedAccounts.metamask.walletAddress OR (provider==='MetaMask' ->
// the root wallet_address). The box has no `provider` column, so the lambda's profile.provider check maps to
// attributes->>'provider' (check/index.ts:133-137). Returns the lower-cased EVM iff it matches EVM_REGEX.
function evmForCheck(p: ProfileRow): string | null {
  const la = p.linked_accounts as Record<string, any> | null;
  let w: unknown = la?.metamask?.walletAddress;
  if (!w) {
    const attrs = p.attributes as Record<string, unknown> | null;
    if (attrs && attrs.provider === 'MetaMask') w = p.wallet_address;
  }
  if (typeof w !== 'string') return null;
  const lw = w.toLowerCase();
  return EVM_REGEX.test(lw) ? lw : null;
}

// ===================== GET /ecosystem/status (authed) =====================

export async function ecosystemStatus(sql: Db, schema: string, identityId: string): Promise<Result> {
  const rows = await sql<{ sk: string; status: string; activated_at: Date | null; last_verified_at: Date | null; attributes: Record<string, unknown> | null }[]>`
    SELECT sk, status, activated_at, last_verified_at, attributes
    FROM ${sql(schema)}.ecosystem_activations WHERE identity_id = ${identityId}`;
  const activations = rows.map((r) => {
    const idx = r.sk.indexOf('#');
    return {
      nftType: idx < 0 ? r.sk : r.sk.slice(0, idx),
      walletAddress: idx < 0 ? '' : r.sk.slice(idx + 1),
      status: r.status,
      activatedAt: r.activated_at ? new Date(r.activated_at).toISOString() : undefined,
      lastVerifiedAt: r.last_verified_at ? new Date(r.last_verified_at).toISOString() : undefined,
      nftCount: r.attributes && typeof r.attributes === 'object' ? (r.attributes as Record<string, unknown>).nftCount : undefined,
    };
  });
  return { status: 200, body: { activations } };
}

// Per-user ecosystem-activations for the points-scanner (GET /ecosystem-activations/:id). Byte-parity with
// the bulk handleEcosystemActivations row shape (ACTIVE only, nftType = sk prefix, nftCount from attributes
// default 1), filtered to one identity. The consumer (ecosystem-cache.ts:220-228) expects { activations:
// [{ nftType, nftCount }] } and treats every returned row as ACTIVE.
export async function ecosystemActivationsForUser(
  sql: Db,
  schema: string,
  identityId: string,
): Promise<{ activations: Array<{ nftType: string; nftCount: number }> }> {
  const rows = await sql<{ nft_type: string; nft_count: number }[]>`
    SELECT split_part(sk, '#', 1) AS nft_type,
           COALESCE(NULLIF(attributes->>'nftCount', '')::int, 1) AS nft_count
    FROM ${sql(schema)}.ecosystem_activations
    WHERE identity_id = ${identityId} AND status = 'ACTIVE'`;
  return { activations: rows.map((r) => ({ nftType: r.nft_type, nftCount: r.nft_count })) };
}

// ===================== POST /ecosystem/activate (authed) =====================

export async function handleEcosystemActivate(
  sql: Db,
  schema: string,
  identityId: string,
  body: Record<string, unknown>,
): Promise<Result> {
  const nftType = typeof body.nftType === 'string' ? body.nftType : '';
  if (!nftType || !VALID_NFT_TYPES.includes(nftType as NftType)) {
    return { status: 400, body: { error: 'INVALID_NFT_TYPE', message: `nftType must be one of: ${VALID_NFT_TYPES.join(', ')}` } };
  }

  const profile = await readProfileRow(sql, schema, identityId);
  if (!profile) return { status: 404, body: { error: 'USER_NOT_FOUND', message: 'User profile not found' } };

  if (nftType === 'alliance') return activateAlliance(sql, schema, identityId);
  if (nftType === 'genesis-pass') return activateGenesisPass(sql, schema, identityId, profile);
  // battalion (NOT_AVAILABLE -- no contract deployed; erc721 on-demand path is never reached)
  return { status: 400, body: { error: 'NOT_AVAILABLE', message: 'Battalion NFT activation is not available yet' } };
}

async function activateAlliance(sql: Db, schema: string, identityId: string): Promise<Result> {
  const rows = await sql<{ wallet_address: string | null }[]>`
    SELECT wallet_address FROM ${sql(schema)}.alliance_mint WHERE identity_id = ${identityId}`;
  if (rows.length === 0) {
    return { status: 400, body: { error: 'NOT_OWNED', message: 'You have not minted an Alliance NFT' } };
  }
  const walletAddress = rows[0].wallet_address;
  // Guard the lone null-wallet mirror row (1/69197): the lambda would build "alliance#undefined"; treat a
  // missing wallet as not-owned rather than persist a malformed sk.
  if (!walletAddress) {
    return { status: 400, body: { error: 'NOT_OWNED', message: 'You have not minted an Alliance NFT' } };
  }
  const sk = `alliance#${walletAddress}`;
  const now = new Date().toISOString();
  const { changed } = await ecosystemActivationUpsert({ identityId, sk, nftCount: 1, activatedAt: now, lastVerifiedAt: now });
  const activation = { nftType: 'alliance', walletAddress, status: 'ACTIVE' };
  return changed
    ? { status: 200, body: { success: true, activation } }
    : { status: 200, body: { success: true, activation, message: 'Already activated' } };
}

async function activateGenesisPass(sql: Db, schema: string, identityId: string, profile: ProfileRow): Promise<Result> {
  // ★ anti-Sybil now-fix (Ship-1 delta, NOT lambda parity): require an X or Telegram link before a Genesis
  // Pass NFT can earn the ecosystem multiplier. Closes the GP-only farming gap the lambda comment claimed to
  // guard but never enforced. Existing ACTIVE activations are untouched (only new/re-activation is gated).
  if (!hasSocialLink(profile)) {
    return { status: 403, body: { error: 'SOCIAL_REQUIRED', message: 'Link an X (Twitter) or Telegram account before activating Genesis Pass' } };
  }

  const evmWallet = evmForActivate(profile);
  if (!evmWallet) return { status: 400, body: { error: 'NO_EVM_WALLET', message: 'Link your MetaMask wallet before activating' } };

  const contract = ECOSYSTEM.genesisPassContract;
  let walletRecord = await readOwnershipAttrs(sql, schema, evmWallet);
  if (!walletRecord || isStaleOnDemandMiss(walletRecord, contract)) {
    try {
      walletRecord = await fetchAndPersistOwnership(sql, schema, evmWallet, contract);
    } catch (err) {
      console.error(`[compute] ecosystem genesis-pass Alchemy fallback failed for ${evmWallet}:`, err instanceof Error ? err.message : err);
      return { status: 503, body: { error: 'SNAPSHOT_UNAVAILABLE', message: 'Ownership data is not yet available. Please try again later.' } };
    }
  }

  const holdings = (walletRecord.holdings as NftHolding[] | undefined) ?? [];
  const match = holdings.find((h) => h.contractAddress.toLowerCase() === contract);
  const nftCount = match?.tokenCount || 0;
  if (nftCount === 0) {
    return { status: 400, body: { error: 'NOT_OWNED', message: 'Your wallet does not hold a Genesis Pass NFT' } };
  }

  const sk = `genesis-pass#${evmWallet}`;
  const now = new Date().toISOString();
  const { changed } = await ecosystemActivationUpsert({ identityId, sk, nftCount, activatedAt: now, lastVerifiedAt: now });
  const activation = { nftType: 'genesis-pass', walletAddress: evmWallet, status: 'ACTIVE', nftCount };
  return changed
    ? { status: 200, body: { success: true, activation } }
    : { status: 200, body: { success: true, activation, message: 'Already activated' } };
}

// ===================== POST /ecosystem/deactivate (authed) =====================

export async function handleEcosystemDeactivate(
  sql: Db,
  schema: string,
  identityId: string,
  body: Record<string, unknown>,
): Promise<Result> {
  const nftType = typeof body.nftType === 'string' ? body.nftType : '';
  if (!nftType || !VALID_NFT_TYPES.includes(nftType as NftType)) {
    return { status: 400, body: { error: 'INVALID_NFT_TYPE', message: `nftType must be one of: ${VALID_NFT_TYPES.join(', ')}` } };
  }
  // First activation row for this nftType prefix (sk ascending == the lambda's Query Items[0]). nftType is
  // validated against the fixed set, so the LIKE pattern carries no metacharacters.
  const rows = await sql<{ sk: string }[]>`
    SELECT sk FROM ${sql(schema)}.ecosystem_activations
    WHERE identity_id = ${identityId} AND sk LIKE ${nftType + '#%'} ORDER BY sk LIMIT 1`;
  if (rows.length === 0) {
    return { status: 404, body: { error: 'NOT_FOUND', message: 'No active activation found for this NFT type' } };
  }
  const sk = rows[0].sk;
  await ecosystemActivationDeactivate({ identityId, sk });
  const idx = sk.indexOf('#');
  return {
    status: 200,
    body: { success: true, activation: { nftType, walletAddress: idx < 0 ? '' : sk.slice(idx + 1), status: 'INACTIVE' } },
  };
}

// ===================== GET /genesis-pass/check (public) =====================

const MINT_CONFIG: Record<string, number> = { FREE_MINT: 1, GUARANTEED: 2 };
const FCFS_STAGE = 3;
const STAGE_LABELS: Record<number, string> = { 0: 'Paused', 1: 'Free Mint', 2: 'GTD Allowlist', 3: 'FCFS Allowlist', 4: 'Public' };

function getEligibleStage(mintType: string | undefined | null): number {
  if (mintType == null) return FCFS_STAGE;
  return MINT_CONFIG[mintType] ?? FCFS_STAGE;
}

export async function genesisPassCheck(sql: Db, schema: string, params: URLSearchParams): Promise<Result> {
  const walletAddress = params.get('walletAddress') || undefined;
  const nasunAddress = params.get('nasunAddress') || undefined;

  if (nasunAddress) {
    if (!SUI_REGEX.test(nasunAddress)) {
      return { status: 400, body: { success: false, error: 'INVALID_ADDRESS', message: 'Invalid Nasun address format (expected 0x + 64 hex chars)' } };
    }
    const hasGenesisPass = await resolveGpByNasun(sql, schema, nasunAddress.toLowerCase());
    return { status: 200, body: { success: true, data: { hasGenesisPass } } };
  }

  if (!walletAddress) {
    return { status: 400, body: { success: false, error: 'MISSING_ADDRESS', message: 'walletAddress or nasunAddress query parameter is required' } };
  }
  if (!EVM_REGEX.test(walletAddress)) {
    return { status: 400, body: { success: false, error: 'INVALID_ADDRESS', message: 'Invalid EVM wallet address format' } };
  }

  const normalized = walletAddress.toLowerCase();
  const currentStage = ECOSYSTEM.gpStage;
  const rows = await sql<{ status: string; mint_type: string | null }[]>`
    SELECT status, mint_type FROM ${sql(schema)}.genesis_pass_allowlist WHERE wallet_address = ${normalized}`;

  if (rows.length === 0) {
    return {
      status: 200,
      body: { success: true, data: { registered: false, applied: false, currentStage, currentStageLabel: STAGE_LABELS[currentStage] || 'Unknown', eligible: currentStage === 4 } },
    };
  }

  const status = rows[0].status;
  const mintType = rows[0].mint_type ?? undefined;
  const isActive = status === 'ACTIVE';
  const eligibleStage = getEligibleStage(mintType);
  const eligible = isActive && (currentStage === eligibleStage || currentStage === 4);
  return {
    status: 200,
    body: {
      success: true,
      data: {
        registered: isActive,
        applied: status === 'APPLIED',
        walletAddress: normalized,
        mintType: mintType || null,
        eligibleStage,
        eligibleStageLabel: STAGE_LABELS[eligibleStage] || 'Unknown',
        currentStage,
        currentStageLabel: STAGE_LABELS[currentStage] || 'Unknown',
        eligible,
      },
    },
  };
}

// 3-hop Nasun-address -> EVM -> NFT-ownership GP check (check/index.ts:95-160). Hop1 wallet_owner, Hop2
// user_profiles (+ linked_to_primary_id secondary->primary resolution), Hop3 nft_ownership ETH#LATEST.
async function resolveGpByNasun(sql: Db, schema: string, nasunAddress: string): Promise<boolean> {
  const w = await sql<{ owner_identity_id: string }[]>`
    SELECT owner_identity_id FROM ${sql(schema)}.wallet_owner WHERE wallet_address = ${nasunAddress}`;
  const ownerIdentityId = w[0]?.owner_identity_id;
  if (!ownerIdentityId) return false;

  let profile = await readProfileRow(sql, schema, ownerIdentityId);
  if (!profile) return false;
  const linkedToPrimaryId = profile.linked_to_primary_id;
  if (linkedToPrimaryId && linkedToPrimaryId !== ownerIdentityId) {
    const primary = await readProfileRow(sql, schema, linkedToPrimaryId);
    if (primary) profile = primary;
  }

  const evm = evmForCheck(profile);
  if (!evm) return false;

  const attrs = await readOwnershipAttrs(sql, schema, evm);
  if (!attrs) return false;
  const holdings = (attrs.holdings as NftHolding[] | undefined) ?? [];
  return holdings.some((h) => h.contractAddress.toLowerCase() === ECOSYSTEM.genesisPassContract && h.tokenCount > 0);
}

// ===================== on-demand ownership (Alchemy egress + :3211 persist) =====================

function isStaleOnDemandMiss(record: Record<string, unknown> | null, contractAddress: string): boolean {
  if (!record || record.source !== 'alchemy-ondemand') return false;
  const holdings = (record.holdings as NftHolding[] | undefined) ?? [];
  const target = contractAddress.toLowerCase();
  if (holdings.some((h) => h.contractAddress.toLowerCase() === target && h.tokenCount > 0)) return false;
  const lastUpdatedAt = record.lastUpdatedAt as string | undefined;
  if (!lastUpdatedAt) return true;
  const age = Date.now() - new Date(lastUpdatedAt).getTime();
  return !Number.isFinite(age) || age > ON_DEMAND_FRESHNESS_MS;
}

// Fetch GP (ERC-1155) ownership on demand and persist the merged ETH#LATEST row via :3211 (parity with the
// lambda fetchAndPersistOwnership, index.ts:139-183). Genesis Pass is the only on-demand nftType and is
// ERC-1155, so only the getOwnersForContract path is ported (battalion=NOT_AVAILABLE never reaches here).
async function fetchAndPersistOwnership(
  sql: Db,
  schema: string,
  wallet: string,
  contractAddress: string,
): Promise<Record<string, unknown>> {
  const addr = contractAddress.toLowerCase();
  const lowerWallet = wallet.toLowerCase();
  const tokenCount = (await getErc1155TokenIds(lowerWallet, addr)).length;

  const existing = await readOwnershipAttrs(sql, schema, lowerWallet);
  const priorHoldings = ((existing?.holdings as NftHolding[] | undefined) ?? []).filter(
    (h) => h.contractAddress.toLowerCase() !== addr,
  );
  const mergedHoldings: NftHolding[] = [...priorHoldings];
  if (tokenCount > 0) mergedHoldings.push({ contractAddress: addr, chain: 'ethereum', tokenCount });
  const totalNftCount = mergedHoldings.reduce((sum, h) => sum + h.tokenCount, 0);

  const now = new Date();
  const record = {
    holdings: mergedHoldings,
    totalNftCount,
    source: 'alchemy-ondemand',
    lastUpdatedAt: now.toISOString(),
  };
  await nftOwnershipUpsert({
    pk: 'ETH#LATEST',
    sk: `WALLET#${lowerWallet}`,
    walletAddress: lowerWallet,
    snapshotDate: now.toISOString().slice(0, 10),
    holdings: mergedHoldings,
    totalNftCount,
    source: 'alchemy-ondemand',
    lastUpdatedAt: now.toISOString(),
  });
  return record;
}

// In-memory holder-set cache (module-level; the long-lived box process replaces the lambda's DDB ETH#HOLDERS
// cache). One getOwnersForContract per contract per freshness window, shared across all activate attempts.
const holderCache = new Map<string, { holders: Record<string, string[]>; at: number }>();

interface AlchemyOwnersResponse {
  owners: Array<{ ownerAddress: string; tokenBalances: Array<{ tokenId: string; balance: string }> }>;
  pageKey?: string;
}

async function getErc1155TokenIds(wallet: string, contractAddress: string): Promise<string[]> {
  if (!ECOSYSTEM.alchemyApiKey) throw new Error('ALCHEMY_API_KEY not configured');
  const holders = await loadOrRefreshHolderSet(contractAddress.toLowerCase());
  return holders[wallet.toLowerCase()] ?? [];
}

async function loadOrRefreshHolderSet(contract: string): Promise<Record<string, string[]>> {
  const cached = holderCache.get(contract);
  if (cached && Date.now() - cached.at < ECOSYSTEM.holderCacheFreshnessMs) return cached.holders;
  const holders = await fetchHoldersForContract(contract);
  holderCache.set(contract, { holders, at: Date.now() });
  return holders;
}

async function fetchHoldersForContract(contract: string): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  let pageKey: string | undefined;
  do {
    const params = new URLSearchParams({ contractAddress: contract, withTokenBalances: 'true' });
    if (pageKey) params.set('pageKey', pageKey);
    const url = `${ECOSYSTEM.alchemyNftBaseUrl}/${ECOSYSTEM.alchemyApiKey}/getOwnersForContract?${params}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(ECOSYSTEM.holderFetchTimeoutMs) });
    if (!res.ok) throw new Error(`getOwnersForContract HTTP ${res.status}`);
    const data = (await res.json()) as AlchemyOwnersResponse;
    for (const o of data.owners) {
      const a = o.ownerAddress.toLowerCase();
      const ids = o.tokenBalances.map((tb) => tb.tokenId);
      if (out[a]) out[a].push(...ids);
      else out[a] = ids;
    }
    pageKey = data.pageKey;
  } while (pageKey);
  return out;
}
