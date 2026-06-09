// Nasun identity write service -- box-co-located de-Lambda of the wallet+profile slice
// (AWS-exit DAL S1). Mirrors the issuer server.mjs shape (node:http + postgres +
// constant-time bearer) but writes identity rows instead of minting JWTs.
//
// During the S1 grace it runs as a FOLLOWER: the (still-AWS) login/wallet lambdas keep
// writing DynamoDB as the source of truth, then additionally call these routes so the box
// PG mirror carries the same write. dal-reload (full re-scan) + dal-reconcile stay the
// backstop, so a missed or skewed box write self-heals on the next 10-min reload. The box
// is NOT authoritative in S1 (no serving flip, no DDB-write removal -- that is S2/S3).
//
// Routes (POST = server-to-server bearer; the caller has already verified the user and the
// wallet proof, so the box trusts the bearer and writes):
//   GET  /health
//   POST /profile/upsert       { identityId, walletAddress, provider }
//   POST /wallet/register      { identityId, walletAddress }
//   POST /wallet/remove        { identityId, walletAddress }
//   POST /profile/link-sync    { rows: [{ identityId, linkedAccounts, linkedToPrimaryId, twitterHandle, twitterId, walletAddressNull? }] }  (S2.A)
//   POST /telegram/verify      { identityId, telegramUserId }   (S2.B)
//   POST /telegram/disconnect  { identityId }                   (S2.B)
//
// Each write is ONE transaction (the lambda TransactWrite -> a single PG tx; sentinel CAS
// and ownership transfer preserved). Tables are reached through search_path = IDENTITY_PG_SCHEMA
// (default public) so a scratch schema can be exercised in a smoke test without touching the
// live mirror. The role (nasun_identity) has SELECT/INSERT/UPDATE/DELETE on the three tables
// only and NO grant on the issuer schema.
//
// Secret delivery mirrors the issuer (systemd LoadCredentialEncrypted -> tmpfs
// $CREDENTIALS_DIRECTORY, host-bound, auto-removed on stop):
//   pg-password      -- nasun_identity DB password.
//   identity-bearer  -- shared secret the login/wallet lambdas present to call the POST routes.

import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const PORT = Number(process.env.IDENTITY_PORT || 3211);
const HOST = process.env.IDENTITY_BIND || '127.0.0.1';
const SCHEMA = process.env.IDENTITY_PG_SCHEMA || 'public';
const MAX_BODY = 4096;
const MAX_WALLETS_PER_ACCOUNT = 10;            // parity with wallet-api registerWallet.ts
const SUI_ADDRESS_REGEX = /^0x[a-f0-9]{64}$/;  // address is lower-cased before the test

const PG_HOST = process.env.IDENTITY_PG_HOST || '127.0.0.1';
const PG_PORT = Number(process.env.IDENTITY_PG_PORT || 5432);
const PG_DB = process.env.IDENTITY_PG_DATABASE || 'nasun_dal';
const PG_USER = process.env.IDENTITY_PG_USER || 'nasun_identity';

const credDir = process.env.CREDENTIALS_DIRECTORY;
const PG_PASSWORD_FILE = process.env.IDENTITY_PG_PASSWORD_FILE || (credDir ? `${credDir}/pg-password` : null);
const BEARER_FILE = process.env.IDENTITY_BEARER_FILE || (credDir ? `${credDir}/identity-bearer` : null);

const fatal = (m) => { console.error(`[identity] FATAL: ${m}`); process.exit(1); };
if (!PG_PASSWORD_FILE) fatal('pg-password not provided (CREDENTIALS_DIRECTORY/pg-password or IDENTITY_PG_PASSWORD_FILE)');
if (!BEARER_FILE) fatal('identity-bearer not provided (CREDENTIALS_DIRECTORY/identity-bearer or IDENTITY_BEARER_FILE)');

let pgPassword;
try { pgPassword = readFileSync(PG_PASSWORD_FILE, 'utf8').trim(); } catch (e) { fatal(`cannot read pg-password: ${e.message}`); }
let bearer;
try { bearer = Buffer.from(readFileSync(BEARER_FILE, 'utf8').trim()); } catch (e) { fatal(`cannot read identity-bearer: ${e.message}`); }
if (bearer.length < 16) fatal('identity-bearer too short (>=16 bytes required)');

const sql = postgres({
  host: PG_HOST, port: PG_PORT, database: PG_DB, username: PG_USER, password: pgPassword,
  max: 8, idle_timeout: 30, connect_timeout: 15, prepare: false, onnotice: () => {},
  connection: { statement_timeout: '15000', lock_timeout: '8000', idle_in_transaction_session_timeout: '15000' },
});

// Thrown to roll a transaction back and map to a specific HTTP status (mirrors a lambda
// early-return / TransactionCanceledException). Anything else that throws is a 500.
class RouteAbort extends Error {
  constructor(status, body) { super('route_abort'); this.status = status; this.body = body; }
}

// Constant-time bearer check (issuer authorizedMint pattern).
function authorized(req) {
  const header = req.headers['authorization'] || '';
  const presented = header.startsWith('Bearer ') ? Buffer.from(header.slice(7)) : Buffer.alloc(0);
  return presented.length === bearer.length && timingSafeEqual(presented, bearer);
}

const str = (v) => (typeof v === 'string' ? v.trim() : '');

