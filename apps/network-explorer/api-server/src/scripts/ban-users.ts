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
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const POINTS_DB_URL = process.env.POINTS_DATABASE_URL;
const AWS_REGION = process.env.AWS_REGION || 'ap-northeast-2';
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || 'UserProfiles';
const CHAT_SERVER_URL = process.env.CHAT_SERVER_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
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

// ===== DB / DynamoDB clients =====

const db = postgres(POINTS_DB_URL, { max: 3, idle_timeout: 30, connect_timeout: 10 });
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: AWS_REGION }));

// ===== Helpers =====

function normalizeHandle(raw: string): string {
  return raw.replace(/^@/, '').toLowerCase().trim();
}

function isValidHandle(handle: string): boolean {
  return /^[a-z0-9_]{1,15}$/.test(handle);
}

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

interface UserProfileRecord {
  identityId: string;
  username?: string;
  twitterHandle?: string;
  walletAddress?: string;
}

interface LinkedAccountInfo {
  identityId?: string;
  walletAddress?: string;
}

interface FullProfile {
  identityId: string;
  walletAddress?: string;
  linkedAccounts?: Record<string, LinkedAccountInfo>;
}

interface Resolution {
  handle: string;
  identityId?: string;
  walletAddress?: string;
  status: 'mapped' | 'no-profile' | 'no-wallet' | 'lookup-error' | 'invalid-handle';
  note?: string;
}

async function lookupIdentityByHandle(handle: string): Promise<string | null> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: USER_PROFILES_TABLE,
      IndexName: 'twitterHandle-index',
      KeyConditionExpression: 'twitterHandle = :handle',
      ExpressionAttributeValues: { ':handle': handle },
    }),
  );
  if (!result.Items || result.Items.length === 0) return null;

  // Prefer the profile that actually has Twitter as primary identity (username
  // not wallet-shaped). Falls back to first item.
  let best = result.Items[0] as UserProfileRecord;
  for (const it of result.Items) {
    const p = it as UserProfileRecord;
    if (p.username && !p.username.startsWith('0x')) {
      best = p;
      break;
    }
  }
  return best.identityId;
}

/**
 * Resolve the wallet that earns ecosystem points for this user.
 *
 * X-primary signups link a separate "nasun wallet" identity that owns the
 * actual on-chain activity. We mirror the disbursement-target resolution from
 * grant-creators-appreciation-bonus.ts so bans hit the identity that earns,
 * not just the X-login identity.
 *
 * Returns up to 2 (identityId, walletAddress) pairs: the primary X-login
 * identity AND the linked nasun wallet identity. Both are banned so the
 * user can't simply switch login methods to evade.
 */
async function resolveBanTargets(primaryIdentityId: string): Promise<Array<{ identityId: string; walletAddress?: string; source: string }>> {
  const result = await ddb.send(
    new GetCommand({ TableName: USER_PROFILES_TABLE, Key: { identityId: primaryIdentityId } }),
  );
  const profile = result.Item as FullProfile | undefined;
  if (!profile) {
    return [{ identityId: primaryIdentityId, source: 'primary-no-profile' }];
  }

  const targets: Array<{ identityId: string; walletAddress?: string; source: string }> = [
    {
      identityId: primaryIdentityId,
      walletAddress: profile.walletAddress?.toLowerCase(),
      source: 'primary',
    },
  ];

  const nasunLink = profile.linkedAccounts?.['nasun wallet'];
  if (nasunLink?.identityId && nasunLink.identityId !== primaryIdentityId) {
    targets.push({
      identityId: nasunLink.identityId,
      walletAddress: nasunLink.walletAddress?.toLowerCase(),
      source: 'linked-nasun-wallet',
    });
  }

  return targets;
}

