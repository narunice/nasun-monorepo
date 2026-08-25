// Config + secret loading for nasun-referral -- box-co-located de-Lambda compute service for the referral
// system (AWS-exit Stage 4, referral de-Lambda slice). Clones the nasun-leaderboard config contract.
//
// The PG password arrives via systemd LoadCredentialEncrypted -> $CREDENTIALS_DIRECTORY (tmpfs, host-bound),
// NOT a plaintext env var. The read pool uses nasun_compute_ro (SELECT on referrals/referral_codes +
// user_profiles for the admin-role check). The write pool uses nasun_identity (RW on referrals/referral_codes
// only; user_profiles writes go through the identity-compute /profile/attributes-sync loopback, NEVER direct,
// so user_profiles stays single-writer through nasun-identity).
//
// Profile reads (self-ref / twitter-reuse / cooldown / referee enrich) call the box identity-compute service
// over loopback (the same readProfileFromBox / by-twitter-id / batch contract the referral lambda used);
// eligibility-signals + referral-stats + onboarding-bonus stay on the box explorer-api over HTTP.

import { readFileSync } from 'node:fs';

const credDir = process.env.CREDENTIALS_DIRECTORY;

function credPath(name: string, envOverride: string): string | null {
  return process.env[envOverride] || (credDir ? `${credDir}/${name}` : null);
}

