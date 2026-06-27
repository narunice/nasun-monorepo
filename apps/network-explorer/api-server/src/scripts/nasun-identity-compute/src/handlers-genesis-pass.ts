// AWS-exit #5: genesis-pass register de-Lambda (cdk/lambda-src/genesis-pass/register/src/index.ts).
// GET (compute_ro read on the server's `sql` pool): own registration status via the identityId-index GSI
// + linked-identity resolution + linked-wallet conflict check (byte-parity with the lambda handleGetStatus).
// POST/DELETE (writes) read the profile here (compute_ro) to resolve the linked identities + the EVM wallet,
// then delegate the authoritative allowlist mutation to the box identity service (:3211) via clients.ts --
// compute_ro is SELECT-only and the upsert/withdraw branching (takeover / wallet-change / race) needs an
// atomic transaction. The lambda read the EVM wallet from UserProfiles server-side (never the client body);
// this preserves that (extractLinkedWallet off the profile row).
import type { Sql } from 'postgres';
import { genesisPassRegisterUpsert, genesisPassWithdrawDelegate } from './clients';

type Db = Sql<{}>;
type Result = { status: number; body: Record<string, unknown> };

const EVM_REGEX = /^0x[a-fA-F0-9]{40}$/;
const ACTIVE_STATUSES = new Set(['ACTIVE', 'APPLIED', 'LEGACY']);
const MAX_LINKED_IDENTITIES = 5;

interface GpProfileRow {
  linked_accounts: Record<string, any> | null;
  linked_to_primary_id: string | null;
  wallet_address: string | null;
  twitter_handle: string | null;
  attributes: Record<string, unknown> | null;
}

async function readGpProfile(sql: Db, schema: string, identityId: string): Promise<GpProfileRow | null> {
  const rows = await sql<GpProfileRow[]>`
    SELECT linked_accounts, linked_to_primary_id, wallet_address, twitter_handle, attributes
    FROM ${sql(schema)}.user_profiles WHERE identity_id = ${identityId} LIMIT 1`;
  return rows[0] ?? null;
}

// Collect self + primary + linked-account identityIds (bidirectional guard, cap 5). Parity with the lambda
// collectLinkedIdentityIds (register/index.ts:88-128): a linked account whose linkedToPrimaryId points
// somewhere other than this identity or its primary is skipped as suspicious.
export function collectLinkedIdentityIds(identityId: string, profile: GpProfileRow | null): string[] {
  const ids = new Set<string>([identityId]);
  if (!profile) return [...ids];
  if (typeof profile.linked_to_primary_id === 'string' && profile.linked_to_primary_id) {
    ids.add(profile.linked_to_primary_id);
  }
  const la = profile.linked_accounts;
  if (la && typeof la === 'object') {
    for (const [provider, account] of Object.entries(la) as [string, any][]) {
      if (account?.identityId && typeof account.identityId === 'string') {
        const backRef = account.linkedToPrimaryId;
        if (backRef && backRef !== identityId && backRef !== profile.linked_to_primary_id) {
          console.warn(`[compute][genesis-pass] Skipping suspicious link: ${provider} identity ${account.identityId} points to ${backRef}, not ${identityId}`);
          continue;
        }
        ids.add(account.identityId);
      }
    }
  }
  if (ids.size > MAX_LINKED_IDENTITIES) {
    console.warn(`[compute][genesis-pass] Too many linked identities (${ids.size}) for ${identityId}, capping at ${MAX_LINKED_IDENTITIES}`);
    return [...ids].slice(0, MAX_LINKED_IDENTITIES);
  }
  return [...ids];
}

// linkedAccounts.metamask.walletAddress || (attributes.provider==='MetaMask' ? walletAddress). NOT lowercased
// (the caller/box normalizes). Parity with the lambda's walletAddress resolution (server-side, never client).
function extractLinkedWallet(profile: GpProfileRow): string | undefined {
  const mm = profile.linked_accounts?.metamask?.walletAddress;
  if (typeof mm === 'string' && mm) return mm;
  const provider = (profile.attributes as Record<string, unknown> | null)?.provider;
  if (provider === 'MetaMask' && typeof profile.wallet_address === 'string' && profile.wallet_address) {
    return profile.wallet_address;
  }
  return undefined;
}

// profile.twitterHandle || linkedAccounts.twitter.twitterHandle (lambda handleRegister twitterHandle).
function extractTwitterHandle(profile: GpProfileRow): string | undefined {
  if (typeof profile.twitter_handle === 'string' && profile.twitter_handle) return profile.twitter_handle;
  const th = profile.linked_accounts?.twitter?.twitterHandle;
  return typeof th === 'string' && th ? th : undefined;
}