// --- POST /profile/upsert -------------------------------------------------------------
// createOrUpdateSuiProfile / createOrUpdateMetaMaskProfile -> PG. New row: attributes
// {provider, username}, linked_accounts {}. Existing row: only wallet_address + updated_at
// change (the lambda full-Put of {...existing, walletAddress, updatedAt} touches nothing
// else), so DO UPDATE preserves attributes/linked_accounts/created_at.
async function handleProfileUpsert(body) {
  const identityId = str(body.identityId);
  const addr = str(body.walletAddress).toLowerCase();
  const provider = str(body.provider) || 'Nasun Wallet';
  if (!identityId || identityId.length > 256) throw new RouteAbort(400, { error: 'identityId required' });
  if (!addr) throw new RouteAbort(400, { error: 'walletAddress required' });
  const displayAddr = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  await sql.begin(async (tx) => {
    await tx`SET LOCAL search_path = ${sql(SCHEMA)}`;
    await tx`
      INSERT INTO user_profiles (identity_id, wallet_address, linked_accounts, attributes, created_at, updated_at)
      VALUES (${identityId}, ${addr}, ${tx.json({})}, ${tx.json({ provider, username: displayAddr })}, now(), now())
      ON CONFLICT (identity_id) DO UPDATE
        SET wallet_address = ${addr}, updated_at = now()`;
  });
  return { status: 200, body: { identityId, walletAddress: addr } };
}

// --- POST /wallet/register ------------------------------------------------------------
// registerWallet.ts TransactWrite (2-item) + idempotent/transfer paths -> single PG tx.
// wallet_owner.updated_at stays NULL (the DDB sentinel item carries no updatedAt).
async function handleWalletRegister(body) {
  const identityId = str(body.identityId);
  const addr = str(body.walletAddress).toLowerCase();
  if (!identityId || identityId.length > 256) throw new RouteAbort(400, { error: 'identityId required' });
  if (!SUI_ADDRESS_REGEX.test(addr)) throw new RouteAbort(400, { error: 'Invalid Sui wallet address format' });
  // Prefer the DynamoDB-authoritative registeredAt carried by the caller so the mirrored row is
  // byte-identical to DDB even inside the register->next-reload transient window (S3.R2: /wallet/list
  // serves this field). Fall back to a fresh timestamp when absent (old caller / not wired) -- the
  // next dal-reload reconciles either way.
  const passedRegisteredAt = str(body.registeredAt);
  const registeredAt = (passedRegisteredAt && !Number.isNaN(Date.parse(passedRegisteredAt)))
    ? passedRegisteredAt
    : new Date().toISOString();
  const attrs = { blockchain: 'sui', registeredAt };

  return await sql.begin(async (tx) => {
    await tx`SET LOCAL search_path = ${sql(SCHEMA)}`;
    // Per-account limit (parity with the lambda's COUNT on user_wallets for this identity).
    const [{ n }] = await tx`SELECT count(*)::int AS n FROM user_wallets WHERE identity_id = ${identityId}`;
    if (n >= MAX_WALLETS_PER_ACCOUNT) throw new RouteAbort(429, { error: `Maximum ${MAX_WALLETS_PER_ACCOUNT} wallets per account` });

    // CAS on the sentinel == attribute_not_exists(walletAddress).
    const ins = await tx`
      INSERT INTO wallet_owner (wallet_address, owner_identity_id, updated_at)
      VALUES (${addr}, ${identityId}, NULL)
      ON CONFLICT (wallet_address) DO NOTHING
      RETURNING owner_identity_id`;
    if (ins.length > 0) {
      await tx`
        INSERT INTO user_wallets (identity_id, wallet_address, attributes, updated_at, created_at)
        VALUES (${identityId}, ${addr}, ${tx.json(attrs)}, now(), now())
        ON CONFLICT (identity_id, wallet_address) DO UPDATE SET updated_at = now()`;
      return { status: 200, body: { walletAddress: addr, blockchain: 'sui', registeredAt } };
    }

    // Conflict: someone owns it. Lock the row to make the read-then-act race-safe.
    const [owner] = await tx`SELECT owner_identity_id FROM wallet_owner WHERE wallet_address = ${addr} FOR UPDATE`;
    if (!owner) {
      // The sentinel was deleted between the failed CAS insert and this lock (a concurrent
      // /wallet/remove). It is now unowned; surface a clean retryable 409 instead of a
      // null deref. (S1 box is a follower; the caller logs and the next reload reconciles.)
      throw new RouteAbort(409, { error: 'wallet ownership changed, please retry' });
    }
    if (owner.owner_identity_id === identityId) {
      const [w] = await tx`SELECT attributes FROM user_wallets WHERE identity_id = ${identityId} AND wallet_address = ${addr}`;
      const a = w?.attributes || {};
      return { status: 200, body: { walletAddress: addr, blockchain: a.blockchain || 'sui', registeredAt: a.registeredAt || registeredAt } };
    }

    // Ownership transfer (the lambda does this because the wallet proof was already verified).
    const prevOwner = owner.owner_identity_id;
    await tx`DELETE FROM user_wallets WHERE identity_id = ${prevOwner} AND wallet_address = ${addr}`;
    await tx`
      INSERT INTO user_wallets (identity_id, wallet_address, attributes, updated_at, created_at)
      VALUES (${identityId}, ${addr}, ${tx.json(attrs)}, now(), now())
      ON CONFLICT (identity_id, wallet_address) DO UPDATE SET updated_at = now()`;
    // Sentinel updated_at stays NULL (the DDB transfer Update sets only ownerIdentityId).
    await tx`UPDATE wallet_owner SET owner_identity_id = ${identityId} WHERE wallet_address = ${addr} AND owner_identity_id = ${prevOwner}`;
    // Previous owner's profile pointer cleanup (best-effort in the lambda; folded into the tx here).
    await tx`UPDATE user_profiles SET wallet_address = NULL, updated_at = now() WHERE identity_id = ${prevOwner} AND lower(wallet_address) = ${addr}`;
    return { status: 200, body: { walletAddress: addr, blockchain: 'sui', registeredAt, transferred: true } };
  });
}

