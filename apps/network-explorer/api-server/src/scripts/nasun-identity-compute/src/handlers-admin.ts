// AdminStack admin UI de-Lambda (AWS-exit #5). Ports cdk/lambda-src/admin-api/src/handlers/
// export-whitelist.ts (export/{genesis,genesis-pass,battalion,stats} + hidden-proposals + users +
// devnet-metrics) and nft-collections.ts (nft-collections CRUD), plus the admin-api utils/csv.ts +
// utils/auth.ts (verifyAdminRole). Reads run on the compute_ro PG pool (the box nasun_dal mirror); the
// authoritative hidden_proposals / nft_collections WRITES delegate to the box identity service (:3211)
// via clients.ts (compute_ro is SELECT-only). devnet-metrics is NOT mirrored -- it calls the box
// explorer-api /stats/daily-metrics-range (activity_points lives in a DIFFERENT DB the compute_ro pool
// cannot reach). CSV byte-parity with the lambda generateCSV (LF join, no trailing newline, no BOM).
//
// DELIBERATE DROP vs the lambda (plan §R): nasun-stats/download is a dead UI (writer absent in the
// monorepo) and is NOT ported; the /nasun-stats + /dau-export skills already generate that report.
// Genesis Pass entries CRUD is Batch B (GET-only box lift; the writes stay on doetwxms5a until the
// genesis-pass register lambda retires) and is NOT ported here either.

import type { Sql } from 'postgres';
import { ADMIN } from './config';
import { verifyJwtIdentity } from './identity-verify';
import {
  hiddenProposalUpsert,
  hiddenProposalDelete,
  nftCollectionUpsert,
  nftCollectionUpdate,
  nftCollectionDelete,
  genesisPassEntryAdd,
  genesisPassEntryUpdate,
  genesisPassEntryRemove,
  fetchDevnetMetricsRange,
} from './clients';

type Db = Sql<{}>;

// Discriminated result: JSON routes return { status, body }; the CSV export routes return a raw blob the
// server writes with sendRaw (text/csv + Content-Disposition). The server maps these onto send/sendRaw.
export type AdminResult =
  | { status: number; body: Record<string, unknown> }
  | { status: number; raw: string; contentType: string; headers: Record<string, string> };

export interface AdminUser {
  identityId: string;
  email?: string;
  username?: string;
}

// ===================== CSV (byte-parity with admin-api utils/csv.ts) =====================

