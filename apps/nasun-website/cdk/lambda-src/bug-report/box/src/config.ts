// Config + secret loading for nasun-bug-report -- box-co-located de-Lambda compute service for the bug-report
// + creator-posts system (AWS-exit Stage 4, BugReportStack slice). Clones the nasun-referral config contract.
//
// Secrets arrive via systemd LoadCredentialEncrypted -> $CREDENTIALS_DIRECTORY (tmpfs, host-bound), NOT
// plaintext env vars. Read pool = nasun_compute_ro (SELECT on bug_reports/creator_posts + user_profiles for
// the admin-role check). Write pool = nasun_bug_report (RW on bug_reports/creator_posts ONLY -- dedicated
// least-privilege role, dropped at teardown). Profile reads (admin enrich / creator-post twitter+wallet
// resolution) go through the box identity-compute loopback (:3211), the same readProfileFromBox contract the
// lambda used. Points rewards POST to the box explorer-api (:3200, x-api-key). Screenshots live on the box
// filesystem (SCREENSHOTS_DIR), signed with an HMAC key (S3 presigned POST/GET replacement).

import { readFileSync } from 'node:fs';

const credDir = process.env.CREDENTIALS_DIRECTORY;

function credPath(name: string, envOverride: string): string | null {
  return process.env[envOverride] || (credDir ? `${credDir}/${name}` : null);
}