// --- POST /wallet/remove --------------------------------------------------------------
// removeWallet.ts (last-wallet guard + atomic sentinel-CAS delete + profile cleanup) -> tx.
async function handleWalletRemove(body) {
  const identityId = str(body.identityId);
  const addr = str(body.walletAddress).toLowerCase();
  if (!identityId || identityId.length > 256) throw new RouteAbort(400, { error: 'identityId required' });
  if (!addr) throw new RouteAbort(400, { error: 'walletAddress required' });

  return await sql.begin(async (tx) => {
    await tx`SET LOCAL search_path = ${sql(SCHEMA)}`;
    const [prof] = await tx`
      SELECT attributes->>'provider' AS provider, linked_accounts, wallet_address
      FROM user_profiles WHERE identity_id = ${identityId}`;
    const [{ n }] = await tx`
      SELECT count(*)::int AS n FROM user_wallets WHERE identity_id = ${identityId} AND wallet_address LIKE '0x%'`;
    const provider = prof?.provider;
    const walletCount = n;

    if (provider === 'Nasun Wallet' && walletCount <= 1) {
      throw new RouteAbort(400, { error: 'Cannot remove the last registered wallet for a Nasun Wallet account' });
    }

    const walletExists = walletCount > 0;
    if (walletExists) {
      // Atomic sentinel-CAS delete: 0 rows == "not your wallet" -> the lambda's TransactWrite
      // would cancel, so we roll back and 403 (no user_wallets delete, no cleanup).
      const delSent = await tx`DELETE FROM wallet_owner WHERE wallet_address = ${addr} AND owner_identity_id = ${identityId}`;
      if (delSent.count === 0) throw new RouteAbort(403, { error: 'You do not own this wallet' });
      await tx`DELETE FROM user_wallets WHERE identity_id = ${identityId} AND wallet_address = ${addr}`;
    }

    // Clean up UserProfiles references (legacy wallets may live only in the profile).
    let cleanedUp = false;
    const stored = prof?.wallet_address;
    if (stored && String(stored).toLowerCase() === addr) {
      await tx`UPDATE user_profiles SET wallet_address = NULL, updated_at = now() WHERE identity_id = ${identityId} AND lower(wallet_address) = ${addr}`;
      cleanedUp = true;
    }
    const la = prof?.linked_accounts || {};
    const nw = la['nasun wallet'];
    if (nw && str(nw.walletAddress).toLowerCase() === addr) {
      const secondaryId = str(nw.identityId);
      await tx`UPDATE user_profiles SET linked_accounts = linked_accounts - 'nasun wallet', updated_at = now() WHERE identity_id = ${identityId}`;
      cleanedUp = true;
      if (secondaryId) {
        await tx`UPDATE user_profiles SET linked_to_primary_id = NULL, updated_at = now() WHERE identity_id = ${secondaryId} AND linked_to_primary_id = ${identityId}`;
      }
    }

    if (!walletExists && !cleanedUp) throw new RouteAbort(404, { error: 'Wallet not found' });
    return { status: 200, body: { message: 'Wallet removed successfully' } };
  });
}

