// Config + secret loading for nasun-identity-compute. Secrets arrive via systemd
// LoadCredentialEncrypted -> $CREDENTIALS_DIRECTORY (tmpfs, host-bound, auto-removed on stop), same as
// issuer/identity. C0/C1 require pg-password + compute-bearer. C3a adds three OPTIONAL secrets; when
// any is absent the C3a login routes stay DISABLED (503) while /health + /count keep working -- so the
// new bundle deploys INERT until the secrets are provisioned (separate go) and the API Gateway repoints.

import { readFileSync } from 'node:fs';

const credDir = process.env.CREDENTIALS_DIRECTORY;

function credPath(name: string, envOverride: string): string | null {
  return process.env[envOverride] || (credDir ? `${credDir}/${name}` : null);
}

function readRequired(name: string, envOverride: string): string {
  const path = credPath(name, envOverride);
  if (!path) {
    console.error(`[compute] FATAL: ${name} not provided (CREDENTIALS_DIRECTORY/${name} or ${envOverride})`);
    process.exit(1);
  }
  try {
    return readFileSync(path, 'utf8').trim();
  } catch (e) {
    console.error(`[compute] FATAL: cannot read ${name}: ${(e as Error).message}`);
    process.exit(1);
  }
}

function readOptional(name: string, envOverride: string): string | null {
  const path = credPath(name, envOverride);
  if (!path) return null;
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return null; // absent -> the dependent C3a routes stay disabled (inert)
  }
}

export const PORT = Number(process.env.COMPUTE_PORT || 3212);
export const HOST = process.env.COMPUTE_BIND || '127.0.0.1';
export const SCHEMA = process.env.COMPUTE_PG_SCHEMA || 'public';

export const PG = {
  host: process.env.COMPUTE_PG_HOST || '127.0.0.1',
  port: Number(process.env.COMPUTE_PG_PORT || 5432),
  database: process.env.COMPUTE_PG_DATABASE || 'nasun_dal',
  username: process.env.COMPUTE_PG_USER || 'nasun_compute_ro',
  password: readRequired('pg-password', 'COMPUTE_PG_PASSWORD_FILE'),
};

// The compute-bearer the API Gateway HTTP_PROXY presents for bearer-gated routes (C3a login routes are
// authenticated by signature+nonce, not this bearer, but it gates any future server-to-server route).
export const COMPUTE_BEARER = Buffer.from(readRequired('compute-bearer', 'COMPUTE_BEARER_FILE'));
if (COMPUTE_BEARER.length < 16) {
  console.error('[compute] FATAL: compute-bearer too short (>=16 bytes required)');
  process.exit(1);
}

// CORS origin allowlist (parity with auth-sui/auth-metamask index getSecurityHeaders). connect-verify
// responses set credentials:true + a single matched origin, NOT ACAO:* (that stays for /count only).
export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://nasun.io')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// --- C3a login dependencies (loopback to the sibling box services; all 127.0.0.1, NO egress) --------
const issuerMintBearer = readOptional('issuer-mint-bearer', 'ISSUER_MINT_BEARER_FILE');
const identityWriteBearer = readOptional('identity-write-bearer', 'IDENTITY_WRITE_BEARER_FILE');
const walletProofSecret = readOptional('wallet-proof-secret', 'WALLET_PROOF_SECRET_FILE');
// C5b telegram-disconnect secondary clear: the leaderboard-v3 internal-route shared token (NOT a signing
// key; the same LEADERBOARD_INTERNAL_TOKEN the get-user-profile lambda already presents to internal/
// sync-profile). Optional -- when absent the secondary leaderboard-badge clear is skipped (best-effort).
const leaderboardInternalToken = readOptional('leaderboard-internal-token', 'LEADERBOARD_INTERNAL_TOKEN_FILE');

export const LOGIN = {
  // Wired iff all three secrets are present. When false, /compute/auth/* return 503 (inert deploy).
  enabled: !!(issuerMintBearer && identityWriteBearer && walletProofSecret),
  issuerMintUrl: process.env.COMPUTE_ISSUER_MINT_URL || 'http://127.0.0.1:3210/mint',
  identityUpsertUrl: process.env.COMPUTE_IDENTITY_UPSERT_URL || 'http://127.0.0.1:3211/profile/upsert',
  issuerMintBearer: issuerMintBearer || '',
  identityWriteBearer: identityWriteBearer || '',
  walletProofSecret: walletProofSecret || '',
  // Per-call budget for the two loopback calls (loopback is ~single-digit ms). Default 2500 matches the
  // proven login-lambda authoritative-write budget (timeoutMs 2500, retries 1 => ~5.4s worst) so the
  // ~mint+upsert+retry total fits the API Gateway HTTP integration timeout. Guard mirrors
  // issuer-client.ts:22-23: fall back on unset / non-finite / non-positive (incl. NEGATIVE) so a bad
  // override never reaches AbortSignal.timeout() (which throws synchronously on negative/NaN).
  loopbackTimeoutMs: (() => {
    const o = Number(process.env.COMPUTE_LOOPBACK_TIMEOUT_MS);
    return Number.isFinite(o) && o > 0 ? o : 2500;
  })(),
};

if (walletProofSecret && walletProofSecret.length < 32) {
  console.error('[compute] FATAL: wallet-proof-secret too short (>=32 chars required)');
  process.exit(1);
}

// --- C8 zklogin-salt dependencies -----------------------------------------------------------------
// C8 (POST /auth/zklogin/salt) needs ONLY the issuer-mint-bearer (to call the box issuer salt store
// over loopback) + outbound Google JWKS egress -- NOT identity-write/wallet-proof. So it gates on
// issuer-mint-bearer alone (present in prod), letting the salt route serve even if the other two C3a
// secrets were absent. Salt PERSISTENCE already lives on the box issuer (zklogin-salt lambda env
// ISSUER_SALT_URL is set in prod); this lift moves only the JWT-verify + jwtToAddress derivation.
// ALLOWED_AUD mirrors the lambda (zklogin-salt index.ts:66): empty in prod => audience check skipped
// (byte-parity; do NOT silently add a check -- that would be a behavior change, see design doc §4).
export const SALT = {
  enabled: !!issuerMintBearer,
  issuerSaltUrl: process.env.COMPUTE_ISSUER_SALT_URL || 'http://127.0.0.1:3210/zklogin/salt',
  issuerMintBearer: issuerMintBearer || '',
  allowedAud: (process.env.ALLOWED_AUD || '').split(',').map((s) => s.trim()).filter(Boolean),
  loopbackTimeoutMs: LOGIN.loopbackTimeoutMs,
  // Dedicated budget for the Google JWKS fetch (the ONLY egress call). The lambda fetched googleapis
  // untimed per-invoke, relying on its own 29s ceiling + per-invocation isolation; on the long-lived box
  // process a wedged TCP connection would otherwise hang a socket, so we cap it. 5s (> the 2.5s loopback
  // budget, an internet round-trip can be slower) stays well inside the API Gateway 29s integration cap.
  // Same guard as loopbackTimeoutMs: fall back on unset/non-finite/non-positive.
  egressTimeoutMs: (() => {
    const o = Number(process.env.COMPUTE_EGRESS_TIMEOUT_MS);
    return Number.isFinite(o) && o > 0 ? o : 5000;
  })(),
};

