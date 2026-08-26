// Nasun self-hosted JWT issuer -- live service (Cognito replacement, Stage 2 §A).
//
// Endpoints:
//   GET  /.well-known/jwks.json  -- public JWKS the 6+ verify sites fetch during the dual-JWKS grace.
//   GET  /health                 -- liveness.
//   POST /mint                   -- authenticated. Drop-in replacement for Cognito
//                                   GetOpenIdTokenForDeveloperIdentity: { developerUserIdentifier, provider }
//                                   -> { identityId, token }. Looks up issuer.identity_map (append-only),
//                                   creates a new identity for first-seen credentials, then mints a nasun JWT.
//   POST /zklogin/salt           -- authenticated. Hosted PG salt store (replaces the zklogin-salt
//                                   lambda's DynamoDB). Append-only, keyed (provider, sub). The lambda
//                                   still verifies the OIDC JWT + derives the address; the box only
//                                   persists, so it needs neither @mysten/sui nor the raw JWT.
//
// Minted tokens carry { iss: 'nasun-issuer', aud: <Cognito Identity Pool id, for continuity>,
// sub: <identityId> } so the existing `audience` check keeps passing during grace (design §A.1).
//
// Secret delivery (systemd LoadCredentialEncrypted -> tmpfs $CREDENTIALS_DIRECTORY, never plaintext on
// disk, host-bound, auto-removed on stop):
//   issuer-key   -- RS256 PKCS8 private key (signing).
//   pg-password  -- nasun_issuer DB password (issuer.identity_map only; SELECT+INSERT, append-only role).
//   mint-secret  -- shared secret the (still-AWS) login lambdas present to call /mint during grace.