function readRequired(name: string, envOverride: string): string {
  const path = credPath(name, envOverride);
  if (!path) {
    console.error(`[bug-report] FATAL: ${name} not provided (CREDENTIALS_DIRECTORY/${name} or ${envOverride})`);
    process.exit(1);
  }
  try {
    return readFileSync(path, 'utf8').trim();
  } catch (e) {
    console.error(`[bug-report] FATAL: cannot read ${name}: ${(e as Error).message}`);
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

// :3210 issuer, :3211 identity-compute, :3212 identity, :3213 leaderboard, :3214 referral, :3215 address-book
// are taken; bug-report takes :3216.
export const PORT = Number(process.env.BUG_REPORT_PORT || 3216);
export const HOST = process.env.BUG_REPORT_BIND || '127.0.0.1';

const pgHost = process.env.BUG_REPORT_PG_HOST || '127.0.0.1';
const pgIsUnixSocket = pgHost.startsWith('/');

export const PG = {
  host: pgHost,
  port: Number(process.env.BUG_REPORT_PG_PORT || 5432),
  database: process.env.BUG_REPORT_PG_DATABASE || 'nasun_dal',
  username: process.env.BUG_REPORT_PG_USER || 'nasun_compute_ro',
  password: pgIsUnixSocket
    ? readOptional('pg-password', 'BUG_REPORT_PG_PASSWORD_FILE')
    : readRequired('pg-password', 'BUG_REPORT_PG_PASSWORD_FILE'),
};

// Writer credential (nasun_bug_report: RW on bug_reports + creator_posts). Lazily used by write-pool.ts.
// Returns null when absent -- a pure-read deploy / shadow parity never touches it.
export function writeCred(): { user: string; password: string } | null {
  const user = process.env.BUG_REPORT_WRITE_PG_USER;
  const path = process.env.BUG_REPORT_WRITE_PG_PASSWORD_FILE || (credDir ? `${credDir}/write-pg-password` : null);
  if (!user || !path) return null;
  try {
    return { user, password: readFileSync(path, 'utf8').trim() };
  } catch {
    return null;
  }
}

// CORS allowlist: byte-identical to the bug-report/admin lambdas (cdk constants/cors ALLOWED_ORIGINS_ENV).
// First entry is the fallback origin (parity with the lambda getCorsHeaders).
export const ALLOWED_ORIGINS = (() => {
  const list = (process.env.ALLOWED_ORIGINS || 'https://nasun.io,https://staging.nasun.io')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  // Never allow an empty list (an explicitly-empty env would otherwise make corsOrigin emit an undefined
  // Access-Control-Allow-Origin header and break every cross-origin fetch).
  return list.length > 0 ? list : ['https://nasun.io'];
})();

// Admin + user-route auth (dual-JWKS, parity with _shared/auth/dual-jwks.ts + the referral box auth.ts).
// User routes (submit/my-reports/upload-url/reply/creator-post submit+my) verify the same nasun-issuer JWT;
// admin routes additionally require the box user_profiles ADMIN role.
export const AUTH = {
  nasunIss: process.env.NASUN_ISSUER_ID || 'nasun-issuer',
  nasunJwksUrl: process.env.NASUN_ISSUER_JWKS_URL || 'http://127.0.0.1:3210/.well-known/jwks.json',
  audience: process.env.COGNITO_IDENTITY_POOL_ID || '',
};

// Box identity-compute loopback (profile reads: admin-list enrich, creator-post twitter+wallet resolution).
// Same base+bearer the lambda used via _shared/auth/identity-write.ts (the :3211 GET routes share one
// authorized() bearer). On box this is loopback; the bearer is the identity-compute shared secret.
export const IDENTITY = {
  baseUrl: (process.env.IDENTITY_COMPUTE_URL || 'http://127.0.0.1:3211').replace(/\/+$/, ''),
  secretFile: process.env.IDENTITY_COMPUTE_SECRET_FILE || (credDir ? `${credDir}/identity-bearer` : null),
  timeoutMs: Number(process.env.IDENTITY_TIMEOUT_MS) > 0 ? Number(process.env.IDENTITY_TIMEOUT_MS) : 4000,
};
export function identitySecret(): string | undefined {
  if (!IDENTITY.secretFile) return undefined;
  try {
    return readFileSync(IDENTITY.secretFile, 'utf8').trim();
  } catch {
    return undefined;
  }
}

// Box explorer-api (points rewards: bug-report-reward + creator-post-reward). HTTP, x-api-key. explorer-api is
// co-located on the box (:3200 loopback). The key = the explorer-api BUG_REPORT_API_KEY env value (both reward
// routes are gated by requireInternalApiKey('BUG_REPORT_API_KEY')).
export const EXPLORER = {
  apiUrl: (process.env.EXPLORER_API_URL || 'http://127.0.0.1:3200').replace(/\/+$/, ''),
  apiKey: readOptional('explorer-bug-report-key', 'EXPLORER_BUG_REPORT_API_KEY'),
};

// Telegram notification (best-effort). Token via systemd cred (shared nasun bot token); chat id is non-secret.
export const TELEGRAM = {
  botToken: readOptional('telegram-bot-token', 'TELEGRAM_BOT_TOKEN_FILE'),
  chatId: process.env.NARU_TELEGRAM_CHAT_ID || '',
};

// Screenshot object store (box filesystem; S3 presigned POST/GET replacement). Files live under
// SCREENSHOTS_DIR/bug-screenshots/<identityId>/<uuid>.<ext>; upload + serve URLs are HMAC-signed with
// SCREENSHOT_SIGNING_KEY. PUBLIC_BASE_URL is the public gateway prefix the browser POSTs/GETs against
// (https://api.nasun.io/feedback -> nginx strips /feedback -> this service).
export const SCREENSHOTS = {
  dir: process.env.SCREENSHOTS_DIR || '/srv/nasun/bug-report/screenshots',
  signingKey: readOptional('screenshot-signing-key', 'SCREENSHOT_SIGNING_KEY_FILE'),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || 'https://api.nasun.io/feedback').replace(/\/+$/, ''),
  // Closed/orphan screenshots are pruned this many days after they stop being referenced by a non-terminal
  // report (the user only needs them while a report is open; "fixed report images can be deleted soon").
  retentionDays: Number(process.env.SCREENSHOT_RETENTION_DAYS) > 0 ? Number(process.env.SCREENSHOT_RETENTION_DAYS) : 7,
};

// Creator-posts per-user daily submission cap (parity with the lambda CREATOR_POSTS_DAILY_LIMIT, default 20).
export const CREATOR_POSTS_DAILY_LIMIT = Math.max(1, parseInt(process.env.CREATOR_POSTS_DAILY_LIMIT || '20', 10));