// --- Google de-Cognito login (P1) ----------------------------------------------------------------
// POST /auth/google/verify replaces the browser-side Cognito federated GetId/GetOpenIdToken for Google
// login. The box verifies the Google OIDC id_token server-side, then mints the SAME identityId via the
// issuer using developerUserIdentifier "google:<sub>" -- the byte-exact key Stage-1 seeded into
// issuer.identity_map (provider accounts.google.com) -- so existing Google users keep their identityId.
// ★ Unlike SALT, the audience check is MANDATORY: a login issues a session JWT, so accepting a Google
// id_token minted for a different client_id would let an attacker replay it to log in as its subject
// (token-audience confusion). clientId is NOT a secret (it ships in the frontend build), so it arrives
// via a unit Environment= var, like VERIFY.audience. Gates on issuer-mint-bearer + clientId (no
// identity-write / wallet-proof needed -- Google login mints no wallet); inert 503 until both present.
export const GOOGLE = {
  enabled: !!(issuerMintBearer && (process.env.COMPUTE_GOOGLE_CLIENT_ID || '')),
  clientId: process.env.COMPUTE_GOOGLE_CLIENT_ID || '',
  egressTimeoutMs: SALT.egressTimeoutMs,
};

// --- C4+ incoming-JWT verification (dual-jwks) ----------------------------------------------------
// Shared by additional-wallet / telegram / governance. The Cognito pool id (audience) is NOT a secret
// (it ships in the frontend build), so it arrives via a unit Environment= var, not a credential. The
// nasun issuer JWKS is served on the loopback issuer (:3210) so verification needs no egress. See
// identity-verify.ts.
export const VERIFY = {
  audience: process.env.COMPUTE_COGNITO_AUDIENCE || '',
  nasunIssuerId: process.env.COMPUTE_NASUN_ISSUER_ID || 'nasun-issuer',
  nasunJwksUrl: process.env.COMPUTE_NASUN_JWKS_URL || 'http://127.0.0.1:3210/.well-known/jwks.json',
  jwksTimeoutMs: (() => {
    const o = Number(process.env.COMPUTE_JWKS_TIMEOUT_MS);
    return Number.isFinite(o) && o > 0 ? o : 5000;
  })(),
};

// --- C4-1 additional-wallet ------------------------------------------------------------------------
// Routes gate on: dual-jwks (VERIFY.audience set) + the identity-service loopback (read by-identity,
// read address-owner, write linked-account-merge) authenticated with the identity-write-bearer the
// box already holds (C3a). identityBaseUrl is the loopback nasun-identity service (:3211). When any of
// these is absent the additional routes stay DISABLED (503) -- inert deploy until wired + repointed.
export const ADDITIONAL = {
  enabled: !!(VERIFY.audience && identityWriteBearer),
  identityBaseUrl: process.env.COMPUTE_IDENTITY_BASE_URL || 'http://127.0.0.1:3211',
  identityWriteBearer: identityWriteBearer || '',
  loopbackTimeoutMs: LOGIN.loopbackTimeoutMs,
};

// --- Genesis Pass register (de-Lambda of genesis-pass/register) ------------------------------------
// GET /genesis-pass/register (own status, compute_ro read) + POST/DELETE (allowlist upsert/withdraw,
// delegated to :3211). Gates on the SAME deps as ADDITIONAL (dual-jwks VERIFY.audience + the identity-write
// bearer for the :3211 loopback) PLUS the explicit COMPUTE_GENESIS_PASS_REGISTER_ENABLED=1 flag, so the
// allowlist write SoT flip (register lambda -> box) is a deliberate cutover step (mirrors ECOSYSTEM/WALLET
// gating). Inert 503 until the flag is set AND the /genesis-pass/register nginx location repoints to the box.
export const GENESIS_PASS_REGISTER = {
  enabled: process.env.COMPUTE_GENESIS_PASS_REGISTER_ENABLED === '1' && !!(VERIFY.audience && identityWriteBearer),
};

// --- Alliance NFT mint (de-Lambda of governance-api alliance-handler) ------------------------------
// GET /governance/alliance/status (JWT; compute_ro read of alliance_mint + the :3211 wallet-list loopback)
// + POST /governance/alliance/mint (JWT; admin-signed on-chain mint via makeSuiClient, PENDING/MINTED state
// over the :3211 /alliance/mint-* loopback). On-chain serialization is an in-proc mutex in this single-
// instance service (the owned AllianceAdmin cap contends across concurrent mints). The admin signing key is
// a systemd-creds secret -- same disable-not-brick policy as the governance keys: a present-but-malformed
// 64-hex cred disables /mint (503) + warns; an absent cred leaves it inert. The v8 chain ids are unit env
// (public). Gated on a dedicated COMPUTE_ALLIANCE_ENABLED=1 flag so the bundle deploys INERT (503) until the
// admin cred is provisioned AND the api.nasun.io /governance/alliance/* location repoints here (mirrors the
// ECOSYSTEM / WALLET / GENESIS_PASS_REGISTER gate rationale).
const allianceAdminKey = readOptional('alliance-admin', 'ALLIANCE_ADMIN_FILE');
const allianceAdminValid = !!allianceAdminKey && /^[0-9a-fA-F]{64}$/.test(allianceAdminKey);
if (allianceAdminKey && !allianceAdminValid) {
  console.error('[compute] alliance mint DISABLED (503): alliance-admin cred is not 64-char hex (32-byte Ed25519)');
}

export const ALLIANCE = {
  // Route mount + GET status: the flag + dual-jwks audience + the :3211 write bearer (status reads
  // alliance_mint via compute_ro but also fetches the wallet list over the :3211 loopback).
  enabled: process.env.COMPUTE_ALLIANCE_ENABLED === '1' && !!(VERIFY.audience && identityWriteBearer),
  // POST mint additionally needs the admin signing key + the three v8 chain ids.
  mintEnabled: process.env.COMPUTE_ALLIANCE_ENABLED === '1'
    && !!(VERIFY.audience && identityWriteBearer && allianceAdminValid
      && process.env.COMPUTE_ALLIANCE_PACKAGE_ID && process.env.COMPUTE_ALLIANCE_REGISTRY_ID && process.env.COMPUTE_ALLIANCE_ADMIN_ID),
  adminPrivateKeyHex: allianceAdminKey || '',
  packageId: process.env.COMPUTE_ALLIANCE_PACKAGE_ID || '',
  registryId: process.env.COMPUTE_ALLIANCE_REGISTRY_ID || '',
  adminId: process.env.COMPUTE_ALLIANCE_ADMIN_ID || '',
};

