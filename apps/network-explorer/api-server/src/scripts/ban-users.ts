/**
 * Ban suspected bot accounts.
 *
 * Resolves X handles → identityId/walletAddress via DynamoDB UserProfiles
 * and writes ban entries to the points DB. Ban semantics:
 *
 *   1. INSERT into banned_users (idempotent upsert; re-ban clears unbanned_at).
 *   2. UPDATE activity_points SET flagged = true WHERE identity_id = $1.
 *      Ecosystem leaderboard + settle-ecosystem already filter `WHERE NOT flagged`,
 *      so this single update silently removes the user from those paths.
 *   3. POST to chat-server's banned-cache refresh endpoint so Pado leaderboard
 *      and aggregator pick up the ban within seconds (otherwise wait 5 min TTL).
 *
 * Past settled snapshots (weekly_score_snapshots, weekly_ecosystem_snapshots)
 * are intentionally NOT modified — forward-only per
 * `feedback_no_modify_snapshots` and `feedback_points_monotonic_increase`.
 *
 * Usage:
 *   cd ~/my_apps/nasun-monorepo/apps/network-explorer/api-server
 *   set -a && source .env && set +a
 *
 *   # Dry-run (no writes, prints resolution table)
 *   AWS_PROFILE=nasun-prod npx tsx src/scripts/ban-users.ts \
 *     --reason "bot-suspected: identical timing posts" \
 *     --handles bot1 bot2 bot3
 *
 *   # Apply
 *   AWS_PROFILE=nasun-prod npx tsx src/scripts/ban-users.ts \
 *     --reason "bot-suspected: identical timing posts" \
 *     --handles-file ./bot-handles.txt \
 *     --execute
 *
 *   # Unban
 *   AWS_PROFILE=nasun-prod npx tsx src/scripts/ban-users.ts \
 *     --unban --handles user1 --execute
 *
 *   # List active bans
 *   npx tsx src/scripts/ban-users.ts --list
 *
 * --handles-file format: one handle per line, blank lines and `# comments` ignored.
 */

import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import {
  resolveHandle as svcResolveHandle,
  applyBans as svcApplyBans,
  applyUnbans as svcApplyUnbans,
  refreshChatServerCache as svcRefreshChatServerCache,
  normalizeHandle,
  type Resolution,
} from '../services/ban-service.js';

const POINTS_DB_URL = process.env.POINTS_DATABASE_URL;
const ADMIN_ACTOR = process.env.BAN_ADMIN_ACTOR || process.env.USER || 'cli';

if (!POINTS_DB_URL) {
  console.error('POINTS_DATABASE_URL not set');
  process.exit(1);
}

// ===== Args =====

const argv = process.argv.slice(2);
const has = (flag: string) => argv.includes(flag);

function getValue(flag: string): string | undefined {
  const i = argv.indexOf(flag);
  if (i < 0 || i + 1 >= argv.length) return undefined;
  return argv[i + 1];
}

function getMulti(flag: string): string[] {
  const i = argv.indexOf(flag);
  if (i < 0) return [];
  const out: string[] = [];
  for (let j = i + 1; j < argv.length; j++) {
    if (argv[j].startsWith('--')) break;
    out.push(argv[j]);
  }
  return out;
}

const execute = has('--execute');
const listOnly = has('--list');
const unban = has('--unban');
const reason = getValue('--reason') || (unban ? 'unbanned via CLI' : '');
const handlesArg = getMulti('--handles');
const handlesFile = getValue('--handles-file');

// ===== DB =====

const db = postgres(POINTS_DB_URL, { max: 3, idle_timeout: 30, connect_timeout: 10 });

// ===== Helpers =====