// --- POST /profile/link-sync ----------------------------------------------------------
// S2.A account-linking. link-account/index.ts mutates several UserProfiles rows (primary,
// secondary, and on auto-transfer the old primary) under DynamoDB CAS/uniqueness; DDB stays
// the source of truth and has already resolved every conflict. So the box does NOT re-run the
// CAS -- it mirrors the FULL resulting projection of each touched row in one tx (idempotent
// UPSERT). Only the dal-reload-mapped, link-account-owned columns are written: linked_accounts,
// linked_to_primary_id, twitter_handle, twitter_id (+ wallet_address->NULL only on the narrow
// metamask-primary unlink). is_telegram_member / telegram_user_id / attributes / created_at are
// left untouched on conflict so the telegram slice (S2.B) and reload keep ownership of them.
async function handleProfileLinkSync(body) {
  const rawRows = Array.isArray(body.rows) ? body.rows : null;
  if (!rawRows || rawRows.length === 0) throw new RouteAbort(400, { error: 'rows required' });
  if (rawRows.length > 64) throw new RouteAbort(400, { error: 'too many rows (max 64)' });

  const rows = rawRows.map((r) => {
    if (!r || typeof r !== 'object' || Array.isArray(r)) throw new RouteAbort(400, { error: 'row must be object' });
    const identityId = str(r.identityId);
    if (!identityId || identityId.length > 256) throw new RouteAbort(400, { error: 'row.identityId required' });
    let la;
    if (r.linkedAccounts == null) la = null;
    else if (typeof r.linkedAccounts === 'object' && !Array.isArray(r.linkedAccounts)) la = r.linkedAccounts;
    else throw new RouteAbort(400, { error: 'row.linkedAccounts must be object or null' });
    const ltp = r.linkedToPrimaryId == null ? null : (str(r.linkedToPrimaryId) || null);
    const th = r.twitterHandle == null ? null : (str(r.twitterHandle) || null);
    const tid = r.twitterId == null ? null : (str(r.twitterId) || null);
    const walletNull = r.walletAddressNull === true;
    return { identityId, la, ltp, th, tid, walletNull };
  });

  // primary-first: a row's linked_to_primary_id FK references a primary row that must already
  // exist. Rows with a NULL linkedToPrimaryId (primaries) are upserted before referrers; the
  // referenced primary is otherwise a pre-existing mirrored row.
  rows.sort((a, b) => (a.ltp ? 1 : 0) - (b.ltp ? 1 : 0));

  await sql.begin(async (tx) => {
    await tx`SET LOCAL search_path = ${sql(SCHEMA)}`;
    for (const r of rows) {
      const laBind = r.la === null ? null : tx.json(r.la);
      await tx`
        INSERT INTO user_profiles
          (identity_id, linked_accounts, linked_to_primary_id, twitter_handle, twitter_id, created_at, updated_at)
        VALUES (${r.identityId}, ${laBind}, ${r.ltp}, ${r.th}, ${r.tid}, now(), now())
        ON CONFLICT (identity_id) DO UPDATE SET
          linked_accounts = ${laBind},
          linked_to_primary_id = ${r.ltp},
          twitter_handle = ${r.th},
          twitter_id = ${r.tid},
          updated_at = now()`;
      if (r.walletNull) {
        await tx`UPDATE user_profiles SET wallet_address = NULL, updated_at = now() WHERE identity_id = ${r.identityId}`;
      }
    }
  });
  return { status: 200, body: { synced: rows.length } };
}

// --- POST /telegram/verify ------------------------------------------------------------
// S2.B. verify-telegram.ts: clear any prior owner of the telegram id (DDB GSI-query + sequential
// clear) then set the new owner. Done as ONE tx so 1:1 ownership is enforced atomically (stronger
// than the lambda's non-atomic sequence). telegramUsername lives in the attributes JSONB (not a
// promoted column); the lambda's DDB write SET telegramUsername (string or null) on the new owner
// and REMOVEs it from the prior owner, so we mirror the same into attributes: merge it on the new
// owner (when the field is present -- absent means an older lambda that does not send it, leave
// attributes untouched and let dal-reload converge) and drop it from the prior owner unconditionally.
async function handleTelegramVerify(body) {
  const identityId = str(body.identityId);
  const tgId = str(body.telegramUserId);
  if (!identityId || identityId.length > 256) throw new RouteAbort(400, { error: 'identityId required' });
  if (!/^\d{1,20}$/.test(tgId)) throw new RouteAbort(400, { error: 'invalid telegramUserId' });
  const hasUsername = Object.prototype.hasOwnProperty.call(body, 'telegramUsername');
  const tgUsername = typeof body.telegramUsername === 'string' ? body.telegramUsername : null;
  if (hasUsername && tgUsername !== null && tgUsername.length > 256) throw new RouteAbort(400, { error: 'telegramUsername too long' });
  await sql.begin(async (tx) => {
    await tx`SET LOCAL search_path = ${sql(SCHEMA)}`;
    // Prior owner: clear membership + drop telegramUsername from attributes (DDB REMOVE parity).
    await tx`
      UPDATE user_profiles
      SET is_telegram_member = false, telegram_user_id = NULL,
          attributes = COALESCE(attributes, '{}'::jsonb) - 'telegramUsername', updated_at = now()
      WHERE telegram_user_id = ${tgId} AND identity_id <> ${identityId}`;
    // New owner: a missing row is a no-op (box follower; reload backstops). Set telegramUsername
    // (string OR JSON null, matching the lambda's SET telegramUsername = :tgUsername) when present.
    if (hasUsername) {
      await tx`
        UPDATE user_profiles
        SET is_telegram_member = true, telegram_user_id = ${tgId},
            attributes = COALESCE(attributes, '{}'::jsonb) || ${tx.json({ telegramUsername: tgUsername })}::jsonb,
            updated_at = now()
        WHERE identity_id = ${identityId}`;
    } else {
      await tx`
        UPDATE user_profiles SET is_telegram_member = true, telegram_user_id = ${tgId}, updated_at = now()
        WHERE identity_id = ${identityId}`;
    }
  });
  return { status: 200, body: { identityId, telegramUserId: tgId } };
}

// --- POST /telegram/disconnect --------------------------------------------------------
// S2.B. disconnect-telegram.ts clearUserProfileTelegram -> tx. DDB REMOVEs telegramUserId +
// telegramUsername, so drop telegramUsername from attributes too (it lives in the JSONB, not a
// promoted column).
async function handleTelegramDisconnect(body) {
  const identityId = str(body.identityId);
  if (!identityId || identityId.length > 256) throw new RouteAbort(400, { error: 'identityId required' });
  await sql.begin(async (tx) => {
    await tx`SET LOCAL search_path = ${sql(SCHEMA)}`;
    await tx`
      UPDATE user_profiles
      SET is_telegram_member = false, telegram_user_id = NULL,
          attributes = COALESCE(attributes, '{}'::jsonb) - 'telegramUsername', updated_at = now()
      WHERE identity_id = ${identityId}`;
  });
  return { status: 200, body: { identityId } };
}