// --- Twitter (X) OAuth login (de-Lambda of auth-twitter) ------------------------------------------
// GET /auth/twitter/login + POST /auth/twitter/callback lifted off the auth-twitter lambda. The X OAuth2
// client_id is semi-public (it ships in the X authorize URL the browser navigates to) -> unit env; the
// client_secret IS a secret -> systemd-creds (readOptional). The callback mints via the box issuer (it
// reuses the mintIdentity client, which is gated on LOGIN.issuerMintBearer == this module's
// issuerMintBearer) and writes the promoted twitter columns via the box :3211 /profile/twitter-primary
// route (identityWriteBearer) -- the SAME authoritative route the LIVE lambda already hits today
// (IDENTITY_WRITE_FLIP_ROUTES includes /profile/twitter-primary), so the box end-state is identical to the
// lambda path minus the dropped parallel DynamoDB write. Twitter mints NO wallet, so (unlike LOGIN) there
// is no walletProofSecret dep. The onboarding-bonus (x-link) reuses the LINK delegation (explorer-api,
// requireReferralActivated server-side). Gated on a DEDICATED COMPUTE_TWITTER_ENABLED=1 flag so the bundle
// deploys INERT (503) until the api.nasun.io /auth/twitter/ vhost repoints at cutover (mirrors the
// WALLET/PROFILE/LINK gate rationale). egress to api.x.com (allowed since C8).
const twitterClientSecret = readOptional('twitter-client-secret', 'TWITTER_CLIENT_SECRET_FILE');

export const TWITTER = {
  enabled: process.env.COMPUTE_TWITTER_ENABLED === '1'
    && !!(issuerMintBearer && identityWriteBearer && (process.env.COMPUTE_TWITTER_CLIENT_ID || '') && twitterClientSecret),
  clientId: process.env.COMPUTE_TWITTER_CLIENT_ID || '',
  clientSecret: twitterClientSecret || '',
  identityBaseUrl: ADDITIONAL.identityBaseUrl,
  identityWriteBearer: identityWriteBearer || '',
  // Default redirect URI when the request carries no Origin/Referer (parity with the lambda env
  // TWITTER_REDIRECT_URI fallback). The X app whitelists the per-origin <origin>/callback derived below.
  defaultRedirectUri: process.env.COMPUTE_TWITTER_REDIRECT_URI || 'https://nasun.io/callback',
  // OAuth session TTL (parity with the lambda SessionManager ttlMinutes=15).
  sessionTtlSec: 15 * 60,
  loopbackTimeoutMs: ADDITIONAL.loopbackTimeoutMs,
  // X API egress budget (token exchange + users/me). Same posture as SALT.egressTimeoutMs (Google JWKS):
  // the lambda fetched untimed per-invoke, the long-lived box caps a wedged socket. 5s default.
  egressTimeoutMs: SALT.egressTimeoutMs,
};

// --- get-user-profile GET reads (public) ----------------------------------------------------------
// PUBLIC get-user-profile reads (GET /profile?walletAddress= | ?identityId=) lifted off the
// get-user-profile lambda. These are READ-ONLY and PUBLIC (no JWT, parity with the lambda GET), so they
// need ONLY the identity-service loopback bearer to call the box /profile/by-wallet|by-identity routes the
// flipped lambda already serves (readProfileByWallet/readProfileByIdentity reuse ADDITIONAL.identityWrite-
// Bearer/identityBaseUrl). They do NOT require VERIFY.audience (the dual-jwks dep ADDITIONAL gates on),
// since there is no incoming JWT to verify. Enabled iff the identity-write-bearer is present (prod: yes).
export const PROFILE_READ = {
  enabled: !!identityWriteBearer,
};

// --- #2a get-user-profile root POST create (write) ------------------------------------------------
// De-Lambda of the get-user-profile POST create path (a NEW non-social profile). Parity with the lambda
// POST: verifyJwt (dual-jwks, VERIFY.audience) -> identityId == authenticated -> provider/username
// required -> social-provider (google/twitter) block -> create-only (409 if it already exists). The box
// write is the box :3211 /profile/create-mirror loopback (INSERT ... ON CONFLICT DO NOTHING; box-only,
// no DynamoDB) reusing the ADDITIONAL identity-write bearer/baseUrl. avatar POST /upload-avatar-url is
// NOT lifted (it stays on the lambda via the {proxy+} mount; S3 presign moves with S3->R2). Gated on a
// dedicated COMPUTE_PROFILE_WRITE_ENABLED=1 flag so the bundle deploys INERT (503) even though audience +
// the bearer are already live -- the public box-direct POST stays closed until the API Gateway root POST
// is repointed at cutover (mirrors the WALLET COMPUTE_WALLET_ENABLED gate rationale).
export const PROFILE_WRITE = {
  enabled: process.env.COMPUTE_PROFILE_WRITE_ENABLED === '1' && !!(VERIFY.audience && identityWriteBearer),
};

// --- #2b get-user-profile root PATCH update (write) -----------------------------------------------
// De-Lambda of the get-user-profile PATCH path (displayName / linked sui+solana / avatarKey). Parity with
// the lambda PATCH (index.ts:883-1312): verifyJwt -> validate -> displayName rate-limit (atomic 2-step CAS)
// -> avatar ban -> cross-account collision (anti-Sybil, fail-closed) -> box :3211 /profile/attributes-sync
// write (box-only, no DynamoDB). The rate-limit counter (displayNameChangeCount/displayNameChangeWindowStart)
// lives in box user_profiles.attributes; the atomic CAS is a NEW :3211 /profile/display-name-ratelimit route;
// the cross-account uniqueness check is a NEW :3211 GET /profile/linked-address-owner (the existing
// /profile/address-owner targets the signature-verified linked_accounts.<chain>, NOT the paste-based root
// linkedSuiAddress/linkedSolanaAddress). avatar POST /upload-avatar-url + the best-effort S3
// delete-on-replace STAY on the lambda (the box has no S3 egress); only the customAvatarKey attribute is
// ported. Gated on a DEDICATED COMPUTE_PROFILE_PATCH_ENABLED=1 flag (NOT the #2a PROFILE_WRITE flag, which
// is already live) so PATCH deploys INERT (503) until its own cutover repoints the API Gateway root PATCH.
export const PROFILE_PATCH = {
  enabled: process.env.COMPUTE_PROFILE_PATCH_ENABLED === '1' && !!(VERIFY.audience && identityWriteBearer),
  // RATE_LIMIT_MAX/RATE_LIMIT_WINDOW_DAYS byte-parity with the lambda (index.ts:27-30): 15 changes / 30 days.
  rateLimitMax: (() => { const o = parseInt(process.env.RATE_LIMIT_MAX || '15', 10); return Number.isInteger(o) && o > 0 ? o : 15; })(),
  rateLimitWindowMs: (() => { const d = parseInt(process.env.RATE_LIMIT_WINDOW_DAYS || '30', 10); return (Number.isInteger(d) && d > 0 ? d : 30) * 24 * 60 * 60 * 1000; })(),
};

