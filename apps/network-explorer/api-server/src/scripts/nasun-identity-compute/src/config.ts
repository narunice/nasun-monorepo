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