function escapeCSVValue(value: string | undefined | null): string {
  if (value === undefined || value === null) return '';
  const stringValue = String(value);
  if (
    stringValue.includes(',') ||
    stringValue.includes('"') ||
    stringValue.includes('\n') ||
    stringValue.includes('\r')
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function generateCSV(
  items: Record<string, unknown>[],
  columns: { key: string; header: string }[],
): string {
  const headerRow = columns.map((col) => col.header).join(',');
  const dataRows = items.map((item) =>
    columns.map((col) => escapeCSVValue(item[col.key] as string)).join(','),
  );
  return [headerRow, ...dataRows].join('\n');
}

function generateFilename(prefix: string, suffix?: string): string {
  const date = new Date().toISOString().split('T')[0];
  return suffix ? `${prefix}-${suffix}-${date}.csv` : `${prefix}-${date}.csv`;
}

function csvResult(csv: string, filename: string): AdminResult {
  return {
    status: 200,
    raw: csv,
    contentType: 'text/csv; charset=utf-8',
    headers: { 'content-disposition': `attachment; filename="${filename}"` },
  };
}

// ===================== admin auth (compute_ro box ADMIN-role read) =====================

// Verify the Bearer JWT (dual-jwks) -> identityId, then confirm the box ADMIN role. role/email/username
// live in the user_profiles attributes jsonb (no promoted columns) -- byte-parity with the lambda
// verifyAdminRole + the referral box authenticateAdmin (attributes->>'role'='ADMIN'). Returns null on a
// bad token OR a non-admin (the route maps null -> 401, the lambda's unauthorizedResponse status).
export async function authenticateAdmin(
  sql: Db,
  schema: string,
  authHeader: string | undefined,
): Promise<AdminUser | null> {
  const identityId = await verifyJwtIdentity(authHeader);
  if (!identityId) return null;
  const rows = await sql<{ role: string | null; email: string | null; username: string | null }[]>`
    SELECT attributes->>'role' AS role, attributes->>'email' AS email, attributes->>'username' AS username
    FROM ${sql(schema)}.user_profiles WHERE identity_id = ${identityId} LIMIT 1`;
  const row = rows[0];
  if (!row || row.role !== 'ADMIN') return null;
  return { identityId, email: row.email ?? undefined, username: row.username ?? undefined };
}

// ===================== export reads (compute_ro) =====================

interface GenesisWhitelistItem {
  walletAddress: string;
  joinedAt: string;
  signature?: string;
  status: string;
  withdrawnAt?: string;
}

// Scan genesis_nft_whitelist mirror (PK wallet_address; joined_at/status + signature/withdrawnAt in
// attributes). status filter (ALL = no filter). Parity with the lambda scanGenesisWhitelist.
async function scanGenesisWhitelist(sql: Db, schema: string, status?: string): Promise<GenesisWhitelistItem[]> {
  const filtered = status && status !== 'ALL';
  const rows = filtered
    ? await sql<{ wallet_address: string; joined_at: string | null; status: string | null; attributes: Record<string, unknown> | null }[]>`
        SELECT wallet_address, joined_at, status, attributes
        FROM ${sql(schema)}.genesis_nft_whitelist WHERE status = ${status!}`
    : await sql<{ wallet_address: string; joined_at: string | null; status: string | null; attributes: Record<string, unknown> | null }[]>`
        SELECT wallet_address, joined_at, status, attributes
        FROM ${sql(schema)}.genesis_nft_whitelist`;
  return rows.map((r) => {
    const a = (r.attributes || {}) as Record<string, unknown>;
    return {
      walletAddress: r.wallet_address || '',
      joinedAt: r.joined_at || '',
      signature: typeof a.signature === 'string' ? a.signature : undefined,
      status: r.status || 'ACTIVE',
      withdrawnAt: typeof a.withdrawnAt === 'string' ? a.withdrawnAt : undefined,
    };
  });
}

interface GenesisPassItem {
  walletAddress: string;
  identityId: string;
  registeredAt: string;
  status: string;
  mintType?: string;
  source?: string;
  twitterHandle?: string;
  probableBot?: boolean;
}

// Scan genesis_pass_allowlist mirror (Ship1; PK wallet_address). identity_id/status/mint_type/registered_at
// are PROMOTED columns (NOT in attributes -- the dal-load lifted them out; attributes only carries the
// long-tail source/probableBot/twitterHandle/lastModified*). registered_at is a timestamptz -> formatted to
// the DDB ISO string (`...T..:..:..MSZ`, millisecond precision) for byte-parity with the lambda's
// item.registeredAt?.S. status filter (ALL = no filter). Parity with the lambda scanGenesisPassAllowlist.
async function scanGenesisPassAllowlist(sql: Db, schema: string, status?: string): Promise<GenesisPassItem[]> {
  const filtered = status && status !== 'ALL';
  type Row = {
    wallet_address: string;
    identity_id: string | null;
    status: string | null;
    mint_type: string | null;
    registered_at_iso: string | null;
    attributes: Record<string, unknown> | null;
  };
  const cols = sql`wallet_address, identity_id, status, mint_type,
        to_char(registered_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS registered_at_iso,
        attributes`;
  const rows = filtered
    ? await sql<Row[]>`SELECT ${cols} FROM ${sql(schema)}.genesis_pass_allowlist WHERE status = ${status!}`
    : await sql<Row[]>`SELECT ${cols} FROM ${sql(schema)}.genesis_pass_allowlist`;
  return rows.map((r) => {
    const a = (r.attributes || {}) as Record<string, unknown>;
    return {
      walletAddress: r.wallet_address || '',
      identityId: r.identity_id ?? (typeof a.identityId === 'string' ? a.identityId : ''),
      registeredAt: r.registered_at_iso ?? (typeof a.registeredAt === 'string' ? a.registeredAt : ''),
      status: r.status || 'ACTIVE',
      mintType: r.mint_type ?? (typeof a.mintType === 'string' ? a.mintType : undefined),
      source: typeof a.source === 'string' ? a.source : undefined,
      twitterHandle: typeof a.twitterHandle === 'string' ? a.twitterHandle : undefined,
      probableBot: a.probableBot === true,
    };
  });
}

interface BattalionWhitelistItem {
  walletAddress: string;
  verifiedAt: string;
  xUserId?: string;
  xUsername?: string;
  allowlistBatchId?: string;
  status: string;
}

// Scan battalion_whitelist mirror (PK wallet_address; verified_at/x_user_id/x_username/status/batch_id
// promoted). Optional batchId + verifiedAt date-range filter. Parity with the lambda queryBattalionWhitelist
// (sort by verifiedAt DESC). endDate is inclusive of the whole UTC day (lambda appends T23:59:59.999Z).
async function queryBattalionWhitelist(
  sql: Db,
  schema: string,
  startDate?: string,
  endDate?: string,
  batchId?: string,
): Promise<BattalionWhitelistItem[]> {
  const endExclUpper = endDate ? endDate + 'T23:59:59.999Z' : null;
  const rows = await sql<{
    wallet_address: string; verified_at: string | null; x_user_id: string | null;
    x_username: string | null; batch_id: string | null; status: string | null;
  }[]>`
    SELECT wallet_address, verified_at, x_user_id, x_username, batch_id, status
    FROM ${sql(schema)}.battalion_whitelist
    WHERE (${batchId ?? null}::text IS NULL OR batch_id = ${batchId ?? null})
      AND (${startDate ?? null}::text IS NULL OR verified_at >= ${startDate ?? null})
      AND (${endExclUpper}::text IS NULL OR verified_at <= ${endExclUpper})
    ORDER BY verified_at DESC`;
  return rows.map((r) => ({
    walletAddress: r.wallet_address || '',
    verifiedAt: r.verified_at || '',
    xUserId: r.x_user_id ?? undefined,
    xUsername: r.x_username ?? undefined,
    allowlistBatchId: r.batch_id ?? undefined,
    status: r.status || 'ACTIVE',
  }));
}

// identity_id -> twitterHandle map for genesis-pass enrichment (lambda scanTwitterHandleMap, over the box
// user_profiles promoted twitter_handle column).
async function scanTwitterHandleMap(sql: Db, schema: string): Promise<Map<string, string>> {
  const rows = await sql<{ identity_id: string; twitter_handle: string | null }[]>`
    SELECT identity_id, twitter_handle FROM ${sql(schema)}.user_profiles WHERE twitter_handle IS NOT NULL`;
  const m = new Map<string, string>();
  for (const r of rows) if (r.twitter_handle) m.set(r.identity_id, r.twitter_handle);
  return m;
}

const VALID_STATUSES = ['ACTIVE', 'APPLIED', 'LEGACY', 'WITHDRAWN', 'ALL'];

// GET /export/genesis
export async function exportGenesis(sql: Db, schema: string, params: URLSearchParams): Promise<AdminResult> {
  const status = params.get('status') || 'ACTIVE';
  const format = params.get('format') || undefined;
  const items = await scanGenesisWhitelist(sql, schema, status);
  if (format === 'opensea') {
    const csv = generateCSV(
      items.map((item) => ({ walletAddress: item.walletAddress, mintLimit: '', price: '' })),
      [
        { key: 'walletAddress', header: 'Wallet address' },
        { key: 'mintLimit', header: 'Custom mint limit (optional)' },
        { key: 'price', header: 'Custom price in native token e.g. ETH (optional)' },
      ],
    );
    return csvResult(csv, generateFilename('frontiers-opensea-allowlist', status.toLowerCase()));
  }
  const csv = generateCSV(items as unknown as Record<string, unknown>[], [
    { key: 'walletAddress', header: 'walletAddress' },
    { key: 'joinedAt', header: 'joinedAt' },
    { key: 'signature', header: 'signature' },
    { key: 'status', header: 'status' },
    { key: 'withdrawnAt', header: 'withdrawnAt' },
  ]);
  return csvResult(csv, generateFilename('frontiers-whitelist', status.toLowerCase()));
}

// GET /export/genesis-pass
export async function exportGenesisPass(sql: Db, schema: string, params: URLSearchParams): Promise<AdminResult> {
  const status = params.get('status') || 'ACTIVE';
  if (!VALID_STATUSES.includes(status)) {
    return { status: 400, body: { error: `Invalid status: ${status}. Must be one of: ${VALID_STATUSES.join(', ')}` } };
  }
  const format = params.get('format') || undefined;
  let mintType = params.get('mintType') || undefined;
  const VALID_MINT_TYPES = ['FREE_MINT', 'GUARANTEED', 'STANDARD', 'FCFS'];
  if (mintType && !VALID_MINT_TYPES.includes(mintType)) {
    return { status: 400, body: { error: `Invalid mintType: ${mintType}. Must be one of: ${VALID_MINT_TYPES.join(', ')}` } };
  }
  if (mintType === 'FCFS') mintType = 'STANDARD';

  let items = await scanGenesisPassAllowlist(sql, schema, status);
  if (mintType) {
    items = mintType === 'STANDARD'
      ? items.filter((item) => !item.mintType)
      : items.filter((item) => item.mintType === mintType);
  }
  try {
    const handleMap = await scanTwitterHandleMap(sql, schema);
    for (const item of items) {
      if (!item.twitterHandle && item.identityId) item.twitterHandle = handleMap.get(item.identityId);
    }
  } catch (err) {
    console.warn('[compute][admin] export genesis-pass twitterHandle enrich failed:', err instanceof Error ? err.message : err);
  }

  if (format === 'opensea') {
    const csv = generateCSV(
      items.map((item) => ({ walletAddress: item.walletAddress, mintLimit: '', price: '' })),
      [
        { key: 'walletAddress', header: 'Wallet address' },
        { key: 'mintLimit', header: 'Custom mint limit (optional)' },
        { key: 'price', header: 'Custom price in native token e.g. ETH (optional)' },
      ],
    );
    const mintSuffix = mintType ? `-${mintType.toLowerCase().replace('_', '-')}` : '';
    return csvResult(csv, generateFilename(`genesis-pass-opensea${mintSuffix}-allowlist`, status.toLowerCase()));
  }
  const csv = generateCSV(items as unknown as Record<string, unknown>[], [
    { key: 'walletAddress', header: 'walletAddress' },
    { key: 'identityId', header: 'identityId' },
    { key: 'twitterHandle', header: 'twitterHandle' },
    { key: 'mintType', header: 'mintType' },
    { key: 'source', header: 'source' },
    { key: 'registeredAt', header: 'registeredAt' },
    { key: 'status', header: 'status' },
  ]);
  return csvResult(csv, generateFilename('genesis-pass-allowlist', status.toLowerCase()));
}

// GET /genesis-pass/entries (admin) -> { success, items } -- the admin UI allowlist list view. Box port of
// the lambda GET handler: scan ALL entries, enrich missing twitterHandle off user_profiles, sort by
// registeredAt DESC. This is the READ slice of genesis-pass/entries only; the POST/PUT/DELETE writes are
// NOT ported -- they stay on the doetwxms5a lambda (Batch B split-brain: the genesis-pass register lambda is
// the live writer of the genesis-pass-allowlist DDB, so the box -- which has no AWS access -- cannot own
// these writes. At cutover nginx keeps genesis-pass/entries writes on doetwxms5a). Reuses the export path's
// scanGenesisPassAllowlist + scanTwitterHandleMap (byte-parity with exportGenesisPass's read).
export async function genesisPassEntries(sql: Db, schema: string): Promise<AdminResult> {
  const items = await scanGenesisPassAllowlist(sql, schema, 'ALL');
  try {
    const handleMap = await scanTwitterHandleMap(sql, schema);
    for (const item of items) {
      if (!item.twitterHandle && item.identityId) item.twitterHandle = handleMap.get(item.identityId);
    }
  } catch (err) {
    console.warn('[compute][admin] genesis-pass entries twitterHandle enrich failed:', err instanceof Error ? err.message : err);
  }
  items.sort((a, b) => (b.registeredAt || '').localeCompare(a.registeredAt || ''));
  return { status: 200, body: { success: true, items } };
}

// POST /genesis-pass/entries (admin) -> :3211 add. Parity with the lambda POST handler: validate walletAddress
// + EVM regex, lowercase, the box dup-checks (409) and writes status='ACTIVE' + optional mintType/source.
export async function genesisPassEntryCreate(body: Record<string, unknown>): Promise<AdminResult> {
  const { walletAddress, mintType, source } = body as { walletAddress?: string; mintType?: string; source?: string };
  if (!walletAddress || typeof walletAddress !== 'string') {
    return { status: 400, body: { error: 'Missing required field: walletAddress' } };
  }
  if (!EVM_ADDRESS_REGEX.test(walletAddress)) {
    return { status: 400, body: { error: 'Invalid EVM wallet address format' } };
  }
  return genesisPassEntryAdd({
    walletAddress: walletAddress.toLowerCase(),
    ...(typeof mintType === 'string' ? { mintType } : {}),
    ...(typeof source === 'string' ? { source } : {}),
  });
}

// PUT /genesis-pass/entries/{walletAddress} (admin) -> :3211 update. Parity with the lambda PUT: validate
// status against ACTIVE/APPLIED/LEGACY/WITHDRAWN, forward only the provided fields, 400 when none, stamp the
// admin's identityId as lastModifiedBy. The box does the existence check (404).
export async function genesisPassEntryEdit(admin: AdminUser, walletAddress: string, body: Record<string, unknown>): Promise<AdminResult> {
  const normalized = decodeURIComponent(walletAddress).toLowerCase();
  const VALID_STATUS = ['ACTIVE', 'APPLIED', 'LEGACY', 'WITHDRAWN'];
  const updates: Record<string, unknown> = {};
  if (body.status !== undefined) {
    const s = String(body.status);
    if (!VALID_STATUS.includes(s)) {
      return { status: 400, body: { error: `Invalid status: ${s}. Must be one of: ${VALID_STATUS.join(', ')}` } };
    }
    updates.status = s;
  }
  if (body.mintType !== undefined) updates.mintType = String(body.mintType);
  if (body.source !== undefined) updates.source = String(body.source);
  if (Object.keys(updates).length === 0) {
    return { status: 400, body: { error: 'No fields to update. Provide status, mintType, or source.' } };
  }
  return genesisPassEntryUpdate({ walletAddress: normalized, updates, lastModifiedBy: admin.identityId });
}

// DELETE /genesis-pass/entries/{walletAddress} (admin) -> :3211 delete (idempotent, parity with the lambda).
export async function genesisPassEntryDelete(walletAddress: string): Promise<AdminResult> {
  return genesisPassEntryRemove(decodeURIComponent(walletAddress).toLowerCase());
}

// GET /export/battalion
export async function exportBattalion(sql: Db, schema: string, params: URLSearchParams): Promise<AdminResult> {
  const startDate = params.get('startDate') || undefined;
  const endDate = params.get('endDate') || undefined;
  const batchId = params.get('batchId') || undefined;
  const format = params.get('format') || undefined;
  const items = await queryBattalionWhitelist(sql, schema, startDate, endDate, batchId);

  let suffix = 'all';
  if (startDate || endDate) suffix = `${startDate || 'start'}-to-${endDate || 'end'}`;

  if (format === 'opensea') {
    const csv = generateCSV(
      items.map((item) => ({ walletAddress: item.walletAddress, mintLimit: '', price: '' })),
      [
        { key: 'walletAddress', header: 'Wallet address' },
        { key: 'mintLimit', header: 'Custom mint limit (optional)' },
        { key: 'price', header: 'Custom price in native token e.g. ETH (optional)' },
      ],
    );
    return csvResult(csv, generateFilename('battalion-nft-opensea-allowlist', suffix));
  }
  const csv = generateCSV(items as unknown as Record<string, unknown>[], [
    { key: 'walletAddress', header: 'walletAddress' },
    { key: 'verifiedAt', header: 'verifiedAt' },
    { key: 'xUserId', header: 'xUserId' },
    { key: 'xUsername', header: 'xUsername' },
    { key: 'status', header: 'status' },
  ]);
  return csvResult(csv, generateFilename('battalion-nft-allowlist', suffix));
}

// GET /export/stats
export async function exportStats(sql: Db, schema: string): Promise<AdminResult> {
  const [genesisItems, battalionItems, genesisPassItems] = await Promise.all([
    scanGenesisWhitelist(sql, schema, 'ALL'),
    queryBattalionWhitelist(sql, schema),
    scanGenesisPassAllowlist(sql, schema, 'ALL'),
  ]);

  const genesisActive = genesisItems.filter((item) => item.status === 'ACTIVE').length;
  const genesisWithdrawn = genesisItems.filter((item) => item.status === 'WITHDRAWN').length;
  const battalionActive = battalionItems.filter((item) => !item.status || item.status === 'ACTIVE').length;
  const battalionWithdrawn = battalionItems.filter((item) => item.status === 'WITHDRAWN').length;
  const genesisPassActive = genesisPassItems.filter((item) => item.status === 'ACTIVE').length;
  const genesisPassWithdrawn = genesisPassItems.filter((item) => item.status === 'WITHDRAWN').length;
  const genesisPassPaidApplied = genesisPassItems.filter(
    (item) => !['LEGACY', 'WITHDRAWN'].includes(item.status) && item.mintType !== 'FREE_MINT',
  ).length;
  const genesisPassBotCount = genesisPassItems.filter((item) => item.probableBot).length;
  const genesisPassPaidBotCount = genesisPassItems.filter(
    (item) => item.probableBot && !['LEGACY', 'WITHDRAWN'].includes(item.status) && item.mintType !== 'FREE_MINT',
  ).length;

  return {
    status: 200,
    body: {
      genesis: { active: genesisActive, withdrawn: genesisWithdrawn, total: genesisItems.length },
      battalion: { active: battalionActive, withdrawn: battalionWithdrawn, total: battalionItems.length },
      genesisPass: {
        active: genesisPassActive,
        withdrawn: genesisPassWithdrawn,
        total: genesisPassItems.length,
        paidApplied: genesisPassPaidApplied,
        botCount: genesisPassBotCount,
        paidAppliedExBot: genesisPassPaidApplied - genesisPassPaidBotCount,
        totalExBot: genesisPassItems.length - genesisPassBotCount,
      },
    },
  };
}

// ===================== hidden-proposals =====================

// GET /hidden-proposals (PUBLIC) -> { proposalIds }. hidden_proposals mirror (PK proposal_id).
export async function hiddenProposalsList(sql: Db, schema: string): Promise<AdminResult> {
  const rows = await sql<{ proposal_id: string }[]>`
    SELECT proposal_id FROM ${sql(schema)}.hidden_proposals`;
  return { status: 200, body: { proposalIds: rows.map((r) => r.proposal_id) } };
}

// POST /hidden-proposals (admin) -> :3211 upsert. body { proposalId }.
export async function hiddenProposalsHide(admin: AdminUser, body: Record<string, unknown>): Promise<AdminResult> {
  const proposalId = body.proposalId;
  if (!proposalId || typeof proposalId !== 'string') {
    return { status: 400, body: { error: 'Missing required field: proposalId' } };
  }
  const { status, body: out } = await hiddenProposalUpsert(proposalId, admin.identityId);
  if (status >= 400) return { status, body: out };
  return { status: 200, body: { success: true, proposalId } };
}

// DELETE /hidden-proposals/{id} (admin) -> :3211 delete.
export async function hiddenProposalsUnhide(proposalId: string): Promise<AdminResult> {
  if (!proposalId) return { status: 400, body: { error: 'Missing proposalId in path' } };
  const { status, body: out } = await hiddenProposalDelete(proposalId);
  if (status >= 400) return { status, body: out };
  return { status: 200, body: { success: true, proposalId } };
}

// ===================== nft-collections =====================

type NFTChain = 'ethereum' | 'polygon';
const VALID_CHAINS: NFTChain[] = ['ethereum', 'polygon'];
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NFT_TYPE_ID_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;
const EVM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

interface NftCollectionItem {
  collectionId: string;
  contractAddress: string;
  chain: NFTChain;
  collectionName: string;
  nftTypeId?: string;
  enabled: boolean;
  featured: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

// Scan nft_collections mirror (PROMOTED columns: collection_id PK, contract_address, chain, collection_name,
// nft_type_id, enabled, featured, created_at, updated_at, created_by). Parity with the lambda scanCollections
// (sort by createdAt DESC). enabledOnly filters to enabled=true (the public GET path); the ?admin=true path
// returns all. created_at/updated_at are stored as text (ISO) in the mirror.
async function scanCollections(sql: Db, schema: string, enabledOnly: boolean): Promise<NftCollectionItem[]> {
  type Row = {
    collection_id: string; contract_address: string | null; chain: string | null;
    collection_name: string | null; nft_type_id: string | null; enabled: boolean | null;
    featured: boolean | null; created_at: string | null; updated_at: string | null; created_by: string | null;
  };
  const cols = sql`collection_id, contract_address, chain, collection_name, nft_type_id, enabled, featured, created_at, updated_at, created_by`;
  const rows = enabledOnly
    ? await sql<Row[]>`
        SELECT ${cols} FROM ${sql(schema)}.nft_collections
        WHERE enabled = true ORDER BY created_at DESC NULLS LAST`
    : await sql<Row[]>`
        SELECT ${cols} FROM ${sql(schema)}.nft_collections
        ORDER BY created_at DESC NULLS LAST`;
  return rows.map((r) => ({
    collectionId: r.collection_id || '',
    contractAddress: r.contract_address || '',
    chain: (r.chain || 'ethereum') as NFTChain,
    collectionName: r.collection_name || '',
    nftTypeId: r.nft_type_id ?? undefined,
    enabled: r.enabled ?? true,
    featured: r.featured === true,
    createdAt: r.created_at || '',
    updatedAt: r.updated_at || '',
    createdBy: r.created_by || '',
  }));
}

// GET /nft-collections (PUBLIC = enabled only; ?admin=true = all, admin-authed by the caller).
export async function nftCollectionsList(sql: Db, schema: string, enabledOnly: boolean): Promise<AdminResult> {
  const collections = await scanCollections(sql, schema, enabledOnly);
  return { status: 200, body: { collections } };
}

// POST /nft-collections (admin) -> :3211 create.
export async function nftCollectionsCreate(admin: AdminUser, body: Record<string, unknown>): Promise<AdminResult> {
  const { contractAddress, chain, collectionName, nftTypeId, featured } = body;
  if (!contractAddress || !chain || !collectionName || !nftTypeId) {
    return { status: 400, body: { error: 'Missing required fields: contractAddress, chain, collectionName, nftTypeId' } };
  }
  if (!EVM_ADDRESS_REGEX.test(contractAddress as string)) {
    return { status: 400, body: { error: 'Invalid contract address format (must be 0x + 40 hex characters)' } };
  }
  if (!VALID_CHAINS.includes(chain as NFTChain)) {
    return { status: 400, body: { error: `Invalid chain. Must be one of: ${VALID_CHAINS.join(', ')}` } };
  }
  if ((collectionName as string).length > 100) {
    return { status: 400, body: { error: 'Collection name must be 100 characters or less' } };
  }
  if (typeof nftTypeId !== 'string' || !NFT_TYPE_ID_REGEX.test(nftTypeId)) {
    return { status: 400, body: { error: "nftTypeId must be lowercase slug: a-z, 0-9, '-' (1-64 chars, must start with alphanumeric)" } };
  }
  if (featured !== undefined && typeof featured !== 'boolean') {
    return { status: 400, body: { error: 'featured must be a boolean' } };
  }
  const { status, body: out } = await nftCollectionUpsert({
    contractAddress: (contractAddress as string).toLowerCase(),
    chain: chain as string,
    collectionName: collectionName as string,
    nftTypeId,
    featured: (featured as boolean | undefined) ?? false,
    createdBy: admin.identityId,
  });
  if (status >= 400) return { status, body: out };
  return { status: 201, body: { collection: out.collection ?? out } };
}

// PUT /nft-collections/{id} (admin) -> :3211 update.
export async function nftCollectionsUpdate(collectionId: string, body: Record<string, unknown>): Promise<AdminResult> {
  if (!UUID_REGEX.test(collectionId)) return { status: 400, body: { error: 'Invalid collection ID format' } };
  const { collectionName, enabled, featured, contractAddress, chain, nftTypeId } = body;
  if (featured !== undefined && typeof featured !== 'boolean') {
    return { status: 400, body: { error: 'featured must be a boolean' } };
  }
  if (contractAddress !== undefined && !EVM_ADDRESS_REGEX.test(contractAddress as string)) {
    return { status: 400, body: { error: 'Invalid contract address format' } };
  }
  if (chain !== undefined && !VALID_CHAINS.includes(chain as NFTChain)) {
    return { status: 400, body: { error: `Invalid chain. Must be one of: ${VALID_CHAINS.join(', ')}` } };
  }
  if (collectionName !== undefined && (collectionName as string).length > 100) {
    return { status: 400, body: { error: 'Collection name must be 100 characters or less' } };
  }
  if (nftTypeId !== undefined && (typeof nftTypeId !== 'string' || !NFT_TYPE_ID_REGEX.test(nftTypeId))) {
    return { status: 400, body: { error: "nftTypeId must be lowercase slug: a-z, 0-9, '-' (1-64 chars, must start with alphanumeric)" } };
  }
  // Only forward the provided fields (parity with the lambda updateCollection's partial UpdateExpression).
  const updates: Record<string, unknown> = {};
  if (collectionName !== undefined) updates.collectionName = collectionName;
  if (enabled !== undefined) updates.enabled = enabled;
  if (featured !== undefined) updates.featured = featured;
  if (contractAddress !== undefined) updates.contractAddress = (contractAddress as string).toLowerCase();
  if (chain !== undefined) updates.chain = chain;
  if (nftTypeId !== undefined) updates.nftTypeId = nftTypeId;

  const { status, body: out } = await nftCollectionUpdate(collectionId, updates);
  if (status >= 400) return { status, body: out };
  return { status: 200, body: { collection: out.collection ?? out } };
}

// DELETE /nft-collections/{id} (admin) -> :3211 delete.
export async function nftCollectionsDelete(collectionId: string): Promise<AdminResult> {
  if (!UUID_REGEX.test(collectionId)) return { status: 400, body: { error: 'Invalid collection ID format' } };
  const { status, body: out } = await nftCollectionDelete(collectionId);
  if (status >= 400) return { status, body: out };
  return { status: 200, body: { success: true, collectionId } };
}

// ===================== devnet-metrics =====================

// GET /devnet-metrics (admin) -> { metrics: [{ date, dau, newAddresses, cumulativeAddresses,
// transactionCount? }] } from ONE box explorer-api /stats/daily-metrics-range call (NOT mirrored;
// activity_points is a different DB). The lambda's per-row `collectedAt` is intentionally OMITTED: this is
// a LIVE compute (no collector snapshot timestamp); transactionCount maps from explorer-api's `dailyTx`
// (the same source the lambda's collector wrote). 503 when the explorer base URL is unset.
export async function devnetMetrics(): Promise<AdminResult> {
  if (!ADMIN.dailyMetricsBaseUrl) {
    return { status: 503, body: { error: 'devnet-metrics source not configured' } };
  }
  const metrics = await fetchDevnetMetricsRange();
  return { status: 200, body: { metrics } };
}

// ===================== users =====================

interface ProfileRow {
  identity_id: string;
  wallet_address: string | null;
  twitter_handle: string | null;
  twitter_id: string | null;
  telegram_user_id: string | null;
  is_telegram_member: boolean | null;
  linked_accounts: Record<string, unknown> | null;
  linked_to_primary_id: string | null;
  attributes: Record<string, unknown> | null;
}

const PROFILE_COLS = (sql: Db) => sql`identity_id, wallet_address, twitter_handle, twitter_id, telegram_user_id, is_telegram_member, linked_accounts, linked_to_primary_id, attributes`;

const SOCIAL_PROVIDER_KEYS = new Set(['twitter', 'google']);

// Reconstruct the lambda parseUserProfileItem shape from a box row (promoted columns + attributes jsonb +
// linked_accounts single-pass). Byte-parity field set with the lambda USER_LIST_FIELDS projection.
function parseUserProfileItem(r: ProfileRow): Record<string, unknown> {
  const a = (r.attributes || {}) as Record<string, unknown>;
  const la = (r.linked_accounts || {}) as Record<string, any>;

  let walletAddress: string | undefined = r.wallet_address ?? undefined;
  let twitterHandle: string | undefined = r.twitter_handle ?? (typeof a.twitterHandle === 'string' ? a.twitterHandle : undefined);
  let originalTwitterHandle: string | undefined = typeof a.originalTwitterHandle === 'string' ? a.originalTwitterHandle : undefined;
  let twitterId: string | undefined = r.twitter_id ?? (typeof a.twitterId === 'string' ? a.twitterId : undefined);
  let googleEmail: string | undefined;
  const linkedProviders: string[] = [];

  if (r.linked_accounts && typeof r.linked_accounts === 'object') {
    if (!walletAddress) {
      walletAddress = la['nasun wallet']?.walletAddress || la.metamask?.walletAddress || undefined;
    }
    for (const key of Object.keys(la)) {
      if (SOCIAL_PROVIDER_KEYS.has(key)) {
        linkedProviders.push(key);
        if (key === 'google') googleEmail = la.google?.email;
        if (key === 'twitter' && !twitterHandle) {
          twitterHandle = la.twitter?.twitterHandle;
          originalTwitterHandle = la.twitter?.originalTwitterHandle;
          twitterId = la.twitter?.twitterId;
        }
      }
    }
  }

  const provider = typeof a.provider === 'string' ? a.provider : undefined;
  const email = typeof a.email === 'string' ? a.email : undefined;
  if (!googleEmail && provider === 'Google' && email) googleEmail = email;

  return {
    identityId: r.identity_id,
    username: typeof a.username === 'string' ? a.username : undefined,
    email,
    provider,
    twitterHandle,
    originalTwitterHandle,
    twitterId,
    profileImageUrl: typeof a.profileImageUrl === 'string' ? a.profileImageUrl : undefined,
    walletAddress,
    role: typeof a.role === 'string' ? a.role : undefined,
    verified: a.verified === true ? true : undefined,
    isTelegramMember: r.is_telegram_member ?? undefined,
    telegramUserId: r.telegram_user_id ?? undefined,
    telegramUsername: typeof a.telegramUsername === 'string' ? a.telegramUsername : undefined,
    createdAt: typeof a.createdAt === 'string' ? a.createdAt : undefined,
    updatedAt: typeof a.updatedAt === 'string' ? a.updatedAt : undefined,
    status: typeof a.status === 'string' ? a.status : undefined,
    linkedToPrimaryId: r.linked_to_primary_id ?? undefined,
    googleEmail,
    linkedProviders,
    probableBot: a.probableBot === true,
    botTier: typeof a.botTier === 'number' ? a.botTier : undefined,
  };
}

// Detail view: include linkedAccounts (lambda parseUserProfileDetail).
function parseUserProfileDetail(r: ProfileRow): Record<string, unknown> {
  const profile = parseUserProfileItem(r);
  if (r.linked_accounts && typeof r.linked_accounts === 'object') {
    profile.linkedAccounts = r.linked_accounts;
  }
  return profile;
}

// List view strips linkedAccounts + linkedToPrimaryId (lambda toListItem).
function toListItem(profile: Record<string, unknown>): Record<string, unknown> {
  const { linkedAccounts: _la, linkedToPrimaryId: _lp, ...rest } = profile;
  return rest;
}

async function getProfileByIdentity(sql: Db, schema: string, identityId: string): Promise<ProfileRow | null> {
  const rows = await sql<ProfileRow[]>`
    SELECT ${PROFILE_COLS(sql)} FROM ${sql(schema)}.user_profiles WHERE identity_id = ${identityId} LIMIT 1`;
  return rows[0] ?? null;
}

// GET /users/{identityId} -- single user detail with linked-secondary enrichment (lambda detail path:
// pull twitter/google/telegram identifiers off each linked sub-identity onto the primary's linkedAccounts).
export async function userDetail(sql: Db, schema: string, targetIdentityId: string): Promise<AdminResult> {
  const primary = await getProfileByIdentity(sql, schema, targetIdentityId);
  if (!primary) return { status: 404, body: { error: 'User not found' } };

  const la: Record<string, any> = (primary.linked_accounts && typeof primary.linked_accounts === 'object')
    ? { ...(primary.linked_accounts as Record<string, any>) }
    : {};
  const subIds = new Set<string>();
  for (const v of Object.values(la)) {
    const id = (v as any)?.identityId;
    if (typeof id === 'string' && id !== targetIdentityId) subIds.add(id);
  }
  for (const subId of subIds) {
    const sec = await getProfileByIdentity(sql, schema, subId);
    if (!sec) continue;
    const sa = (sec.attributes || {}) as Record<string, unknown>;
    const twId = sec.twitter_id ?? (typeof sa.twitterId === 'string' ? sa.twitterId : undefined);
    const twHandle = sec.twitter_handle ?? (typeof sa.twitterHandle === 'string' ? sa.twitterHandle : undefined);
    if (twHandle || twId) {
      const tw = { ...(la.twitter || {}) };
      if (tw.twitterHandle == null && twHandle) tw.twitterHandle = twHandle;
      if (tw.twitterId == null && twId) tw.twitterId = twId;
      la.twitter = tw;
    }
    const secEmail = typeof sa.email === 'string' ? sa.email : undefined;
    if (secEmail) {
      const g = { ...(la.google || {}) };
      if (g.email == null) g.email = secEmail;
      la.google = g;
    }
    const tgUsername = typeof sa.telegramUsername === 'string' ? sa.telegramUsername : undefined;
    if (sec.telegram_user_id || tgUsername) {
      const tg = { ...(la.telegram || {}) };
      if (tg.telegramUserId == null && sec.telegram_user_id) tg.telegramUserId = sec.telegram_user_id;
      if (tg.telegramUsername == null && tgUsername) tg.telegramUsername = tgUsername;
      la.telegram = tg;
    }
  }
  const enriched: ProfileRow = { ...primary, linked_accounts: la };
  return { status: 200, body: { success: true, user: parseUserProfileDetail(enriched) } };
}

type FieldKind = 'twitter' | 'google' | 'telegram_id' | 'telegram_username' | 'wallet' | 'identity_id' | 'displayname';

function inferField(input: string): FieldKind {
  if (/^0x[a-f0-9]{40,}$/i.test(input)) return 'wallet';
  if (/^[a-z0-9-]+:[0-9a-f-]{36}$/i.test(input)) return 'identity_id';
  if (/^\d{5,}$/.test(input)) return 'telegram_id';
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input)) return 'google';
  return 'twitter';
}

// GET /users -- list (no q) OR search (q present). Maps the lambda's DDB GSI Queries / Scans onto box
// user_profiles SQL: twitter/telegram_id/wallet -> promoted-column or linked_accounts jsonb match; google
// -> attributes.email or linked_accounts.google.email; telegram_username/displayname -> attributes; then
// resolve secondaries (linked_to_primary_id) up to their primary, enriching linkedAccounts (parity with the
// lambda resolvePrimary stage). List mode filters to primaries (linked_to_primary_id IS NULL) like the lambda.
export async function usersListOrSearch(sql: Db, schema: string, params: URLSearchParams): Promise<AdminResult> {
  const rawQParam = params.get('q');
  if (rawQParam) {
    const rawQ = rawQParam.trim();
    if (!rawQ) return { status: 400, body: { error: 'Missing query parameter: q' } };
    if (rawQ.length > 128) return { status: 400, body: { error: 'Query too long (max 128 chars)' } };

    const rawField = (params.get('field') ?? 'auto').toLowerCase();
    const resolvePrimary = params.get('resolvePrimary') !== 'false';

    const fieldKind: FieldKind = (() => {
      if (rawField === 'twitter') return 'twitter';
      if (rawField === 'google') return 'google';
      if (rawField === 'telegram') return /^\d+$/.test(rawQ) ? 'telegram_id' : 'telegram_username';
      if (rawField === 'wallet') return 'wallet';
      if (rawField === 'identityid' || rawField === 'identity_id') return 'identity_id';
      if (rawField === 'displayname') return 'displayname';
      return inferField(rawQ);
    })();

    const cols = PROFILE_COLS(sql);
    let matched: ProfileRow[] = [];

    if (fieldKind === 'identity_id') {
      matched = await sql<ProfileRow[]>`SELECT ${cols} FROM ${sql(schema)}.user_profiles WHERE identity_id = ${rawQ} LIMIT 1`;
    } else if (fieldKind === 'twitter') {
      const normalized = rawQ.replace(/^@/, '').toLowerCase();
      matched = await sql<ProfileRow[]>`
        SELECT ${cols} FROM ${sql(schema)}.user_profiles
        WHERE twitter_handle = ${normalized}
           OR (linked_to_primary_id IS NULL AND linked_accounts->'twitter'->>'twitterHandle' = ${normalized})`;
    } else if (fieldKind === 'google') {
      const normalizedEmail = rawQ.toLowerCase();
      matched = await sql<ProfileRow[]>`
        SELECT ${cols} FROM ${sql(schema)}.user_profiles
        WHERE linked_to_primary_id IS NULL
          AND (lower(attributes->>'email') = ${normalizedEmail}
               OR lower(linked_accounts->'google'->>'email') = ${normalizedEmail})`;
    } else if (fieldKind === 'telegram_id') {
      matched = await sql<ProfileRow[]>`
        SELECT ${cols} FROM ${sql(schema)}.user_profiles WHERE telegram_user_id = ${rawQ}`;
    } else if (fieldKind === 'telegram_username') {
      const normalized = rawQ.replace(/^@/, '').toLowerCase();
      matched = await sql<ProfileRow[]>`
        SELECT ${cols} FROM ${sql(schema)}.user_profiles
        WHERE linked_to_primary_id IS NULL AND lower(attributes->>'telegramUsername') = ${normalized}`;
    } else if (fieldKind === 'wallet') {
      const normalizedWallet = rawQ.toLowerCase();
      // wallet_address + metamask are stored lower-cased, but the 'nasun wallet' (Sui) address preserves
      // its original case in linked_accounts jsonb -- lower() both sides of that jsonb compare so a Sui
      // wallet search is not silently missed (parity with the lambda's lower-cased rawQ comparison).
      matched = await sql<ProfileRow[]>`
        SELECT ${cols} FROM ${sql(schema)}.user_profiles
        WHERE linked_to_primary_id IS NULL
          AND (wallet_address = ${normalizedWallet}
               OR linked_accounts->'metamask'->>'walletAddress' = ${normalizedWallet}
               OR lower(linked_accounts->'nasun wallet'->>'walletAddress') = ${normalizedWallet})`;
    } else {
      // displayname (lambda: contains(customDisplayName, q) = LITERAL case-sensitive substring). Escape the
      // LIKE metacharacters \ % _ in rawQ so they match literally (parity with DDB contains(), where %/_ are
      // not wildcards), then wrap in %...% with an explicit ESCAPE clause.
      const escaped = rawQ.replace(/[\\%_]/g, (ch) => '\\' + ch);
      matched = await sql<ProfileRow[]>`
        SELECT ${cols} FROM ${sql(schema)}.user_profiles
        WHERE linked_to_primary_id IS NULL
          AND attributes->>'customDisplayName' LIKE ${'%' + escaped + '%'} ESCAPE '\'`;
    }

    // Resolve secondaries to their primary + enrich linkedAccounts (lambda resolvePrimary stage).
    let resolved: ProfileRow[] = matched;
    if (resolvePrimary && matched.length > 0) {
      const primaryById = new Map<string, ProfileRow>();
      const secondariesByPrimary = new Map<string, ProfileRow[]>();
      for (const row of matched) {
        if (row.linked_to_primary_id) {
          const list = secondariesByPrimary.get(row.linked_to_primary_id) ?? [];
          list.push(row);
          secondariesByPrimary.set(row.linked_to_primary_id, list);
        } else {
          primaryById.set(row.identity_id, row);
        }
      }
      for (const pid of secondariesByPrimary.keys()) {
        if (primaryById.has(pid)) continue;
        const p = await getProfileByIdentity(sql, schema, pid);
        if (p) primaryById.set(pid, p);
      }
      for (const [pid, primary] of primaryById) {
        const secondaries = secondariesByPrimary.get(pid);
        if (!secondaries || secondaries.length === 0) continue;
        const la: Record<string, any> = (primary.linked_accounts && typeof primary.linked_accounts === 'object')
          ? { ...(primary.linked_accounts as Record<string, any>) }
          : {};
        for (const sec of secondaries) {
          const sa = (sec.attributes || {}) as Record<string, unknown>;
          const twId = sec.twitter_id ?? (typeof sa.twitterId === 'string' ? sa.twitterId : undefined);
          const twHandle = sec.twitter_handle ?? (typeof sa.twitterHandle === 'string' ? sa.twitterHandle : undefined);
          if (twHandle || twId) {
            const tw = { ...(la.twitter || {}) };
            if (tw.twitterHandle == null && twHandle) tw.twitterHandle = twHandle;
            if (tw.twitterId == null && twId) tw.twitterId = twId;
            la.twitter = tw;
          }
          const secEmail = typeof sa.email === 'string' ? sa.email : undefined;
          if (secEmail) {
            const g = { ...(la.google || {}) };
            if (g.email == null) g.email = secEmail;
            la.google = g;
          }
          const tgUsername = typeof sa.telegramUsername === 'string' ? sa.telegramUsername : undefined;
          if (sec.telegram_user_id || tgUsername) {
            const tg = { ...(la.telegram || {}) };
            if (tg.telegramUserId == null && sec.telegram_user_id) tg.telegramUserId = sec.telegram_user_id;
            if (tg.telegramUsername == null && tgUsername) tg.telegramUsername = tgUsername;
            la.telegram = tg;
          }
        }
        primaryById.set(pid, { ...primary, linked_accounts: la });
      }
      resolved = [...primaryById.values()];
    }

    return {
      status: 200,
      body: {
        success: true,
        query: { q: rawQ, field: fieldKind, resolvePrimary },
        matches: resolved.map(parseUserProfileDetail),
        truncated: false,
      },
    };
  }

  // List mode (no q): paginated over the primaries, keyset by identity_id (the lambda's opaque nextToken
  // was a DDB LastEvaluatedKey; the box uses identity_id keyset, base64-encoded, with the SAME nextToken
  // contract -- an opaque cursor the client round-trips).
  const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') || '50', 10) || 50));
  const nextToken = params.get('nextToken');
  let afterId = '';
  if (nextToken) {
    try {
      afterId = Buffer.from(nextToken, 'base64').toString('utf-8');
    } catch {
      return { status: 400, body: { error: 'Invalid nextToken' } };
    }
  }
  const rows = await sql<ProfileRow[]>`
    SELECT ${PROFILE_COLS(sql)} FROM ${sql(schema)}.user_profiles
    WHERE linked_to_primary_id IS NULL AND identity_id > ${afterId}
    ORDER BY identity_id ASC LIMIT ${limit}`;
  const users = rows.map(parseUserProfileItem).map(toListItem);
  const encodedNextToken = rows.length === limit
    ? Buffer.from(rows[rows.length - 1].identity_id).toString('base64')
    : undefined;
  return { status: 200, body: { success: true, users, nextToken: encodedNextToken } };
}
