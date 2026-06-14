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

// --- C4+ incoming-JWT verification (dual-jwks) ----------------------------------------------------
// Shared by additional-wallet / telegram / governance. The Cognito pool id (audience) is NOT a secret
// (it ships in the frontend build), so it arrives via a unit Environment= var, not a credential. The
// nasun issuer JWKS is served on the loopback issuer (:3210) so the nasun branch needs no egress; the
// Cognito branch fetches cognito-identity.amazonaws.com (egress, allowed since C8). See identity-verify.ts.
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
