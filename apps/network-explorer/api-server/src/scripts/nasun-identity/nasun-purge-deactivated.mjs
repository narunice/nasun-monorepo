// /srv/nasun/identity/nasun-purge-deactivated.mjs
// AWS-exit order 6: box port of the nasun-common-purge-deactivated-accounts lambda, the last
// scheduled compute left in the prod AWS account. Deletes every account past its 7-day
// deletion grace (status=DEACTIVATED AND deletionScheduledAt<=now).
//
// The lambda already read the box (PURGE_SCAN_SOURCE=box) and wrote the box
// (/profile/delete in IDENTITY_WRITE_FLIP_ROUTES); its only remaining AWS-side step was a
// DeleteItem against the UserProfiles table, which no longer exists (dropped when the DAL
// ceded SoT to the box), so that call threw on every purge and was swallowed. Dropping it
// makes the box the sole store, which it already was in practice.
//
// Reaches nasun-identity over loopback (:3211) instead of https://issuer.nasun.io/identity,
// so the bearer never leaves the host. Both routes are bearer-gated; the credential arrives
// via LoadCredentialEncrypted, same cred file the server itself reads.
//
// Exit codes: 0 = clean run, 1 = the scan failed or at least one delete failed. Unlike the
// lambda (which had to stay silent so EventBridge would not auto-retry a full re-Scan), a
// non-zero exit here is the correct signal: the timer does not retry immediately, the next
// daily run re-enumerates whatever is left, and /profile/delete is idempotent.

import { readFileSync } from 'node:fs';

const BASE = process.env.IDENTITY_BASE_URL || 'http://127.0.0.1:3211';
const TIMEOUT_MS = Number(process.env.PURGE_TIMEOUT_MS || 2500);

const credDir = process.env.CREDENTIALS_DIRECTORY;
const bearerFile = process.env.IDENTITY_BEARER_FILE || (credDir ? `${credDir}/identity-bearer` : null);
if (!bearerFile) {
  console.error('[purge] FATAL: identity-bearer not provided (CREDENTIALS_DIRECTORY/identity-bearer or IDENTITY_BEARER_FILE)');
  process.exit(1);
}

let bearer;
try {
  bearer = readFileSync(bearerFile, 'utf8').trim();
} catch (e) {
  console.error(`[purge] FATAL: cannot read identity-bearer: ${e.message}`);
  process.exit(1);
}
if (bearer.length < 16) {
  console.error('[purge] FATAL: identity-bearer too short (>=16 bytes required)');
  process.exit(1);
}

async function call(method, path, { query, body } = {}) {
  const url = new URL(path, BASE);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${bearer}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

async function main() {
  const now = Math.floor(Date.now() / 1000);
  console.log('[purge] starting');

  // A scan failure aborts the whole run: purging nothing is safe, a half-read purge is not.
  const out = await call('GET', '/profile/deactivated-due', { query: { before: String(now) } });
  const accounts = Array.isArray(out?.accounts) ? out.accounts : [];
  console.log(`[purge] ${accounts.length} account(s) due`);

  const failures = [];
  for (const { identityId } of accounts) {
    if (typeof identityId !== 'string' || !identityId) continue;
    try {
      await call('POST', '/profile/delete', { body: { identityId } });
      console.log(`[purge] purged ${identityId}`);
    } catch (e) {
      // Retried on the next daily run: the row keeps its DEACTIVATED status and stays due.
      console.error(`[purge] failed ${identityId}: ${e.message}`);
      failures.push(identityId);
    }
  }

  if (failures.length) {
    console.error(`[purge] ${failures.length}/${accounts.length} not purged: ${failures.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  console.log('[purge] done');
}

main().catch((e) => {
  console.error(`[purge] run aborted: ${e.message}`);
  process.exit(1);
});