// GET /genesis-pass/register -- own registration status. Parity with the lambda handleGetStatus.
export async function genesisPassRegisterStatus(sql: Db, schema: string, identityId: string): Promise<Result> {
  const profile = await readGpProfile(sql, schema, identityId);
  const allIds = collectLinkedIdentityIds(identityId, profile);
  const idSet = new Set(allIds);

  // array_position(allIds, identity_id) preserves the lambda findRegistrationByAnyIdentity ordering (it
  // queries the GSI per id in allIds order and takes the FIRST match; allIds[0] is self). Without it ANY(...)
  // LIMIT 1 picks an arbitrary row when a user has entries under multiple linked identities.
  const existRows = await sql<{ wallet_address: string; identity_id: string | null; status: string | null; mint_type: string | null; registered_at_iso: string | null }[]>`
    SELECT wallet_address, identity_id, status, mint_type,
      to_char(registered_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS registered_at_iso
    FROM ${sql(schema)}.genesis_pass_allowlist WHERE identity_id = ANY(${allIds})
    ORDER BY array_position(${allIds}, identity_id) LIMIT 1`;
  const existing = existRows[0] ?? null;

  const linkedWallet = profile ? extractLinkedWallet(profile)?.toLowerCase() : undefined;
  let walletConflict = false;
  if (linkedWallet) {
    const confRows = await sql<{ identity_id: string | null; status: string | null }[]>`
      SELECT identity_id, status FROM ${sql(schema)}.genesis_pass_allowlist WHERE wallet_address = ${linkedWallet}`;
    const c = confRows[0];
    if (c && !idSet.has(c.identity_id ?? '') && ACTIVE_STATUSES.has(c.status ?? '')) walletConflict = true;
  }

  if (!existing || existing.status === 'WITHDRAWN') {
    return { status: 200, body: { success: true, data: { registered: false, applied: false, status: null, walletConflict } } };
  }
  return {
    status: 200,
    body: {
      success: true,
      data: {
        registered: existing.status === 'ACTIVE',
        applied: existing.status === 'APPLIED',
        status: existing.status,
        walletAddress: existing.wallet_address,
        registeredAt: existing.registered_at_iso,
        walletConflict,
        ...(existing.mint_type ? { mintType: existing.mint_type } : {}),
      },
    },
  };
}

// POST /genesis-pass/register -- read EVM wallet + linked identities (compute_ro), then delegate the atomic
// upsert to :3211. Parity with the lambda handleRegister's pre-write validation (PROFILE_NOT_FOUND /
// NO_EVM_WALLET / INVALID_ADDRESS); the allowlist branching (existing-by-identity, takeover, wallet-change,
// approvals mintType, race) lives in the box tx for atomicity.
export async function genesisPassRegister(sql: Db, schema: string, identityId: string): Promise<Result> {
  const profile = await readGpProfile(sql, schema, identityId);
  if (!profile) {
    return { status: 404, body: { success: false, error: 'PROFILE_NOT_FOUND', message: 'User profile not found' } };
  }
  const allIds = collectLinkedIdentityIds(identityId, profile);
  const walletAddress = extractLinkedWallet(profile);
  if (!walletAddress) {
    return { status: 400, body: { success: false, error: 'NO_EVM_WALLET', message: 'No EVM wallet linked to your account. Please connect a MetaMask wallet first.' } };
  }
  if (!EVM_REGEX.test(walletAddress)) {
    return { status: 400, body: { success: false, error: 'INVALID_ADDRESS', message: 'Invalid EVM wallet address format' } };
  }
  const twitterHandle = extractTwitterHandle(profile);
  return genesisPassRegisterUpsert({ identityId, allIdentityIds: allIds, walletAddress, twitterHandle });
}

// DELETE /genesis-pass/register -- resolve linked identities + linked wallet (compute_ro), delegate the
// soft-delete to :3211. Parity with the lambda handleWithdraw (PROFILE_NOT_FOUND, then wallet-PK lookup with
// identityId-GSI fallback inside the box tx).
export async function genesisPassWithdraw(sql: Db, schema: string, identityId: string): Promise<Result> {
  const profile = await readGpProfile(sql, schema, identityId);
  if (!profile) {
    return { status: 404, body: { success: false, error: 'PROFILE_NOT_FOUND', message: 'User profile not found' } };
  }
  const allIds = collectLinkedIdentityIds(identityId, profile);
  const walletAddress = extractLinkedWallet(profile);
  return genesisPassWithdrawDelegate({ identityId, allIdentityIds: allIds, walletAddress: walletAddress ?? null });
}
