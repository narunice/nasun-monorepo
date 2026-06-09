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
  const registeredAt = new Date().toISOString();
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
          (identity_id, linked_accounts, linked_to_primary_id, twitter_handle, twitter_id, is_telegram_member, created_at, updated_at)
        VALUES (${r.identityId}, ${laBind}, ${r.ltp}, ${r.th}, ${r.tid}, false, now(), now())
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
// than the lambda's non-atomic sequence). telegram_username is NOT mirrored (no box column).
async function handleTelegramVerify(body) {
  const identityId = str(body.identityId);
  const tgId = str(body.telegramUserId);
  if (!identityId || identityId.length > 256) throw new RouteAbort(400, { error: 'identityId required' });
  if (!/^\d{1,20}$/.test(tgId)) throw new RouteAbort(400, { error: 'invalid telegramUserId' });
  await sql.begin(async (tx) => {
    await tx`SET LOCAL search_path = ${sql(SCHEMA)}`;
    await tx`
      UPDATE user_profiles SET is_telegram_member = false, telegram_user_id = NULL, updated_at = now()
      WHERE telegram_user_id = ${tgId} AND identity_id <> ${identityId}`;
    // attribute_exists(identityId) parity: a missing row is a no-op (box follower; reload backstops).
    await tx`
      UPDATE user_profiles SET is_telegram_member = true, telegram_user_id = ${tgId}, updated_at = now()
      WHERE identity_id = ${identityId}`;
  });
  return { status: 200, body: { identityId, telegramUserId: tgId } };
}

// --- POST /telegram/disconnect --------------------------------------------------------
// S2.B. disconnect-telegram.ts clearUserProfileTelegram -> tx.
async function handleTelegramDisconnect(body) {
  const identityId = str(body.identityId);
  if (!identityId || identityId.length > 256) throw new RouteAbort(400, { error: 'identityId required' });
  await sql.begin(async (tx) => {
    await tx`SET LOCAL search_path = ${sql(SCHEMA)}`;
    await tx`
      UPDATE user_profiles SET is_telegram_member = false, telegram_user_id = NULL, updated_at = now()
      WHERE identity_id = ${identityId}`;
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

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    return send(res, 200, { status: 'ok', service: 'nasun-identity', schema: SCHEMA });
  }
  const handler = req.method === 'POST' ? ROUTES[req.url] : undefined;
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
