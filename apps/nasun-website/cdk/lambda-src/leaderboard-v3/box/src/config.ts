// Config + secret loading for nasun-leaderboard -- box-co-located de-Lambda compute service for the
// community Leaderboard V3 (season social-post ranking). AWS-exit Stage 4 (leaderboard de-Lambda slice).
//
// Mirrors the nasun-identity-compute secret contract: the PG password arrives via systemd
// LoadCredentialEncrypted -> $CREDENTIALS_DIRECTORY (tmpfs, host-bound), NOT a plaintext env var. The
// read service uses the read-only `nasun_compute_ro` role (SELECT on lb_* granted at Phase 1), so it can
// never mutate the frozen mirror. Admin/write secrets are NOT loaded here -- the read slice is pure-read;
// the write/admin handlers add their own gated creds in a later slice.

import { readFileSync } from 'node:fs';

const credDir = process.env.CREDENTIALS_DIRECTORY;

function credPath(name: string, envOverride: string): string | null {
  return process.env[envOverride] || (credDir ? `${credDir}/${name}` : null);
}

function readRequired(name: string, envOverride: string): string {
  const path = credPath(name, envOverride);
  if (!path) {
    console.error(`[leaderboard] FATAL: ${name} not provided (CREDENTIALS_DIRECTORY/${name} or ${envOverride})`);
    process.exit(1);
  }
  try {
    return readFileSync(path, 'utf8').trim();
  } catch (e) {
    console.error(`[leaderboard] FATAL: cannot read ${name}: ${(e as Error).message}`);
    process.exit(1);
  }
}

function readOptional(name: string, envOverride: string): string | undefined {
  const path = credPath(name, envOverride);
  if (!path) return undefined;
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return undefined;
  }
}

// :3210 issuer, :3211 identity, :3212 identity-compute are taken; leaderboard takes :3213.
export const PORT = Number(process.env.LEADERBOARD_PORT || 3213);
export const HOST = process.env.LEADERBOARD_BIND || '127.0.0.1';

const pgHost = process.env.LEADERBOARD_PG_HOST || '127.0.0.1';
// Unix-socket host (e.g. /var/run/postgresql) => peer auth, password optional. This lets the validation
// CLI run as `sudo -u postgres node snapshot.mjs` without a cred (harness pattern). TCP host (the systemd
// read service) requires the password (fail-fast at startup if the cred is missing).
const pgIsUnixSocket = pgHost.startsWith('/');

export const PG = {
  host: pgHost,
  port: Number(process.env.LEADERBOARD_PG_PORT || 5432),
  database: process.env.LEADERBOARD_PG_DATABASE || 'nasun_dal',
  username: process.env.LEADERBOARD_PG_USER || 'nasun_compute_ro',
  password: pgIsUnixSocket
    ? readOptional('pg-password', 'LEADERBOARD_PG_PASSWORD_FILE')
    : readRequired('pg-password', 'LEADERBOARD_PG_PASSWORD_FILE'),
};

// Writer credential for the snapshot cron (INSERT lb_snapshots + UPDATE lb_seasons). Separate from the
// read role: present ONLY when the cron is provisioned at cutover (LEADERBOARD_WRITE_PG_USER + a cred file).
// Returns null when absent -- the read service + dry-run/reproduce validation never need it.
export function writeCred(): { user: string; password: string } | null {
  const user = process.env.LEADERBOARD_WRITE_PG_USER;
  const path = process.env.LEADERBOARD_WRITE_PG_PASSWORD_FILE || (credDir ? `${credDir}/write-pg-password` : null);
  if (!user || !path) return null;
  try {
    return { user, password: readFileSync(path, 'utf8').trim() };
  } catch {
    return null;
  }
}

// CORS origin allowlist (parity with the lambda utils/cors.ts: first allowed origin is the fallback when
// the request origin is absent or not allowlisted). Set by the unit from constants/cors ALLOWED_ORIGINS_ENV.
export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://nasun.io')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// Admin auth (dual-JWKS, parity with _shared/auth/dual-jwks.ts): verify the nasun-issuer JWT against the
// loopback issuer JWKS (:3210) + the identityId audience, then check the box user_profiles ADMIN role.
export const AUTH = {
  nasunIss: process.env.NASUN_ISSUER_ID || 'nasun-issuer',
  nasunJwksUrl: process.env.NASUN_ISSUER_JWKS_URL || 'http://127.0.0.1:3210/.well-known/jwks.json',
  audience: process.env.COGNITO_IDENTITY_POOL_ID || '',
};

// Admin/write routes cutover gate: 503 (inert) until COMPUTE_ADMIN_ENABLED=1 is set at the Phase 3 cutover
// (after the writer cred is provisioned). Keeps the box-direct write surface CLOSED so it cannot mutate the
// frozen mirror pre-cutover -- the write-then-read parity test is provably the first caller of the live path.
export const ADMIN_ENABLED = process.env.COMPUTE_ADMIN_ENABLED === '1';

// Footgun guard: with admin enabled but no audience, EVERY admin request silently 401s (verifyIdentityFromBearer
// rejects an empty audience). Warn loudly at startup so a cutover that sets COMPUTE_ADMIN_ENABLED=1 without
// COGNITO_IDENTITY_POOL_ID is debuggable instead of an opaque all-admin-401.
if (ADMIN_ENABLED && !AUTH.audience) {
  console.warn('[leaderboard] WARNING: COMPUTE_ADMIN_ENABLED=1 but COGNITO_IDENTITY_POOL_ID is unset -- ALL admin routes will 401.');
}