function readRequired(name: string, envOverride: string): string {
  const path = credPath(name, envOverride);
  if (!path) {
    console.error(`[referral] FATAL: ${name} not provided (CREDENTIALS_DIRECTORY/${name} or ${envOverride})`);
    process.exit(1);
  }
  try {
    return readFileSync(path, 'utf8').trim();
  } catch (e) {
    console.error(`[referral] FATAL: cannot read ${name}: ${(e as Error).message}`);
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

// :3210 issuer, :3211 identity, :3212 identity-compute, :3213 leaderboard are taken; referral takes :3214.
export const PORT = Number(process.env.REFERRAL_PORT || 3214);
export const HOST = process.env.REFERRAL_BIND || '127.0.0.1';

const pgHost = process.env.REFERRAL_PG_HOST || '127.0.0.1';
const pgIsUnixSocket = pgHost.startsWith('/');

export const PG = {
  host: pgHost,
  port: Number(process.env.REFERRAL_PG_PORT || 5432),
  database: process.env.REFERRAL_PG_DATABASE || 'nasun_dal',
  username: process.env.REFERRAL_PG_USER || 'nasun_compute_ro',
  password: pgIsUnixSocket
    ? readOptional('pg-password', 'REFERRAL_PG_PASSWORD_FILE')
    : readRequired('pg-password', 'REFERRAL_PG_PASSWORD_FILE'),
};

// Writer credential (nasun_identity: RW on referrals + referral_codes). Present ONLY at the Phase 3 cutover.
// Returns null when absent -- the read service + shadow parity never need it.
export function writeCred(): { user: string; password: string } | null {
  const user = process.env.REFERRAL_WRITE_PG_USER;
  const path = process.env.REFERRAL_WRITE_PG_PASSWORD_FILE || (credDir ? `${credDir}/write-pg-password` : null);
  if (!user || !path) return null;
  try {
    return { user, password: readFileSync(path, 'utf8').trim() };
  } catch {
    return null;
  }
}

export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://nasun.io')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// Admin auth (dual-JWKS, parity with _shared/auth/dual-jwks.ts + the leaderboard box auth.ts).
export const AUTH = {
  nasunIss: process.env.NASUN_ISSUER_ID || 'nasun-issuer',
  nasunJwksUrl: process.env.NASUN_ISSUER_JWKS_URL || 'http://127.0.0.1:3210/.well-known/jwks.json',
  audience: process.env.COGNITO_IDENTITY_POOL_ID || '',
};

// User-route auth: the 5 user routes (my-code/apply/my-stats/my-referees/appeal) were behind the lambda
// dual-jwks TokenAuthorizer (verifyIdentityId). The box verifies the same nasun-issuer JWT (verifyIdentityFromBearer).
// Always on (the routes require an authenticated identityId, unlike the admin gate which is cutover-gated).

// Box identity-compute loopback (profile reads + the user_profiles attributes-sync write). Same base+bearer
// the referral lambda used via _shared/auth/identity-write.ts (the :3211 GET+POST routes share one authorized()
// bearer). On box this is loopback (http://127.0.0.1:3211); the bearer is the identity-compute shared secret.
export const IDENTITY = {
  baseUrl: (process.env.IDENTITY_COMPUTE_URL || 'http://127.0.0.1:3211').replace(/\/+$/, ''),
  secretFile: process.env.IDENTITY_COMPUTE_SECRET_FILE || (credDir ? `${credDir}/identity-bearer` : null),
  timeoutMs: Number(process.env.IDENTITY_TIMEOUT_MS) > 0 ? Number(process.env.IDENTITY_TIMEOUT_MS) : 4000,
};
export function identitySecret(): string {
  if (!IDENTITY.secretFile) {
    console.error('[referral] FATAL: identity bearer not provided (CREDENTIALS_DIRECTORY/identity-bearer or IDENTITY_COMPUTE_SECRET_FILE)');
    process.exit(1);
  }
  try {
    return readFileSync(IDENTITY.secretFile, 'utf8').trim();
  } catch (e) {
    console.error(`[referral] FATAL: cannot read identity bearer: ${(e as Error).message}`);
    process.exit(1);
  }
}

// Box explorer-api (eligibility-signals + referral-stats + onboarding-bonus). HTTP, x-api-key. explorer-api
// is co-located on the box (:3200 loopback) post-v8-cutover, so default to loopback (the service unit also sets
// EXPLORER_API_URL). The explorer-api gates these routes with TWO DISTINCT keys (verified differ on box):
// eligibility-signals + referral-stats require REFERRAL_MAPPINGS_API_KEY; onboarding-bonus requires the
// separate ONBOARDING_BONUS_API_KEY. They are NOT interchangeable -- a single key 401s one of the two surfaces.
export const EXPLORER = {
  apiUrl: (process.env.EXPLORER_API_URL || 'http://127.0.0.1:3200').replace(/\/+$/, ''),
  // eligibility-signals + referral-stats: value of the explorer-api REFERRAL_MAPPINGS_API_KEY.
  statsKey: readOptional('explorer-stats-key', 'EXPLORER_STATS_API_KEY'),
  // onboarding-bonus (admin approve / appeal-reverse backfill): value of the explorer-api ONBOARDING_BONUS_API_KEY.
  onboardingKey: readOptional('explorer-onboarding-key', 'EXPLORER_ONBOARDING_API_KEY'),
  timeoutMs: 5000,
};

// Referral eligibility gate toggle (parity with the lambda REFERRAL_GATE_ENABLED; default on).
export const REFERRAL_GATE_ENABLED = process.env.REFERRAL_GATE_ENABLED !== 'false';

// Shared internal-API key for the box's OWN internal routes (/internal/referral-mappings consumed by the
// node-3 explorer-api scanner = cross-host, /internal/referral-activated consumed by explorer-api onboarding
// gate = cross-host). timingSafeEqual compared in auth.ts. Loopback-only is NOT sufficient (cross-host caller).
export function internalApiKey(): string | undefined {
  return readOptional('internal-api-key', 'REFERRAL_INTERNAL_API_KEY');
}

// Admin/write routes cutover gate: 503 (inert) until COMPUTE_ADMIN_ENABLED=1 at the Phase 3b cutover (after
// the writer cred is provisioned). Keeps the box-direct write surface CLOSED pre-cutover.
export const ADMIN_ENABLED = process.env.COMPUTE_ADMIN_ENABLED === '1';

if (ADMIN_ENABLED && !AUTH.audience) {
  console.warn('[referral] WARNING: COMPUTE_ADMIN_ENABLED=1 but COGNITO_IDENTITY_POOL_ID is unset -- ALL admin routes will 401.');
}