// --- #2c avatar upload (box-direct multipart + re-encode + disk store) ----------------------------
// De-Lambda of the get-user-profile presigned-S3 upload (POST /upload-avatar-url -> S3 PUT). The box has
// no AWS credentials, so the two-step S3 flow is replaced by a single box-direct multipart upload that
// re-encodes the image (sharp) and writes it under COMPUTE_AVATAR_DIR; nginx serves the files back
// statically. The returned key is committed by the existing PROFILE_PATCH { avatarKey } path, so this
// gates on the SAME VERIFY.audience + identity-write dependency as PROFILE_PATCH. Gated on a DEDICATED
// COMPUTE_AVATAR_ENABLED=1 flag so the bundle deploys INERT (503) until the box avatars dir + nginx route
// are provisioned and the API Gateway /upload-avatar-url is retired.
export const AVATAR = {
  enabled: process.env.COMPUTE_AVATAR_ENABLED === '1' && !!(VERIFY.audience && identityWriteBearer),
  dir: process.env.COMPUTE_AVATAR_DIR || '/srv/nasun/avatars',
  // MAX_BYTES byte-parity with the frontend MAX_AVATAR_SIZE_BYTES (2 MB). Re-validated server-side.
  maxBytes: (() => { const n = parseInt(process.env.COMPUTE_AVATAR_MAX_BYTES || '', 10); return Number.isInteger(n) && n > 0 ? n : 2 * 1024 * 1024; })(),
  // Output square edge (cover-fit). 512 is ample for an avatar and bounds re-encode cost + disk.
  dim: (() => { const n = parseInt(process.env.COMPUTE_AVATAR_DIM || '', 10); return Number.isInteger(n) && n > 0 ? n : 512; })(),
};

// --- #3a deactivate-user-account (write) ----------------------------------------------------------
// De-Lambda of nasun-common-deactivate-user-account (DELETE). Parity with the lambda (index.ts): NO
// incoming JWT (API GW authorizationType NONE) -- ownership is the query identityId (Cognito regex) +
// provider (Google|Twitter|MetaMask) matched against the stored profile, EXACTLY as the lambda's DDB
// ConditionExpression. The handler reproduces the 404/200/403/202 decision via a loopback READ (:3211
// /profile/by-identity) then, on a real deactivation, a loopback WRITE (:3211 /profile/status; box-only PG,
// NO DynamoDB -- the (B) divergence, covered by the reconcile deactivate field/extra exclusions). NO
// VERIFY.audience dep (there is no JWT to verify); the box loopback reuses ADDITIONAL.identityWriteBearer/
// identityBaseUrl (present in prod). Gated on a DEDICATED COMPUTE_DEACTIVATE_ENABLED=1 flag so the bundle
// deploys INERT (503) even though the identity-write bearer is already live -- the public box-direct DELETE
// stays CLOSED until the API Gateway root DELETE is repointed at cutover (mirrors the WALLET/PROFILE_PATCH
// gate rationale).
export const DEACTIVATE = {
  enabled: process.env.COMPUTE_DEACTIVATE_ENABLED === '1' && !!identityWriteBearer,
  // 7-day deletion grace (epoch SECONDS), byte-parity with the lambda (index.ts: now + 7*24*60*60).
  graceSec: 7 * 24 * 60 * 60,
};

// --- #3b link-account (write) ---------------------------------------------------------------------
// De-Lambda of nasun-common-link-account (link/unlink/admin-link; register-evm stays 410). Parity with the
// lambda (link-account/index.ts): verifyJwt (dual-jwks, VERIFY.audience) -> ownership (link/unlink require
// primaryIdentityId === authenticated; admin-link bypasses but requires the caller's box profile
// role==='ADMIN') -> box reads (by-identity primary/secondary/oldPrimary, by-twitter-id for the anti-Sybil
// twitter-uniqueness gate) -> box writes (link-sync multi-row UPSERT + attributes-sync for the non-promoted
// long-tail keys + linked-account-merge), all box-only PG, NO DynamoDB (the (B) divergence, covered by the
// reconcile RECON_LINK_CUTOVER_EPOCH field exclusion). The box is ALREADY authoritative for all of these
// today (IDENTITY_WRITE_FLIP_ROUTES has link-sync/attributes-sync/linked-account-merge), so the box
// end-state is identical to the lambda path; the de-Lambda only drops the parallel DynamoDB write half and
// moves the HTTP termination box-local.
//
// Two DDB-coupled side-effects are intentionally DROPPED (design SSOT D2/D4, both verified safe):
//   - xHistory (DDB-only audit list): NO consumer reads it (grep-verified) + already skipped for box-only
//     primaries today. Not mirrored to box from link-account.
//   - MetaMask manual-dedup + Genesis-Pass allowlist cleanup: the dedup only fires on
//     linkedAccounts.metamask.manualEntry===true rows, and the ONLY path that set that flag (register-evm
//     manual entry) is permanently 410-disabled -- no new manualEntry=true rows can be created, so the
//     by-metamask-address scan is provably empty and the cleanup is a dead no-op. The box has no genesis
//     allowlist data anyway.
//
// Onboarding-bonus (x-link / google-link) is DELEGATED to explorer-api (design SSOT D1=A): the grant is
// referral-ACTIVATED-gated, and that gate reads the nasun-referrals DynamoDB table which the box cannot
// access. The box posts to explorer-api /onboarding-bonus with requireReferralActivated=true; explorer-api
// (node-3, which has DDB) does the referral read server-side, then PG-dedupes. Best-effort + never blocks
// the link (parity with the lambda's grantIfReferralActivated().catch(non-fatal)). Skipped (no-op) when the
// URL or api-key is absent (inert until wired). Egress to explorer.nasun.io (allowed since C8).
//
// Gated on a DEDICATED COMPUTE_LINK_ENABLED=1 flag so the bundle deploys INERT (503) even though audience +
// the identity-write bearer are already live -- the public box-direct /compute/link* WRITE endpoints stay
// CLOSED until the API Gateway repoint at cutover (mirrors the WALLET/PROFILE_PATCH/DEACTIVATE gate rationale).
const onboardingBonusApiKey = readOptional('onboarding-bonus-api-key', 'ONBOARDING_BONUS_API_KEY_FILE');