// --- POST /profile/attributes-sync ----------------------------------------------------
// S2.C self-write mirror. get-user-profile PATCH writes customDisplayName / customAvatarKey /
// linkedSuiAddress / linkedSolanaAddress (+ the *UpdatedAt stamps) AFTER the authoritative
// DynamoDB UpdateItem. Every one of those is an attributes-JSONB long-tail key (dal-reload
// promotes none of them), so the box merges the same `set` into attributes and drops the
// `remove` keys in one tx; updated_at -> column (parity with the PATCH updatedAt=:now). A
// missing row is a no-op (follower; reload backstops). Only the non-promoted PATCH keys are
// accepted, so a promoted column (twitter_handle, ...) can never be shadowed into attributes
// and collide on read. All values are strings (no NUMERIC sink).
const ATTRS_SYNC_SET_KEYS = new Set([
  'customDisplayName', 'displayNameUpdatedAt',
  'customAvatarKey', 'customAvatarUpdatedAt',
  'linkedSuiAddress', 'linkedSolanaAddress',
]);
const ATTRS_SYNC_REMOVE_KEYS = new Set(['customAvatarKey', 'linkedSuiAddress', 'linkedSolanaAddress']);

async function handleProfileAttributesSync(body) {
  const identityId = str(body.identityId);
  if (!identityId || identityId.length > 256) throw new RouteAbort(400, { error: 'identityId required' });
  const rawSet = (body.set && typeof body.set === 'object' && !Array.isArray(body.set)) ? body.set : {};
  const rawRemove = Array.isArray(body.remove) ? body.remove : [];

  const setEntries = {};
  for (const [k, v] of Object.entries(rawSet)) {
    if (!ATTRS_SYNC_SET_KEYS.has(k)) throw new RouteAbort(400, { error: `set key not allowed: ${k}` });
    if (typeof v !== 'string') throw new RouteAbort(400, { error: `set.${k} must be a string` });
    setEntries[k] = v;
  }
  const removeKeys = [];
  for (const k of rawRemove) {
    if (typeof k !== 'string' || !ATTRS_SYNC_REMOVE_KEYS.has(k)) throw new RouteAbort(400, { error: `remove key not allowed: ${k}` });
    removeKeys.push(k);
  }
  if (Object.keys(setEntries).length === 0 && removeKeys.length === 0) {
    throw new RouteAbort(400, { error: 'no set or remove fields' });
  }

  await sql.begin(async (tx) => {
    await tx`SET LOCAL search_path = ${sql(SCHEMA)}`;
    // Merge set, then drop removed keys ('- text[]' is a no-op on an empty array).
    await tx`
      UPDATE user_profiles
      SET attributes = (COALESCE(attributes, '{}'::jsonb) || ${tx.json(setEntries)}::jsonb) - ${removeKeys}::text[],
          updated_at = now()
      WHERE identity_id = ${identityId}`;
  });
  return { status: 200, body: { identityId } };
}

// --- POST /profile/create-mirror ------------------------------------------------------
// S2.C create mirror. get-user-profile POST creates a NEW non-social profile after the
// authoritative DynamoDB Put (ConditionExpression attribute_not_exists). Mirror as an
// INSERT ... ON CONFLICT DO NOTHING so it stays create-only (an existing box row -- e.g. one
// dal-reload already pulled -- is left untouched). twitterHandle/twitterId map to the promoted
// columns; provider/username/email/xHandle/profileImageUrl go to attributes.
async function handleProfileCreateMirror(body) {
  const identityId = str(body.identityId);
  const provider = str(body.provider);
  const username = str(body.username);
  if (!identityId || identityId.length > 256) throw new RouteAbort(400, { error: 'identityId required' });
  if (!provider) throw new RouteAbort(400, { error: 'provider required' });
  if (!username) throw new RouteAbort(400, { error: 'username required' });
  // Parity with the lambda BLOCKED_PROVIDERS guard: social providers exist only as linked
  // secondaries created by link-account.
  if (['google', 'twitter'].includes(provider.toLowerCase())) {
    throw new RouteAbort(403, { error: 'social provider profiles cannot be created directly' });
  }
  const twitterHandle = body.twitterHandle == null ? null : (str(body.twitterHandle) || null);
  const twitterId = body.twitterId == null ? null : (str(body.twitterId) || null);
  const attrs = { provider, username };
  for (const k of ['email', 'xHandle', 'profileImageUrl']) {
    const v = str(body[k]);
    if (v) attrs[k] = v;
  }
  await sql.begin(async (tx) => {
    await tx`SET LOCAL search_path = ${sql(SCHEMA)}`;
    await tx`
      INSERT INTO user_profiles
        (identity_id, twitter_handle, twitter_id, linked_accounts, attributes, created_at, updated_at)
      VALUES (${identityId}, ${twitterHandle}, ${twitterId}, ${tx.json({})}, ${tx.json(attrs)}, now(), now())
      ON CONFLICT (identity_id) DO NOTHING`;
  });
  return { status: 200, body: { identityId } };
}

const ROUTES = {
  '/profile/upsert': handleProfileUpsert,
  '/wallet/register': handleWalletRegister,
  '/wallet/remove': handleWalletRemove,
  '/profile/link-sync': handleProfileLinkSync,
  '/telegram/verify': handleTelegramVerify,
  '/telegram/disconnect': handleTelegramDisconnect,
  '/profile/attributes-sync': handleProfileAttributesSync,
  '/profile/create-mirror': handleProfileCreateMirror,
};