function loadHandles(): string[] {
  const raw: string[] = [...handlesArg];
  if (handlesFile) {
    const content = readFileSync(handlesFile, 'utf8');
    for (const line of content.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      raw.push(t);
    }
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of raw) {
    const n = normalizeHandle(h);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

// ===== Operations =====

async function listBans(): Promise<void> {
  const rows = await db<Array<{
    identity_id: string;
    wallet_address: string | null;
    x_handle: string | null;
    reason: string;
    banned_at: Date;
    banned_by: string;
    unbanned_at: Date | null;
  }>>`
    SELECT identity_id, wallet_address, x_handle, reason, banned_at, banned_by, unbanned_at
    FROM banned_users
    WHERE unbanned_at IS NULL
    ORDER BY banned_at DESC
  `;
  console.log(`Active bans: ${rows.length}\n`);
  for (const r of rows) {
    const wallet = r.wallet_address ? r.wallet_address.slice(0, 10) + '...' : '(no wallet)';
    const handle = r.x_handle ? `@${r.x_handle}` : '(no handle)';
    console.log(`  ${r.banned_at.toISOString()}  ${handle}  ${wallet}  ${r.identity_id}  by:${r.banned_by}`);
    console.log(`    reason: ${r.reason}`);
  }
}

async function applyBans(resolutions: Resolution[]): Promise<void> {
  const mapped = resolutions.filter((r) => r.identityId);
  if (mapped.length === 0) {
    console.log('No mappable resolutions. Nothing to ban.');
    return;
  }
  console.log(`\nApplying ${mapped.length} ban(s)...`);
  const results = await svcApplyBans(db, resolutions, reason, ADMIN_ACTOR);
  for (const r of results) {
    console.log(`  @${r.handle} → ${r.identityId} (${r.source ?? ''}): flagged ${r.flaggedRows} activity rows`);
  }
  await refreshChatServerCache();
}

async function applyUnbans(resolutions: Resolution[]): Promise<void> {
  const mapped = resolutions.filter((r) => r.identityId);
  if (mapped.length === 0) {
    console.log('No mappable resolutions. Nothing to unban.');
    return;
  }
  console.log(`\nUnbanning ${mapped.length} identity(ies)...`);
  const results = await svcApplyUnbans(db, resolutions, ADMIN_ACTOR, reason);
  for (const r of results) {
    if (!r.cleared) console.log(`  @${r.handle} → ${r.identityId}: no active ban (skipped)`);
    else console.log(`  @${r.handle} → ${r.identityId}: unflagged ${r.unflaggedRows} activity rows`);
  }
  await refreshChatServerCache();
}

async function refreshChatServerCache(): Promise<void> {
  const r = await svcRefreshChatServerCache();
  if (r.ok) {
    console.log('\n[ok] chat-server banned cache refreshed');
  } else if (r.error?.includes('not set')) {
    console.log(`\n[skip] ${r.error} — chat-server will refresh on its own TTL.`);
  } else if (r.status) {
    console.warn(`\n[warn] chat-server refresh returned ${r.status} (will refresh on TTL)`);
  } else {
    console.warn(`\n[warn] chat-server refresh failed: ${r.error} (will refresh on TTL)`);
  }
}

// ===== Main =====

async function main() {
  if (listOnly) {
    await listBans();
    await db.end();
    return;
  }

  const handles = loadHandles();
  if (handles.length === 0) {
    console.error('No handles given. Use --handles a b c, --handles-file path, or --list');
    process.exit(1);
  }
  if (!unban && !reason) {
    console.error('--reason is required for ban (use a short bot-suspicion description)');
    process.exit(1);
  }

  console.log(`\n=== ${unban ? 'UNBAN' : 'BAN'} ${execute ? 'EXECUTE' : 'DRY-RUN'} ===`);
  console.log(`Actor: ${ADMIN_ACTOR}`);
  console.log(`Reason: ${reason}`);
  console.log(`Handles: ${handles.length}\n`);

  // Resolve all handles in sequence (low rate, ~1 RPS, simpler than parallel).
  const allResolutions: Resolution[] = [];
  for (const handle of handles) {
    const rs = await svcResolveHandle(handle);
    allResolutions.push(...rs);
  }

  // Print resolution table
  console.log('Resolution table:');
  console.log('  status        handle              identityId                                      wallet');
  for (const r of allResolutions) {
    const wallet = r.walletAddress ? r.walletAddress.slice(0, 12) + '...' : '-';
    const id = r.identityId ?? '-';
    console.log(
      `  ${r.status.padEnd(13)} @${r.handle.padEnd(18)} ${id.padEnd(46)} ${wallet}` +
      (r.note ? `  (${r.note})` : ''),
    );
  }

  const unmapped = allResolutions.filter((r) => !r.identityId);
  if (unmapped.length > 0) {
    console.log(`\n${unmapped.length} unmapped (skipped): ${unmapped.map((r) => '@' + r.handle).join(', ')}`);
  }

  if (!execute) {
    console.log('\nDry-run complete. Re-run with --execute to apply.');
    await db.end();
    return;
  }

  if (unban) {
    await applyUnbans(allResolutions);
  } else {
    await applyBans(allResolutions);
  }

  await db.end();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