export const LINK = {
  enabled: process.env.COMPUTE_LINK_ENABLED === '1' && !!(VERIFY.audience && identityWriteBearer),
  identityBaseUrl: ADDITIONAL.identityBaseUrl,
  identityWriteBearer: identityWriteBearer || '',
  loopbackTimeoutMs: ADDITIONAL.loopbackTimeoutMs,
  // Onboarding-bonus delegation (D1=A). Full URL of the explorer-api endpoint (e.g.
  // https://explorer.nasun.io/api/v1/points/onboarding-bonus); a public domain, NOT a secret -> unit env.
  onboardingBonusUrl: process.env.COMPUTE_ONBOARDING_BONUS_URL || '',
  onboardingBonusApiKey: onboardingBonusApiKey || '',
  onboardingTimeoutMs: (() => {
    const o = Number(process.env.COMPUTE_ONBOARDING_TIMEOUT_MS);
    return Number.isFinite(o) && o > 0 ? o : 3000;
  })(),
};

// --- C3b wallet register/remove/list (crown-jewel ownership writes + list read) -------------------
// De-Lambda of the wallet-api lambda's multi-wallet routes: POST /register, POST /remove, GET /list.
// register does dual-jwks verify (VERIFY.audience) + the wallet-proof HMAC (walletProofSecret, the SAME
// nasun-wallet-proof-prod secret the wallet lambda + C3a login already use) + a loopback to the box
// identity service :3211 /wallet/register; remove/list skip the proof (the lambda does too) and loopback
// to :3211 /wallet/{remove,list}. Those :3211 routes are the SAME authoritative routes the FLIPPED wallet
// lambda already writes/reads today (IDENTITY_WRITE_FLIP_ROUTES has /wallet/register,/wallet/remove and
// IDENTITY_READ_MODE=flip serves /wallet/list), so the box already holds the complete mirror. Box is SoT:
// box-only PG write, NO DynamoDB (the (B) divergence, covered by the reconcile post-cutover wallet
// exclusion). Reuses the C4-1 identity-write-bearer/baseUrl.
//
// ★ Crown-jewel cutover gate: unlike additional/telegram (gated on secrets alone, all of which are
// already present in prod), wallet gates ADDITIONALLY on the explicit COMPUTE_WALLET_ENABLED=1 flag so the
// bundle deploys INERT (503) even though audience + both secrets are live. This keeps the publicly
// reachable box-direct /compute/wallet/* WRITE endpoints CLOSED until the cutover gate flips the flag
// (separate go), so the E2E parity test is provably the FIRST caller of the live box write path -- no
// pre-cutover box-only writes can sneak in ahead of verification.
const explorerInvalidateToken = readOptional('explorer-api-invalidate-token', 'EXPLORER_API_INVALIDATE_TOKEN_FILE');

export const WALLET = {
  enabled: process.env.COMPUTE_WALLET_ENABLED === '1'
    && !!(VERIFY.audience && identityWriteBearer && walletProofSecret),
  identityBaseUrl: ADDITIONAL.identityBaseUrl,
  identityWriteBearer: identityWriteBearer || '',
  loopbackTimeoutMs: ADDITIONAL.loopbackTimeoutMs,
  // walletProof freshness window -- byte-parity with the lambda verifyWalletProof PROOF_MAX_AGE_MS (5 min).
  proofMaxAgeMs: 5 * 60 * 1000,
  // Best-effort points-scanner cache invalidation (parity with the lambda notifyWalletRegistered): POST
  // {identityId, walletAddress} to <base>/api/v1/internal/wallet-registered with X-Internal-Auth. OPTIONAL
  // -- skipped when the base URL or token is absent (the scanner's 10-min TTL fallback catches up, exactly
  // as the lambda documented). egress to explorer.nasun.io (allowed since C8). NEVER blocks/fails register.
  walletRegisteredBaseUrl: process.env.COMPUTE_WALLET_REGISTERED_BASE_URL || '',
  walletRegisteredToken: explorerInvalidateToken || '',
  webhookTimeoutMs: (() => {
    const o = Number(process.env.COMPUTE_WALLET_WEBHOOK_TIMEOUT_MS);
    return Number.isFinite(o) && o > 0 ? o : 3000;
  })(),
};

// --- C5b telegram-disconnect (write) --------------------------------------------------------------
// The route does dual-jwks verify + the AUTHORITATIVE box PG clear via the identity loopback
// /telegram/disconnect (the SAME endpoint the disconnect-telegram lambda already hits when flipped;
// idempotent UPDATE, so retry-safe), reusing the ADDITIONAL bearer/baseUrl. It then does a BEST-EFFORT
// secondary clear of the leaderboard-v3 Accounts/SeasonAccounts telegram badge via the leaderboard
// internal route over HTTPS (X-Internal-Auth = leaderboard-internal-token). The secondary clear is
// OPTIONAL and never blocks the authoritative box clear: when leaderboardClearUrl or the token is absent
// it is skipped (the badge lags -- the same failure mode as a transient leaderboard error, and the
// lambda already wrapped it in try/catch as "secondary, optional"). Route gates on ADDITIONAL.enabled
// (same dual-jwks + identity-write-bearer deps as the box clear).
export const TELEGRAM = {
  enabled: ADDITIONAL.enabled,
  identityBaseUrl: ADDITIONAL.identityBaseUrl,
  identityWriteBearer: ADDITIONAL.identityWriteBearer,
  loopbackTimeoutMs: ADDITIONAL.loopbackTimeoutMs,
  // Secondary leaderboard clear (best-effort). leaderboardClearUrl is the leaderboard-v3 API GW route
  // (egress, allowed since C8); the token authenticates it. Both must be present or the clear is skipped.
  leaderboardClearUrl: process.env.COMPUTE_LEADERBOARD_CLEAR_TELEGRAM_URL || '',
  leaderboardInternalToken: leaderboardInternalToken || '',
  leaderboardTimeoutMs: (() => {
    const o = Number(process.env.COMPUTE_LEADERBOARD_TIMEOUT_MS);
    return Number.isFinite(o) && o > 0 ? o : 3000;
  })(),
};

// --- C5c telegram-verify (write) ------------------------------------------------------------------
// The route does dual-jwks verify + Telegram Login Widget HMAC verify (telegram-bot-token secret) +
// getChatMember channel-membership (egress, allowed since C8) + the AUTHORITATIVE box PG set via the
// identity loopback /telegram/verify (the SAME atomic set+auto-transfer write the flipped verify-telegram
// lambda already does; box clears any prior owner of the telegram id + sets the new owner in ONE tx) + a
// BEST-EFFORT consolidated residual call to the leaderboard-v3 internal/telegram-verified lambda (badge
// SET for the new owner + auto-transfer CLEAR of the prior owner's badge + onboarding bonus -- all the
// DynamoDB-side secondary work the box cannot do). Box is SoT: the box sets box PG only and does NOT
// write DynamoDB UserProfiles (the (B) divergence, covered by the reconcile set-direction exclusion).
// Gated on enabled = ADDITIONAL.enabled (dual-jwks + identity-write-bearer) AND the bot-token secret AND
// the channel username. When the bot-token is absent the route stays DISABLED (503) -- inert deploy until
// the secret is provisioned (separate go) and the API Gateway repoints.
const telegramBotToken = readOptional('telegram-bot-token', 'TELEGRAM_BOT_TOKEN_FILE');