// ===== READ routes (S2.C get-user-profile reader cutover) =============================
// The (still-AWS) get-user-profile lambda calls these to read the profile from the box,
// shadow-comparing the result against its own DynamoDB read before any flip. The lambda's
// wallet path is coupled to the DynamoDB AttributeValue shape, so the box computes the SAME
// response body here (on plain values) rather than returning raw items. Reads are a single
// SELECT (no tx mutation); nasun_identity already has SELECT on user_profiles + wallet_owner
// (dal-reload swap GRANT), so the 3-hop runs against base tables -- no view grant needed.

// Reconstruct a DynamoDB-UserProfiles-item shape from a box row: attributes JSONB holds the
// long-tail (provider, username, customDisplayName, profileImageUrl, email, ...), promoted
// columns hold the identity-resolution fields. attributes excludes the promoted keys
// (dal-reload omit), so there is no collision; null columns are omitted to match an absent
// DynamoDB attribute.
function dalRowToItem(row) {
  if (!row) return null;
  const attrs = (row.attributes && typeof row.attributes === 'object' && !Array.isArray(row.attributes)) ? row.attributes : {};
  const item = { ...attrs, identityId: row.identity_id };
  if (row.wallet_address != null) item.walletAddress = row.wallet_address;
  if (row.twitter_handle != null) item.twitterHandle = row.twitter_handle;
  if (row.twitter_id != null) item.twitterId = row.twitter_id;
  if (row.telegram_user_id != null) item.telegramUserId = row.telegram_user_id;
  if (row.is_telegram_member != null) item.isTelegramMember = row.is_telegram_member;
  if (row.linked_accounts != null) item.linkedAccounts = row.linked_accounts;
  if (row.linked_to_primary_id != null) item.linkedToPrimaryId = row.linked_to_primary_id;
  // created_at/updated_at are promoted timestamptz columns (dal-reload sets them from the DDB
  // createdAt/updatedAt ISO strings). Emit only when the caller SELECTed them (by-identity, which
  // mirrors buildUnifiedProfile's full unmarshalled item). The by-wallet primary SELECT omits them,
  // so its fixed-shape response is unaffected. createdAt is immutable (matches DDB byte-for-byte);
  // updatedAt may differ by the dal-reload churn window but no consumer reads it (see
  // BY_IDENTITY_SHADOW_IGNORE in get-user-profile).
  const toIso = (v) => (v instanceof Date ? v.toISOString() : v);
  if (row.created_at != null) item.createdAt = toIso(row.created_at);
  if (row.updated_at != null) item.updatedAt = toIso(row.updated_at);
  return item;
}

// Mirror get-user-profile resolveDisplayName (plain-value form).
function resolveDisplayNameFromItem(item) {
  if (item.customDisplayName) return item.customDisplayName;
  if (item.provider === 'Twitter' && item.username) return item.username;
  const lt = item.linkedAccounts && item.linkedAccounts.twitter && item.linkedAccounts.twitter.username;
  if (lt) return lt;
  if (item.provider === 'Google' && item.email) return String(item.email).split('@')[0];
  const lg = item.linkedAccounts && item.linkedAccounts.google && item.linkedAccounts.google.email;
  if (lg) return String(lg).split('@')[0];
  return null;
}

async function fetchSecondaries(tx, ids) {
  const map = new Map();
  if (!ids.length) return map;
  const rows = await tx`
    SELECT identity_id, wallet_address, twitter_handle, twitter_id, telegram_user_id,
           is_telegram_member, linked_accounts, linked_to_primary_id, attributes
    FROM user_profiles WHERE identity_id = ANY(${ids})`;
  for (const r of rows) map.set(r.identity_id, dalRowToItem(r));
  return map;
}