import { importPKCS8, exportJWK, SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import postgres from 'postgres';

const NASUN_ISS = 'nasun-issuer';
const AUD = process.env.ISSUER_AUDIENCE || process.env.COGNITO_IDENTITY_POOL_ID;
const PORT = Number(process.env.ISSUER_PORT || 3210);
const HOST = process.env.ISSUER_BIND || '127.0.0.1';
const TOKEN_TTL = process.env.ISSUER_TOKEN_TTL || '1h';
const KID = process.env.ISSUER_KID;
// New (first-seen) identities mint with this prefix so their shape matches the legacy Cognito
// `<region>:<uuid>` ids the rest of the system already treats as opaque keys.
const NEW_ID_PREFIX = process.env.ISSUER_NEW_IDENTITY_PREFIX || '';
const MAX_BODY = 4096;

const credDir = process.env.CREDENTIALS_DIRECTORY;
const KEY_FILE = process.env.ISSUER_KEY_FILE || (credDir ? `${credDir}/issuer-key` : null);
const PG_PASSWORD_FILE = process.env.ISSUER_PG_PASSWORD_FILE || (credDir ? `${credDir}/pg-password` : null);
const MINT_SECRET_FILE = process.env.ISSUER_MINT_SECRET_FILE || (credDir ? `${credDir}/mint-secret` : null);

const PG_HOST = process.env.ISSUER_PG_HOST || '127.0.0.1';
const PG_PORT = Number(process.env.ISSUER_PG_PORT || 5432);
const PG_DB = process.env.ISSUER_PG_DATABASE || 'nasun_dal';
const PG_USER = process.env.ISSUER_PG_USER || 'nasun_issuer';

const fatal = (msg) => { console.error(`[issuer] FATAL: ${msg}`); process.exit(1); };
if (!AUD) fatal('ISSUER_AUDIENCE (or COGNITO_IDENTITY_POOL_ID) is required');
if (!KID) fatal('ISSUER_KID is required (public key id)');
if (!KEY_FILE) fatal('issuer key not provided (need CREDENTIALS_DIRECTORY/issuer-key or ISSUER_KEY_FILE)');

let privateKey;
try { privateKey = await importPKCS8(readFileSync(KEY_FILE, 'utf8'), 'RS256'); }
catch (e) { fatal(`cannot load private key from ${KEY_FILE}: ${e.message}`); }

const fullJwk = await exportJWK(privateKey);
const publicJwk = { kty: fullJwk.kty, n: fullJwk.n, e: fullJwk.e, alg: 'RS256', use: 'sig', kid: KID };
const jwksBody = JSON.stringify({ keys: [publicJwk] });

const mint = (identityId) =>
  new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setIssuer(NASUN_ISS).setAudience(AUD).setSubject(identityId)
    .setIssuedAt().setExpirationTime(TOKEN_TTL)
    .sign(privateKey);

// ---- /mint dependencies (lazy: the JWKS path must serve even if DB/secret are absent) ----------
let mintSecretBuf = null;
function getMintSecret() {
  if (mintSecretBuf) return mintSecretBuf;
  if (!MINT_SECRET_FILE) return null;
  try { mintSecretBuf = Buffer.from(readFileSync(MINT_SECRET_FILE, 'utf8').trim()); return mintSecretBuf; }
  catch { return null; }
}

let sql = null;
function getSql() {
  if (sql) return sql;
  if (!PG_PASSWORD_FILE) return null;
  let password;
  try { password = readFileSync(PG_PASSWORD_FILE, 'utf8').trim(); } catch { return null; }
  sql = postgres({ host: PG_HOST, port: PG_PORT, database: PG_DB, username: PG_USER, password, max: 4 });
  return sql;
}

// Constant-time bearer check against the shared mint secret.
function authorizedMint(req) {
  const secret = getMintSecret();
  if (!secret) return false;
  const header = req.headers['authorization'] || '';
  const presented = header.startsWith('Bearer ') ? Buffer.from(header.slice(7)) : Buffer.alloc(0);
  return presented.length === secret.length && timingSafeEqual(presented, secret);
}

// Resolve the credential to a stable identityId (append-only): existing mapping wins; first-seen
// credential gets a fresh id inserted. Never re-points an existing identifier (issuer role has no UPDATE).
async function resolveIdentityId(db, developerUserIdentifier, provider) {
  const [row] = await db`
    SELECT identity_id FROM issuer.identity_map
    WHERE developer_user_identifier = ${developerUserIdentifier}`;
  if (row?.identity_id) return { identityId: row.identity_id, created: false };

  const identityId = `${NEW_ID_PREFIX}${randomUUID()}`;
  // ON CONFLICT DO NOTHING guards a race between two concurrent first-logins of the same credential;
  // the loser re-reads the winner's row. (DO NOTHING needs only INSERT priv, not UPDATE.)
  await db`
    INSERT INTO issuer.identity_map (developer_user_identifier, identity_id, provider, cred_type, source)
    VALUES (${developerUserIdentifier}, ${identityId}, ${provider || null}, ${provider || null}, 'login')
    ON CONFLICT (developer_user_identifier) DO NOTHING`;
  const [confirmed] = await db`
    SELECT identity_id FROM issuer.identity_map
    WHERE developer_user_identifier = ${developerUserIdentifier}`;
  return { identityId: confirmed.identity_id, created: confirmed.identity_id === identityId };
}

// Hosted salt store for zkLogin (append-only, keyed (provider, sub)). Two modes by body shape:
//   { provider, sub }                                        -> lookup; returns the stored row or { salt: null }
//   { provider, sub, salt, address, email?, name?, picture? } -> create-if-absent; returns the authoritative row
// The salt+address pair is immutable once stored (issuer role has no UPDATE); ON CONFLICT DO NOTHING makes a
// concurrent first-login race converge on a single salt, so the same Google sub always derives the same address.
async function resolveSalt(db, body) {
  const provider = typeof body.provider === 'string' ? body.provider.trim() : '';
  const sub = typeof body.sub === 'string' ? body.sub.trim() : '';
  if (!provider || provider.length > 64 || !sub || sub.length > 256) {
    return { status: 400, body: { error: 'provider and sub required' } };
  }

  const [existing] = await db`
    SELECT salt, address FROM issuer.zklogin_users WHERE provider = ${provider} AND sub = ${sub}`;
  if (existing) return { status: 200, body: { salt: existing.salt, address: existing.address, isNewUser: false } };

  const salt = typeof body.salt === 'string' ? body.salt.trim() : '';
  const address = typeof body.address === 'string' ? body.address.trim() : '';
  if (!salt || !address) return { status: 200, body: { salt: null } }; // lookup-only: not yet created

  const attributes = {};
  for (const k of ['email', 'name', 'picture']) {
    if (typeof body[k] === 'string' && body[k]) attributes[k] = body[k];
  }
  await db`
    INSERT INTO issuer.zklogin_users (provider, sub, address, salt, attributes)
    VALUES (${provider}, ${sub}, ${address}, ${salt}, ${db.json(attributes)})
    ON CONFLICT (provider, sub) DO NOTHING`;
  const [row] = await db`
    SELECT salt, address FROM issuer.zklogin_users WHERE provider = ${provider} AND sub = ${sub}`;
  // isNewUser = our candidate won the insert (vs a concurrent first-login that raced ahead).
  return { status: 200, body: { salt: row.salt, address: row.address, isNewUser: row.salt === salt } };
}

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
  if (req.method === 'GET' && req.url === '/.well-known/jwks.json') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' });
    return res.end(jwksBody);
  }
  if (req.method === 'GET' && req.url === '/health') {
    const dbBacked = !!(getMintSecret() && PG_PASSWORD_FILE);
    return send(res, 200, { status: 'ok', iss: NASUN_ISS, kid: KID, mint: dbBacked, salt: dbBacked });
  }
  if (req.method === 'POST' && req.url === '/mint') {
    if (!authorizedMint(req)) return send(res, 401, { error: 'unauthorized' });
    const db = getSql();
    if (!db) return send(res, 503, { error: 'mint_unavailable' });
    let body;
    try { body = JSON.parse(await readBody(req) || '{}'); }
    catch { return send(res, 400, { error: 'invalid_json' }); }
    const developerUserIdentifier = typeof body.developerUserIdentifier === 'string'
      ? body.developerUserIdentifier.trim() : '';
    const provider = typeof body.provider === 'string' ? body.provider.trim() : null;
    if (!developerUserIdentifier || developerUserIdentifier.length > 256) {
      return send(res, 400, { error: 'developerUserIdentifier required' });
    }
    try {
      const { identityId } = await resolveIdentityId(db, developerUserIdentifier, provider);
      const token = await mint(identityId);
      return send(res, 200, { identityId, token });
    } catch (e) {
      console.error('[issuer] /mint failed:', e instanceof Error ? e.message : e);
      return send(res, 500, { error: 'mint_failed' });
    }
  }
  if (req.method === 'POST' && req.url === '/zklogin/salt') {
    if (!authorizedMint(req)) return send(res, 401, { error: 'unauthorized' });
    const db = getSql();
    if (!db) return send(res, 503, { error: 'salt_unavailable' });
    let body;
    try { body = JSON.parse(await readBody(req) || '{}'); }
    catch { return send(res, 400, { error: 'invalid_json' }); }
    try {
      const { status, body: out } = await resolveSalt(db, body);
      return send(res, status, out);
    } catch (e) {
      console.error('[issuer] /zklogin/salt failed:', e instanceof Error ? e.message : e);
      return send(res, 500, { error: 'salt_failed' });
    }
  }
  send(res, 404, { error: 'not_found' });
});

server.listen(PORT, HOST, async () => {
  console.log(`[issuer] listening http://${HOST}:${PORT} iss=${NASUN_ISS} kid=${KID} aud=${AUD} mint=${!!(getMintSecret() && PG_PASSWORD_FILE)}`);
  try {
    const token = await mint('startup-selfcheck');
    const remoteJWKS = createRemoteJWKSet(new URL(`http://${HOST}:${PORT}/.well-known/jwks.json`));
    const { payload } = await jwtVerify(token, remoteJWKS, { issuer: NASUN_ISS, audience: AUD });
    if (payload.sub !== 'startup-selfcheck') throw new Error('sub mismatch');
    console.log('[issuer] startup JWKS self-verify: OK (live endpoint serves key consistent with signer)');
  } catch (e) {
    console.error(`[issuer] startup JWKS self-verify FAILED: ${e.message}`);
    process.exit(1);
  }
});

const shutdown = () => { if (sql) sql.end({ timeout: 5 }).catch(() => {}); server.close(() => process.exit(0)); };
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, shutdown);