export const TELEGRAM_VERIFY = {
  enabled: !!(ADDITIONAL.enabled && telegramBotToken && (process.env.COMPUTE_TELEGRAM_CHANNEL_USERNAME || '')),
  botToken: telegramBotToken || '',
  // The channel to check membership against (parity with verify-telegram TELEGRAM_CHANNEL_USERNAME,
  // e.g. 'nasun_official'). Non-secret (ships in the bot config) -> a unit Environment var.
  channelUsername: process.env.COMPUTE_TELEGRAM_CHANNEL_USERNAME || '',
  identityBaseUrl: ADDITIONAL.identityBaseUrl,
  identityWriteBearer: ADDITIONAL.identityWriteBearer,
  loopbackTimeoutMs: ADDITIONAL.loopbackTimeoutMs,
  // auth_date freshness window: 24h + 300s grace (parity with verify-telegram isAuthDateValid).
  authMaxAgeSec: 24 * 60 * 60 + 300,
  // getChatMember egress budget (the ONLY external call on this route). The lambda fetched it untimed
  // per-invoke; on the long-lived box a wedged socket must be capped. 5s (parity with SALT.egressTimeoutMs)
  // stays inside the API Gateway 29s integration cap. Same guard: fall back on unset/non-finite/non-positive.
  telegramApiTimeoutMs: (() => {
    const o = Number(process.env.COMPUTE_TELEGRAM_API_TIMEOUT_MS);
    return Number.isFinite(o) && o > 0 ? o : 5000;
  })(),
  // Consolidated best-effort residual lambda (leaderboard badge set/clear + onboarding bonus). Reuses the
  // SAME leaderboard-internal-token the C5b clear presents. Both URL + token must be present or skipped.
  verifiedResidualUrl: process.env.COMPUTE_TELEGRAM_VERIFIED_URL || '',
  leaderboardInternalToken: leaderboardInternalToken || '',
  residualTimeoutMs: (() => {
    const o = Number(process.env.COMPUTE_TELEGRAM_RESIDUAL_TIMEOUT_MS);
    return Number.isFinite(o) && o > 0 ? o : 4000;
  })(),
};

// --- C6a governance /sponsor (Sui sponsor tx signing) ---------------------------------------------
// Box port of the nasun-common-governance-api POST /sponsor route (Sui sponsored Poll-vote tx). Gates on
// the sponsor signing key ALONE: when absent the /governance/sponsor route stays DISABLED (503) -- inert
// deploy until the secret is provisioned + the API Gateway repoints. The on-chain package/registry IDs are
// PUBLIC chain data (not secrets) -> unit Environment vars; the sponsor key is a signing secret -> a
// systemd-creds credential. Sui RPC is egress (allowed since C8/C5c); a per-call timeout caps a wedged
// socket on the long-lived box (the lambda relied on its 60s ceiling + per-invoke isolation instead).
const governanceSponsorKey = readOptional('governance-sponsor', 'GOVERNANCE_SPONSOR_FILE');

// Validate the sponsor key format up front. A present-but-malformed key DISABLES the route (503) + warns,
// rather than process.exit -- a non-hex/wrong-length governance cred must NOT brick the whole multi-route
// compute service (login/salt/additional/telegram). 32-byte Ed25519 secret = exactly 64 hex chars
// (Ed25519Keypair.fromSecretKey requires 32 bytes; a wrong length would otherwise throw only at the first
// /sponsor call -> 500). Provision the .cred from the EXACT hex in Secrets Manager nasun/governance/sponsor
// (the privateKey field) -- do NOT re-encode (a 64-byte/128-hex or bech32 form throws at fromSecretKey).
const governanceSponsorValid = !!governanceSponsorKey && /^[0-9a-fA-F]{64}$/.test(governanceSponsorKey);
if (governanceSponsorKey && !governanceSponsorValid) {
  console.error('[compute] governance sponsor DISABLED (503): governance-sponsor cred is not 64-char hex (32-byte Ed25519)');
}

// C6b certificate Oracle Ed25519 signing key (Secrets Manager nasun/governance/oracle). Same disable-not-
// brick policy as the sponsor key: a present-but-malformed cred disables /certificate (503) + warns; an
// absent cred leaves it inert. 32-byte Ed25519 secret = 64 hex chars. /voting-power + /config do NOT need
// this key (only /certificate signs). Provision the .cred from the EXACT hex in nasun/governance/oracle.
const governanceOracleKey = readOptional('governance-oracle', 'GOVERNANCE_ORACLE_FILE');
const governanceOracleValid = !!governanceOracleKey && /^[0-9a-fA-F]{64}$/.test(governanceOracleKey);
if (governanceOracleKey && !governanceOracleValid) {
  console.error('[compute] governance certificate DISABLED (503): governance-oracle cred is not 64-char hex (32-byte Ed25519)');
}

// C6b rank-residual + identity-loopback wiring for /voting-power + /certificate. The leaderboard rank is
// DynamoDB-resident, so the box fetches it from a thin residual lambda over HTTPS (X-Internal-Auth =
// leaderboard-internal-token, the SAME cred the C5 telegram residuals use). Voting identity + the
// governance_votes dup-vote guard run over the :3211 identity loopback (reusing the C4-1 identity-write-
// bearer/baseUrl). votingPowerEnabled needs identity loopback + rank residual; certEnabled also needs the
// oracle key. /config is always served (static, no deps).
const governanceRankUrl = process.env.COMPUTE_GOVERNANCE_RANK_URL || '';
const governanceVotingDepsReady = !!(ADDITIONAL.enabled && governanceRankUrl && leaderboardInternalToken);