// --- GET /profile/by-wallet?walletAddress=0x.. ---------------------------------------
// Mirrors get-user-profile GET-by-wallet (3-hop + linked-secondary merge + resolveDisplayName).
async function handleProfileByWallet(params) {
  const addr = str(params.get('walletAddress')).toLowerCase();
  if (!SUI_ADDRESS_REGEX.test(addr)) throw new RouteAbort(400, { error: 'Invalid wallet address format' });
  return await sql.begin(async (tx) => {
    await tx`SET LOCAL search_path = ${sql(SCHEMA)}`;
    const [primaryRow] = await tx`
      SELECT pp.identity_id, pp.wallet_address, pp.twitter_handle, pp.twitter_id, pp.telegram_user_id,
             pp.is_telegram_member, pp.linked_accounts, pp.linked_to_primary_id, pp.attributes
      FROM wallet_owner wo
      JOIN user_profiles up ON up.identity_id = wo.owner_identity_id
      JOIN user_profiles pp ON pp.identity_id = COALESCE(up.linked_to_primary_id, up.identity_id)
      WHERE wo.wallet_address = ${addr}`;
    // 404 -> the lambda falls back to its DynamoDB read (also covers box lag for new profiles).
    if (!primaryRow) throw new RouteAbort(404, { error: 'Wallet not registered or profile not found' });

    const profileItem = dalRowToItem(primaryRow);
    const linkedAccounts = profileItem.linkedAccounts ? JSON.parse(JSON.stringify(profileItem.linkedAccounts)) : {};

    let rootProfileImageUrl = profileItem.profileImageUrl || null;
    let rootTwitterHandle = profileItem.twitterHandle || null;
    let rootOriginalTwitterHandle = profileItem.originalTwitterHandle || null;
    let rootUsername = profileItem.username || null;
    let rootEmail = profileItem.email || null;

    const hopKeys = Object.keys(linkedAccounts).filter((p) => linkedAccounts[p] && linkedAccounts[p].identityId);
    const secondaries = await fetchSecondaries(tx, hopKeys.map((p) => linkedAccounts[p].identityId));

    for (const p of hopKeys) {
      const item = secondaries.get(linkedAccounts[p].identityId);
      if (!item) continue;
      if (!linkedAccounts[p].profileImageUrl && item.profileImageUrl) linkedAccounts[p].profileImageUrl = item.profileImageUrl;
      if (!linkedAccounts[p].username && item.username) linkedAccounts[p].username = item.username;
      const spv = (item.provider || '').toLowerCase();
      const canonical = spv === 'twitter' ? 'twitter' : spv === 'google' ? 'google' : null;
      if (canonical) {
        const merged = { ...(linkedAccounts[canonical] || {}) };
        if (!merged.profileImageUrl && item.profileImageUrl) merged.profileImageUrl = item.profileImageUrl;
        if (!merged.username && item.username) merged.username = item.username;
        if (canonical === 'twitter') {
          if (!merged.twitterHandle && item.twitterHandle) merged.twitterHandle = item.twitterHandle;
          if (!merged.originalTwitterHandle && item.originalTwitterHandle) merged.originalTwitterHandle = item.originalTwitterHandle;
        }
        if (canonical === 'google' && !merged.email && item.email) merged.email = item.email;
        linkedAccounts[canonical] = merged;
      }
      if (!rootProfileImageUrl && item.profileImageUrl) rootProfileImageUrl = item.profileImageUrl;
      if (!rootTwitterHandle && item.twitterHandle) rootTwitterHandle = item.twitterHandle;
      if (!rootOriginalTwitterHandle && item.originalTwitterHandle) rootOriginalTwitterHandle = item.originalTwitterHandle;
      if (!rootUsername && item.username) rootUsername = item.username;
      if (!rootEmail && item.email) rootEmail = item.email;
    }

    if (rootTwitterHandle || rootOriginalTwitterHandle) {
      const tw = linkedAccounts.twitter || {};
      linkedAccounts.twitter = {
        ...tw,
        profileImageUrl: tw.profileImageUrl || rootProfileImageUrl || undefined,
        twitterHandle: tw.twitterHandle || rootTwitterHandle || undefined,
        originalTwitterHandle: tw.originalTwitterHandle || rootOriginalTwitterHandle || undefined,
        username: tw.username || rootUsername || undefined,
      };
    }
    if (rootEmail) {
      const gl = linkedAccounts.google || {};
      linkedAccounts.google = {
        ...gl,
        profileImageUrl: gl.profileImageUrl || rootProfileImageUrl || undefined,
        email: gl.email || rootEmail || undefined,
      };
    }

    const mergedItemForName = {
      ...profileItem,
      username: rootUsername || profileItem.username,
      twitterHandle: rootTwitterHandle || profileItem.twitterHandle,
      originalTwitterHandle: rootOriginalTwitterHandle || profileItem.originalTwitterHandle,
      email: rootEmail || profileItem.email,
    };

    return { status: 200, body: {
      resolvedDisplayName: resolveDisplayNameFromItem(mergedItemForName),
      provider: profileItem.provider || null,
      profileImageUrl: rootProfileImageUrl,
      twitterHandle: rootOriginalTwitterHandle || rootTwitterHandle || null,
      customAvatarKey: profileItem.customAvatarBanned === true ? null : (profileItem.customAvatarKey || null),
      customDisplayName: profileItem.customDisplayName || null,
      walletAddress: addr,
      linkedAccounts,
    } };
  });
}

// --- GET /profile/by-identity?identityId=.. ------------------------------------------
// Mirrors get-user-profile buildUnifiedProfile (full item + linked-secondary field merge).
async function handleProfileByIdentity(params) {
  const identityId = str(params.get('identityId'));
  if (!identityId || identityId.length > 256) throw new RouteAbort(400, { error: 'identityId required' });
  return await sql.begin(async (tx) => {
    await tx`SET LOCAL search_path = ${sql(SCHEMA)}`;
    const [row] = await tx`
      SELECT identity_id, wallet_address, twitter_handle, twitter_id, telegram_user_id,
             is_telegram_member, linked_accounts, linked_to_primary_id, attributes,
             created_at, updated_at
      FROM user_profiles WHERE identity_id = ${identityId}`;
    if (!row) throw new RouteAbort(404, { error: 'User profile not found' });
    const baseProfile = dalRowToItem(row);
    const unified = { ...baseProfile };
    const la = (baseProfile.linkedAccounts && typeof baseProfile.linkedAccounts === 'object') ? baseProfile.linkedAccounts : {};
    const hopKeys = Object.keys(la).filter((p) => la[p] && la[p].identityId);
    const secondaries = await fetchSecondaries(tx, hopKeys.map((p) => la[p].identityId));
    const fieldsToMerge = ['email', 'twitterHandle', 'originalTwitterHandle', 'twitterId', 'profileImageUrl', 'username', 'walletAddress'];
    for (const p of hopKeys) {
      const sec = secondaries.get(la[p].identityId);
      if (!sec) continue;
      const { linkedAccounts: _drop, ...linkedProfile } = sec;
      for (const f of fieldsToMerge) {
        if (linkedProfile[f] && !unified[f]) unified[f] = linkedProfile[f];
      }
    }
    return { status: 200, body: unified };
  });
}