async function resolveHandle(handle: string): Promise<Resolution[]> {
  if (!isValidHandle(handle)) {
    return [{ handle, status: 'invalid-handle', note: 'X handle pattern violation' }];
  }
  let primaryId: string | null;
  try {
    primaryId = await lookupIdentityByHandle(handle);
  } catch (err) {
    return [{ handle, status: 'lookup-error', note: (err as Error).message }];
  }
  if (!primaryId) {
    return [{ handle, status: 'no-profile', note: 'no UserProfiles row with this twitterHandle' }];
  }
  const targets = await resolveBanTargets(primaryId);
  return targets.map((t) => ({
    handle,
    identityId: t.identityId,
    walletAddress: t.walletAddress,
    status: t.walletAddress ? 'mapped' : 'no-wallet',
    note: t.source,
  }));
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

  for (const r of mapped) {
    await db.begin(async (tx) => {
      const sql = tx as unknown as typeof db;
      // activity_points has a PG-side integrity guard that blocks all
      // UPDATEs by default (runtime code is INSERT-only). Admin corrections
      // bypass the guard for the duration of this single transaction.
      await sql`SET LOCAL app.allow_points_mutation = 'on'`;
      await sql`
        INSERT INTO banned_users (identity_id, wallet_address, x_handle, reason, banned_by, unbanned_at, unbanned_by)
        VALUES (${r.identityId!}, ${r.walletAddress ?? null}, ${r.handle}, ${reason}, ${ADMIN_ACTOR}, NULL, NULL)
        ON CONFLICT (identity_id) DO UPDATE SET
          wallet_address = COALESCE(EXCLUDED.wallet_address, banned_users.wallet_address),
          x_handle       = EXCLUDED.x_handle,
          reason         = EXCLUDED.reason,
          banned_at      = NOW(),
          banned_by      = EXCLUDED.banned_by,
          unbanned_at    = NULL,
          unbanned_by    = NULL
      `;

      // Cascade: flag all activity_points rows so existing & future ecosystem
      // queries (which already filter `WHERE NOT flagged`) drop this user.
      const updated = await sql<Array<{ count: string }>>`
        WITH upd AS (
          UPDATE activity_points
          SET flagged = true
          WHERE identity_id = ${r.identityId!}
            AND NOT flagged
          RETURNING 1
        )
        SELECT COUNT(*)::text AS count FROM upd
      `;
      console.log(`  @${r.handle} → ${r.identityId} (${r.note ?? ''}): flagged ${updated[0].count} activity rows`);
    });
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

  for (const r of mapped) {
    await db.begin(async (tx) => {
      const sql = tx as unknown as typeof db;
      await sql`SET LOCAL app.allow_points_mutation = 'on'`;
      const result = await sql<Array<{ identity_id: string }>>`
        UPDATE banned_users
        SET unbanned_at = NOW(),
            unbanned_by = ${ADMIN_ACTOR},
            notes = COALESCE(notes || E'\n', '') || ${'unban reason: ' + reason}
        WHERE identity_id = ${r.identityId!}
          AND unbanned_at IS NULL
        RETURNING identity_id
      `;
      if (result.length === 0) {
        console.log(`  @${r.handle} → ${r.identityId}: no active ban (skipped)`);
        return;
      }
      // Clear flagged on activity_points. Note: this also clears flagged that
      // may have been set by other sources (anti-abuse, manual). For now ban
      // is the only path that sets flagged=true on this code base. If other
      // flagging sources are added later, introduce a separate `flag_source`
      // column.
      const updated = await sql<Array<{ count: string }>>`
        WITH upd AS (
          UPDATE activity_points
          SET flagged = false
          WHERE identity_id = ${r.identityId!}
            AND flagged
          RETURNING 1
        )
        SELECT COUNT(*)::text AS count FROM upd
      `;
      console.log(`  @${r.handle} → ${r.identityId}: unflagged ${updated[0].count} activity rows`);
    });
  }

  await refreshChatServerCache();
}

async function refreshChatServerCache(): Promise<void> {
  if (!CHAT_SERVER_URL || !INTERNAL_API_KEY) {
    console.log('\n[skip] CHAT_SERVER_URL or INTERNAL_API_KEY not set — chat-server will refresh on its own TTL.');
    return;
  }
  try {
    const res = await fetch(`${CHAT_SERVER_URL}/api/pado/internal/banned-cache/refresh`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${INTERNAL_API_KEY}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      console.log('\n[ok] chat-server banned cache refreshed');
    } else {
      console.warn(`\n[warn] chat-server refresh returned ${res.status} (will refresh on TTL)`);
    }
  } catch (err) {
    console.warn(`\n[warn] chat-server refresh failed: ${(err as Error).message} (will refresh on TTL)`);
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
    const rs = await resolveHandle(handle);
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