export const GOVERNANCE = {
  // /governance/sponsor is wired iff the sponsor key is present AND well-formed. Else the route returns 503.
  sponsorEnabled: governanceSponsorValid,
  sponsorPrivateKeyHex: governanceSponsorKey || '',
  suiRpcUrl: process.env.COMPUTE_SUI_RPC_URL || 'https://rpc.devnet.nasun.io',
  // Whitelist target prefix for validateTxKind (parity index.ts GOVERNANCE_PACKAGE_ID). When empty the
  // whitelist degrades CLOSED (canonicalized package ids never equal `::voting_power::...`) -> every
  // sponsor request 400s; so the unit MUST set COMPUTE_GOVERNANCE_PACKAGE_ID for the route to function.
  packageId: process.env.COMPUTE_GOVERNANCE_PACKAGE_ID || '',
  // ProposalTypeRegistry shared object; getProposalType looks the proposal up here (Poll vs Governance).
  proposalTypeRegistryId: process.env.COMPUTE_PROPOSAL_TYPE_REGISTRY_ID || '',
  // Per-call Sui RPC egress budget. Default 6s keeps the serial worst case (getProposalType 2 + getCoins 1
  // + tx.build >=1 ~= 4 calls) inside the API Gateway 29s HTTP-integration cap. Same guard as the other
  // timeouts: fall back on unset/non-finite/non-positive (incl. NEGATIVE, which AbortSignal.timeout rejects).
  rpcTimeoutMs: (() => {
    const o = Number(process.env.COMPUTE_GOVERNANCE_RPC_TIMEOUT_MS);
    return Number.isFinite(o) && o > 0 ? o : 6000;
  })(),

  // --- C6b /config + /voting-power + /certificate ---
  votingPowerEnabled: governanceVotingDepsReady,
  certEnabled: !!(governanceOracleValid && governanceVotingDepsReady),
  oraclePrivateKeyHex: governanceOracleKey || '',
  // MUST match the Move contract's DOMAIN_SEPARATOR byte-for-byte (cert signature domain).
  domainSeparator: process.env.COMPUTE_GOVERNANCE_DOMAIN_SEPARATOR || 'NASUN_GOVERNANCE_DEVNET_V1',
  // Certificate TTL: devnet 15min, mainnet 30min (parity index.ts calculateCertificateTTL with no
  // proposalExpiration arg). NETWORK unset on the live lambda -> devnet -> 15min.
  certTtlMs: (process.env.COMPUTE_GOVERNANCE_NETWORK === 'mainnet' ? 30 : 15) * 60 * 1000,
  // VoteProofNFT struct package ids for checkOnChainVoteExists (parity GOVERNANCE_ORIGINAL_PACKAGE_ID /
  // GOVERNANCE_MULTI_CHOICE_PACKAGE_ID). Default to packageId (parity index.ts:106-107 fallback).
  originalPackageId: process.env.COMPUTE_GOVERNANCE_ORIGINAL_PACKAGE_ID || process.env.COMPUTE_GOVERNANCE_PACKAGE_ID || '',
  multiChoicePackageId: process.env.COMPUTE_GOVERNANCE_MULTI_CHOICE_PACKAGE_ID || process.env.COMPUTE_GOVERNANCE_PACKAGE_ID || '',
  // Residual rank lambda (HTTPS) + the internal token + identity loopback (reused from C4-1/C5).
  rankResidualUrl: governanceRankUrl,
  leaderboardInternalToken: leaderboardInternalToken || '',
  identityBaseUrl: ADDITIONAL.identityBaseUrl,
  identityWriteBearer: ADDITIONAL.identityWriteBearer,
  loopbackTimeoutMs: ADDITIONAL.loopbackTimeoutMs,
  rankResidualTimeoutMs: (() => {
    const o = Number(process.env.COMPUTE_GOVERNANCE_RANK_TIMEOUT_MS);
    return Number.isFinite(o) && o > 0 ? o : 4000;
  })(),
};

// --- Ship1 ecosystem NFT-activation + genesis-pass/check (de-Lambda of ecosystem-api + genesis-pass/check) ---
// The authed routes (status/activate/deactivate) gate on dual-jwks (VERIFY.audience) + the identity-write-
// bearer (activate/deactivate writes delegate to :3211) + a DEDICATED COMPUTE_ECOSYSTEM_ENABLED=1 flag so the
// bundle deploys INERT (503) until the api.nasun.io /ecosystem/ location is repointed at cutover (mirrors the
// WALLET/PROFILE_PATCH gate rationale). genesis-pass/check is PUBLIC (no JWT) + pure compute_ro 3-hop read; it
// gates on the same flag alone (no write, no audience). ALCHEMY_API_KEY is the on-demand activate egress key --
// NOT a secret (it ships in the frontend bundle, frontend/.env.production:84), so it arrives via a unit
// Environment var, not a credential; the real abuse control is the nginx rate-limit + (recommended) a dedicated
// box key with an Alchemy spend cap (plan §5). When the key is absent the on-demand fallback throws -> activate
// 503 SNAPSHOT_UNAVAILABLE (lambda parity). GP contract + stage are public chain data -> env. The anti-Sybil
// social gate on activate genesis-pass is a DELIBERATE Ship-1 delta (the lambda lacked it; plan §2 Ship1-d).
export const ECOSYSTEM = {
  enabled: process.env.COMPUTE_ECOSYSTEM_ENABLED === '1' && !!(VERIFY.audience && identityWriteBearer),
  // genesis-pass/check: public read, no JWT/write -> flag only.
  checkEnabled: process.env.COMPUTE_ECOSYSTEM_ENABLED === '1',
  identityBaseUrl: ADDITIONAL.identityBaseUrl,
  identityWriteBearer: identityWriteBearer || '',
  loopbackTimeoutMs: ADDITIONAL.loopbackTimeoutMs,
  // GP contract (public chain data). Lower-cased here. Default = the prod GP contract (nft_collections row).
  genesisPassContract: (process.env.COMPUTE_GENESIS_PASS_CONTRACT || '0x561D4A687e9D13925AD7BEf0209c9eCaEC9858E1').toLowerCase(),
  // Current mint stage (SSM /nasun/genesis-pass/current-stage in the lambda; static "0" PAUSED post-mint).
  gpStage: (() => { const n = parseInt(process.env.COMPUTE_GP_STAGE || '0', 10); return Number.isInteger(n) ? n : 0; })(),
  // Alchemy on-demand egress (activate fallback). Key is PUBLIC (frontend-shipped); abuse-bounded by rate-limit.
  alchemyApiKey: process.env.COMPUTE_ALCHEMY_API_KEY || '',
  alchemyRpcBaseUrl: process.env.COMPUTE_ALCHEMY_RPC_BASE_URL || 'https://eth-mainnet.g.alchemy.com/v2',
  alchemyNftBaseUrl: process.env.COMPUTE_ALCHEMY_NFT_BASE_URL || 'https://eth-mainnet.g.alchemy.com/nft/v3',
  // eth_call balanceOf budget (lambda eth-rpc TIMEOUT_MS 8s).
  alchemyTimeoutMs: 8000,
  // getOwnersForContract paginated fetch budget (lambda HOLDER_CACHE_FETCH_TIMEOUT_MS 30s).
  holderFetchTimeoutMs: 30000,
  // In-memory holder-set cache freshness (lambda HOLDER_CACHE_FRESHNESS_MS 1h). The long-lived box process
  // replaces the lambda's DDB ETH#HOLDERS cache with a module-level Map -- identical holder-set output.
  holderCacheFreshnessMs: 60 * 60 * 1000,
  // On-demand ETH#LATEST per-wallet freshness window (lambda ON_DEMAND_FRESHNESS_MS 10m).
  onDemandFreshnessMs: 10 * 60 * 1000,
};