// --- GET /wallet/list?identityId=.. --------------------------------------------------
// Mirrors wallet-api listWallets (S3.R2): Query UserWallets (identityId AND begins_with(
// walletAddress,'0x')) -> { wallets: [{ walletAddress, blockchain, label?, registeredAt }] }.
// DynamoDB returns sort-key (walletAddress) ascending; every address is lower-case hex
// (registerWallet SUI_ADDRESS_REGEX), so `ORDER BY wallet_address ASC` is byte-identical to the
// DDB order. blockchain/registeredAt/label live in the attributes JSONB (dal-reload projection);
// label has no writer today so the spread is a no-op in practice but kept for shape parity.
async function handleWalletList(params) {
  const identityId = str(params.get('identityId'));
  if (!identityId || identityId.length > 256) throw new RouteAbort(400, { error: 'identityId required' });
  return await sql.begin(async (tx) => {
    await tx`SET LOCAL search_path = ${sql(SCHEMA)}`;
    const rows = await tx`
      SELECT wallet_address, attributes
      FROM user_wallets
      WHERE identity_id = ${identityId} AND wallet_address LIKE '0x%'
      ORDER BY wallet_address ASC`;
    const wallets = rows.map((r) => {
      const a = (r.attributes && typeof r.attributes === 'object') ? r.attributes : {};
      const blockchain = (typeof a.blockchain === 'string' && a.blockchain) ? a.blockchain : 'sui';
      return {
        walletAddress: r.wallet_address,
        blockchain,
        ...(a.label ? { label: a.label } : {}),
        registeredAt: a.registeredAt,
      };
    });
    return { status: 200, body: { wallets } };
  });
}

const GET_ROUTES = {
  '/profile/by-wallet': handleProfileByWallet,
  '/profile/by-identity': handleProfileByIdentity,
  '/wallet/list': handleWalletList,
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const send = (res, code, obj) => {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
};

// Retry a READ on a transient conflict with the dal-reload atomic schema swap. The swap
// (DROP + schema rename, sub-second) takes an AccessExclusiveLock; a concurrent read tx holding
// AccessShareLock across its two SELECTs can lose a deadlock (40P01), hit lock_timeout (55P03),
// or briefly observe a missing relation/schema mid-swap (42P01/3F000). All are transient and the
// reads are idempotent + read-only, so a short backed-off retry lands after the swap completes.
// RouteAbort (4xx, e.g. 404) and any non-transient error propagate immediately.
const TRANSIENT_PG_CODES = new Set(['40P01', '40001', '55P03', '42P01', '3F000']);
async function withReadRetry(fn, attempts = 3) {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof RouteAbort) throw e;
      if (i >= attempts - 1 || !TRANSIENT_PG_CODES.has(e && e.code)) throw e;
      await new Promise((r) => setTimeout(r, 40 * (i + 1)));
    }
  }
}

const server = createServer(async (req, res) => {
  let parsed;
  try { parsed = new URL(req.url, 'http://localhost'); } catch { return send(res, 400, { error: 'bad_url' }); }
  const pathname = parsed.pathname;

  if (req.method === 'GET' && pathname === '/health') {
    return send(res, 200, { status: 'ok', service: 'nasun-identity', schema: SCHEMA });
  }

  // GET read routes (bearer-gated, query-param input, no body).
  if (req.method === 'GET') {
    const ghandler = GET_ROUTES[pathname];
    if (!ghandler) return send(res, 404, { error: 'not_found' });
    if (!authorized(req)) return send(res, 401, { error: 'unauthorized' });
    try {
      const { status, body: out } = await withReadRetry(() => ghandler(parsed.searchParams));
      return send(res, status, out);
    } catch (e) {
      if (e instanceof RouteAbort) return send(res, e.status, e.body);
      console.error(`[identity] ${pathname} failed:`, e instanceof Error ? e.message : e);
      return send(res, 500, { error: 'internal_error' });
    }
  }

  const handler = req.method === 'POST' ? ROUTES[pathname] : undefined;
  if (!handler) return send(res, 404, { error: 'not_found' });
  if (!authorized(req)) return send(res, 401, { error: 'unauthorized' });
  let body;
  try { body = JSON.parse((await readBody(req)) || '{}'); }
  catch { return send(res, 400, { error: 'invalid_json' }); }
  // Reject non-object JSON (null, arrays, scalars) so handlers never deref a non-object.
  if (!body || typeof body !== 'object' || Array.isArray(body)) return send(res, 400, { error: 'invalid_body' });
  try {
    const { status, body: out } = await handler(body);
    return send(res, status, out);
  } catch (e) {
    if (e instanceof RouteAbort) return send(res, e.status, e.body);
    console.error(`[identity] ${req.url} failed:`, e instanceof Error ? e.message : e);
    return send(res, 500, { error: 'internal_error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[identity] listening http://${HOST}:${PORT} schema=${SCHEMA} db=${PG_USER}@${PG_HOST}:${PG_PORT}/${PG_DB}`);
});

const shutdown = () => { sql.end({ timeout: 5 }).catch(() => {}); server.close(() => process.exit(0)); };
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, shutdown);