// --- Ship2 eth-ownership weekly job (collector + verifier oneshot) ---------------------------------
// De-Lambda of nft-snapshot eth-collector-v2 + ownership-verifier, run by a systemd timer (NOT this long-
// lived server process -- eth-ownership-job.ts is a separate oneshot entry). Gated on a DEDICATED
// COMPUTE_ETH_OWNERSHIP_ENABLED=1 flag so even an accidentally-enabled timer stays INERT (the job logs +
// exits 0) until cutover go. The job ALSO needs the identity-write bearer (nft_ownership upsert/cleanup +
// ecosystem deactivate delegate to :3211) AND the Alchemy key (holder fetch); the --dry-run mode IGNORES the
// flag (read-only, no writes). cadence/enable is decided after the Ship-1 soak (plan §2, default weekly).
export const ETH_OWNERSHIP = {
  enabled: process.env.COMPUTE_ETH_OWNERSHIP_ENABLED === '1' && !!(identityWriteBearer && ECOSYSTEM.alchemyApiKey),
};

// --- AdminStack admin UI (de-Lambda of admin-api export-whitelist + nft-collections) --------------
// Box port of the AdminStack admin-api (doetwxms5a) AdminExportFunction + NftCollectionsFunction. The
// admin-authed routes (export/{genesis,genesis-pass,battalion,stats}, users[/{id}], devnet-metrics, the
// hidden-proposals/nft-collections WRITES) gate on the box ADMIN-role read (compute_ro user_profiles
// attributes->>'role'='ADMIN'). authenticateAdmin verifies the incoming JWT via dual-jwks
// (verifyJwtIdentity -> VERIFY.audience + the issuer JWKS) BEFORE the role read, so enabled MUST include
// VERIFY.audience (parity with the ECOSYSTEM.enabled gate): without it EVERY admin call fails JWT verify
// -> an undiagnosable 401. enabled also needs the identity-write-bearer (the writes delegate to :3211).
// The two PUBLIC reads (GET /hidden-proposals, GET /nft-collections without ?admin) need no auth. A
// DEDICATED COMPUTE_ADMIN_ENABLED=1 flag deploys the bundle INERT (503 on every /admin/* route) until the
// api.nasun.io /admin/ location is repointed off doetwxms5a at cutover (mirrors the WALLET/PROFILE_PATCH/
// ECOSYSTEM gate rationale).
//
// devnet-metrics is NOT mirrored: the admin GET /devnet-metrics timeseries is served by ONE call to the box
// explorer-api /stats/daily-metrics-range route (which reads nasun_points.activity_points -- a DIFFERENT DB
// the compute_ro pool cannot reach, so it is fetched over HTTPS, not run on the local pool). Gated on the
// explorer daily-metrics base URL being set (else /devnet-metrics 503s while the rest of admin works).
export const ADMIN = {
  enabled: process.env.COMPUTE_ADMIN_ENABLED === '1' && !!(VERIFY.audience && identityWriteBearer),
  identityBaseUrl: ADDITIONAL.identityBaseUrl,
  identityWriteBearer: identityWriteBearer || '',
  loopbackTimeoutMs: ADDITIONAL.loopbackTimeoutMs,
  // explorer-api /stats base (e.g. https://explorer.nasun.io/api/v1/stats). A public domain, NOT a secret
  // -> unit env. devnet-metrics calls {base}/daily-metrics-range (egress to explorer.nasun.io, allowed since
  // C8). When absent the /devnet-metrics route 503s (the rest of admin is unaffected).
  dailyMetricsBaseUrl: process.env.COMPUTE_ADMIN_DAILY_METRICS_URL || '',
  // Timeout for the single daily-metrics-range fetch (one PG range scan upstream). Default 15s -- well
  // inside the nginx/API-Gateway response ceiling. Falls back on unset/non-finite/non-positive.
  dailyMetricsTimeoutMs: (() => {
    const o = Number(process.env.COMPUTE_ADMIN_DAILY_METRICS_TIMEOUT_MS);
    return Number.isFinite(o) && o > 0 ? o : 15000;
  })(),
  // devnet-metrics range: number of trailing days to fetch (the lambda Scanned the full METRICS# table; the
  // box bounds it to a sane window). The explorer-api /daily-metrics-range endpoint REJECTS a span over 400
  // days with a 400, which the client maps to an empty series -- so this is CLAMPED to <=366 to keep it
  // strictly inside that server cap (a fat-fingered COMPUTE_ADMIN_DEVNET_METRICS_DAYS=500 would otherwise
  // silently blank the chart). Default 90.
  dailyMetricsRangeDays: (() => {
    const n = parseInt(process.env.COMPUTE_ADMIN_DEVNET_METRICS_DAYS || '90', 10);
    const v = Number.isInteger(n) && n > 0 ? n : 90;
    return Math.min(v, 366);
  })(),
};

// Observability: a PARTIAL config (some C3a secrets present, others absent/empty) leaves login disabled
// (503) with no signal -- name the missing ones so a fat-fingered/empty cred at cutover is debuggable
// rather than a silent inert service. Fail-safe is preserved (still 503, never wrong behavior).
if (!LOGIN.enabled) {
  const present = [
    ['issuer-mint-bearer', issuerMintBearer],
    ['identity-write-bearer', identityWriteBearer],
    ['wallet-proof-secret', walletProofSecret],
  ].filter(([, v]) => v);
  if (present.length > 0) {
    const missing = ['issuer-mint-bearer', 'identity-write-bearer', 'wallet-proof-secret']
      .filter((n) => !present.some(([p]) => p === n));
    console.warn(`[compute] login DISABLED (503): partial C3a config -- missing/empty cred(s): ${missing.join(', ')}`);
  }
}

// Same observability for admin: COMPUTE_ADMIN_ENABLED=1 set but a dependency absent leaves every /admin/*
// route 503 with no signal. Name the missing dep so a cutover misconfig is debuggable (still fail-safe 503).
if (process.env.COMPUTE_ADMIN_ENABLED === '1' && !ADMIN.enabled) {
  const missing = [
    ['COMPUTE_COGNITO_AUDIENCE (VERIFY.audience)', VERIFY.audience],
    ['identity-write-bearer', identityWriteBearer],
  ].filter(([, v]) => !v).map(([n]) => n);
  console.warn(`[compute] admin DISABLED (503): COMPUTE_ADMIN_ENABLED=1 but missing: ${missing.join(', ')}`);
}
