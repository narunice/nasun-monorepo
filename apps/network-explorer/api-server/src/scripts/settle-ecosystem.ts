/**
 * Nasun Ecosystem Leaderboard -> Ecosystem Points Settlement Script
 *
 * Computes the weekly ecosystem leaderboard from PostgreSQL `activity_points`
 * (same SQL the public /ecosystem/leaderboard endpoint uses), reproduces the
 * same tiebreaker order applied by the API, and awards rank-based Ecosystem
 * Points to the top 2000.
 *
 * Eligibility (must satisfy all):
 *   - identityId resolvable (registered Cognito identity)
 *   - Active Alliance NFT (from ECOSYSTEM_ACTIVATIONS_URL)
 *   - At least one social account connected (Twitter / Google / Telegram)
 *   - Rank <= 2000
 * Genesis Pass holders receive a 2x multiplier at settlement (same as Pado).
 *
 * Reward table (mirrors settle-pado.ts):
 *   1: 50, 2: 45, 3: 40, 4-10: 35, 11-20: 30, 21-50: 25, 51-100: 20,
 *   101-200: 15, 201-300: 10, 301-500: 8, 501-1000: 6, 1001-2000: 5
 *
 * State:
 *   - weekly_ecosystem_snapshots (idempotent settlement ledger, parallel to
 *     weekly_score_snapshots used by Pado)
 *   - activity_points: category='ecosystem-bonus-leaderboard',
 *                      activity_type='weekly-${weekId}'
 *
 * Safety:
 *   - Refuses to settle the current (in-progress) ISO week.
 *   - Aborts if Alliance set is empty (API outage).
 *   - INSERT activity_points uses ON CONFLICT DO NOTHING (re-run safe).
 *   - settled flag is set in the same PG transaction as the INSERT.
 *
 * Usage:
 *   cd ~/explorer-api && set -a && source .env && set +a
 *   AWS_PROFILE=nasun-prod npx tsx src/scripts/settle-ecosystem.ts --week 2026-W17
 *   AWS_PROFILE=nasun-prod npx tsx src/scripts/settle-ecosystem.ts --week auto --dry-run
 */

import postgres from 'postgres';
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, BatchGetCommand } from '@aws-sdk/lib-dynamodb';

const gunzipAsync = promisify(gunzip);

// ===== Config =====

const POINTS_DB_URL = process.env.POINTS_DATABASE_URL;
const ECOSYSTEM_ACTIVATIONS_URL = process.env.ECOSYSTEM_ACTIVATIONS_URL;
const ECOSYSTEM_ACTIVATIONS_API_KEY = process.env.ECOSYSTEM_ACTIVATIONS_API_KEY || '';
const WALLET_MAPPINGS_URL = process.env.WALLET_MAPPINGS_URL;
const WALLET_MAPPINGS_API_KEY = process.env.WALLET_MAPPINGS_API_KEY || '';
const AWS_REGION = process.env.AWS_REGION || 'ap-northeast-2';
const USER_PROFILES_TABLE = process.env.USER_PROFILES_TABLE || 'UserProfiles';

if (!POINTS_DB_URL) {
  console.error('POINTS_DATABASE_URL not set');
  process.exit(1);
}
if (!ECOSYSTEM_ACTIVATIONS_URL) {
  console.error('ECOSYSTEM_ACTIVATIONS_URL not set');
  process.exit(1);
}
if (!WALLET_MAPPINGS_URL) {
  console.error('WALLET_MAPPINGS_URL not set');
  process.exit(1);
}

// ===== Reward table (mirrors settle-pado.ts) =====

const REWARD_TABLE: Array<{ maxRank: number; pts: number }> = [
  { maxRank: 1,    pts: 50 },
  { maxRank: 2,    pts: 45 },
  { maxRank: 3,    pts: 40 },
  { maxRank: 10,   pts: 35 },
  { maxRank: 20,   pts: 30 },
  { maxRank: 50,   pts: 25 },
  { maxRank: 100,  pts: 20 },
  { maxRank: 200,  pts: 15 },
  { maxRank: 300,  pts: 10 },
  { maxRank: 500,  pts: 8  },
  { maxRank: 1000, pts: 6  },
  { maxRank: 2000, pts: 5  },
];

function getRewardPts(rank: number): number {
  for (const tier of REWARD_TABLE) {
    if (rank <= tier.maxRank) return tier.pts;
  }
  return 0;
}

const TOP_N = 2000;

// ===== ISO week helpers (mirrors routes/ecosystem.ts exactly) =====

function getISOWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

function getCurrentWeekId(): string {
  const { year, week } = getISOWeek(new Date());
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function getPreviousWeekId(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  const { year, week } = getISOWeek(d);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

// Monday 00:00 UTC reset. Settlement crons run at 00:15/00:20 UTC.
function getWeekBounds(weekId: string): { start: Date; end: Date } | null {
  const match = weekId.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);
  if (week < 1 || week > 53) return null;

  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4.getTime() - (jan4Day - 1) * 86_400_000);
  const weekMonday = new Date(week1Monday.getTime() + (week - 1) * 7 * 86_400_000);
  const start = new Date(weekMonday.getTime());
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { start, end };
}

// ===== Args =====

const args = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : undefined;
}

const weekArg = getArg('week') || 'auto';
const dryRun = args.includes('--dry-run');

// ===== Activations fetch (Alliance + Genesis Pass sets) =====

interface ActivationsPayload {
  activations: Record<string, Array<{ nftType: string; nftCount?: number }>>;
}

async function fetchActivationsPayload(): Promise<ActivationsPayload> {
  const headers: Record<string, string> = {};
  if (ECOSYSTEM_ACTIVATIONS_API_KEY) headers['x-api-key'] = ECOSYSTEM_ACTIVATIONS_API_KEY;

  const res = await fetch(ECOSYSTEM_ACTIVATIONS_URL!, {
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Ecosystem activations API error: ${res.status}`);

  const data = await res.json() as ActivationsPayload | { url: string };

  if ('url' in data) {
    const s3Res = await fetch(data.url, { signal: AbortSignal.timeout(60_000) });
    if (!s3Res.ok) throw new Error(`Ecosystem activations S3 offload error: ${s3Res.status}`);
    const buf = Buffer.from(await s3Res.arrayBuffer());
    const decompressed = await gunzipAsync(buf);
    return JSON.parse(decompressed.toString('utf8')) as ActivationsPayload;
  }
  return data;
}

// ===== Wallet mapping (identityId -> primary wallet address) =====

async function fetchIdentityToWallet(): Promise<Map<string, string>> {
  const headers: Record<string, string> = {};
  if (WALLET_MAPPINGS_API_KEY) headers['x-api-key'] = WALLET_MAPPINGS_API_KEY;

  const res = await fetch(WALLET_MAPPINGS_URL!, { headers, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Wallet mappings API error: ${res.status}`);

  let payload = await res.json() as { wallets?: Record<string, string>; url?: string };

  // Handle S3 presigned offload (same pattern as activations API)
  if (payload.url) {
    const s3Res = await fetch(payload.url, { signal: AbortSignal.timeout(60_000) });
    if (!s3Res.ok) throw new Error(`Wallet mappings S3 offload error: ${s3Res.status}`);
    const buf = Buffer.from(await s3Res.arrayBuffer());
    const decompressed = await gunzipAsync(buf);
    payload = JSON.parse(decompressed.toString('utf8'));
  }

  // wallets payload: walletAddress -> identityId. Reverse for our lookup.
  const map = new Map<string, string>();
  for (const [walletAddr, identityId] of Object.entries(payload.wallets || {})) {
    if (!map.has(identityId)) {
      map.set(identityId, walletAddr.toLowerCase());
    }
  }
  return map;
}

// ===== Profile batch (social + isTelegramMember for eligibility + tiebreak) =====

interface ProfileFlags {
  hasSocialAccount: boolean;
  isTelegramMember: boolean;
}

function hasSocialConnection(item: Record<string, unknown>): boolean {
  const provider = ((item.provider as string | undefined) ?? '').toLowerCase();
  if (provider === 'twitter') return true;
  if (provider === 'google' || provider === 'accounts.google.com') return true;
  if (typeof item.twitterHandle === 'string' && (item.twitterHandle as string).length > 0) return true;
  const linked = (item.linkedAccounts as Record<string, unknown> | undefined) ?? {};
  if (linked.twitter || linked.google) return true;
  if (item.isTelegramMember === true) return true;
  if (typeof item.telegramUserId === 'string' && (item.telegramUserId as string).length > 0) return true;
  return false;
}

async function fetchProfileFlags(identityIds: string[]): Promise<Map<string, ProfileFlags>> {
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: AWS_REGION }));
  const result = new Map<string, ProfileFlags>();
  if (identityIds.length === 0) return result;

  const CHUNK = 100;
  const MAX_RETRIES = 5;
  for (let i = 0; i < identityIds.length; i += CHUNK) {
    let pendingKeys = identityIds.slice(i, i + CHUNK).map(id => ({ identityId: id }));
    for (let attempt = 0; pendingKeys.length > 0; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 100 * 2 ** (attempt - 1)));
      if (attempt > MAX_RETRIES) {
        throw new Error(`UserProfiles BatchGet exceeded ${MAX_RETRIES} retries`);
      }
      const res = await ddb.send(new BatchGetCommand({
        RequestItems: {
          [USER_PROFILES_TABLE]: {
            Keys: pendingKeys,
            ProjectionExpression: 'identityId, #pr, twitterHandle, linkedAccounts, #tgm, telegramUserId',
            ExpressionAttributeNames: { '#pr': 'provider', '#tgm': 'isTelegramMember' },
          },
        },
      }));
      for (const item of res.Responses?.[USER_PROFILES_TABLE] ?? []) {
        const id = item.identityId as string;
        result.set(id, {
          hasSocialAccount: hasSocialConnection(item),
          isTelegramMember: (item.isTelegramMember as boolean | undefined) ?? false,
        });
      }
      pendingKeys = (res.UnprocessedKeys?.[USER_PROFILES_TABLE]?.Keys as typeof pendingKeys) ?? [];
    }
  }
  return result;
}

// ===== Main =====

interface RankedRow {
  identityId: string;
  weeklyScore: number;
  activityScore: number;
  hasGenesisPass: boolean;
  isTelegramMember: boolean;
  hasSocialAccount: boolean;
  walletAddress: string | null;
  rank: number;
}

async function main() {
  // 1. Resolve target week
  let weekId: string;
  if (weekArg === 'auto') {
    weekId = getPreviousWeekId();
    console.log(`[settle-ecosystem] Auto-detected week: ${weekId}`);
  } else {
    weekId = weekArg;
  }
  if (!/^\d{4}-W\d{2}$/.test(weekId)) {
    console.error(`Invalid week format: ${weekId} (expected YYYY-Www e.g. 2026-W17)`);
    process.exit(1);
  }
  const bounds = getWeekBounds(weekId);
  if (!bounds) {
    console.error(`Invalid weekId bounds: ${weekId}`);
    process.exit(1);
  }
  if (weekId === getCurrentWeekId()) {
    console.error(`ABORT: ${weekId} is the current in-progress week. Settle past weeks only.`);
    process.exit(1);
  }

  console.log(`\n=== Ecosystem Leaderboard Settlement ${weekId} (${dryRun ? 'DRY RUN' : 'LIVE'}) ===\n`);

  // 2. Fetch activations -> Alliance + Genesis sets
  console.log('Fetching NFT activations (Alliance + Genesis Pass)...');
  const payload = await fetchActivationsPayload();
  const allianceSet = new Set<string>();
  const genesisSet = new Set<string>();
  for (const [identityId, acts] of Object.entries(payload.activations)) {
    if (acts.some(a => a.nftType === 'alliance')) allianceSet.add(identityId);
    if (acts.some(a => a.nftType === 'genesis-pass')) genesisSet.add(identityId);
  }
  console.log(`  Alliance: ${allianceSet.size}, Genesis Pass: ${genesisSet.size}`);
  if (allianceSet.size === 0) {
    console.error('ABORT: Alliance set is empty (API outage?). Refusing to settle silently.');
    process.exit(1);
  }

  // 3. Fetch wallet mapping (for activity_points.wallet_address)
  console.log('Fetching wallet mappings...');
  const identityToWallet = await fetchIdentityToWallet();
  console.log(`  ${identityToWallet.size} registered identities`);

  // 4. Connect to PG and run leaderboard SQL
  const pgDb = postgres(POINTS_DB_URL!, { max: 3, idle_timeout: 30, connect_timeout: 10 });

  console.log(`Querying activity_points for week ${weekId}...`);
  const rows = await pgDb<Array<{
    identity_id: string;
    weekly_score: number;
    activity_score: number;
  }>>`
    WITH week_activities AS (
      SELECT DISTINCT identity_id,
        FLOOR(
          (EXTRACT(EPOCH FROM tx_timestamp) - EXTRACT(EPOCH FROM ${bounds.start}::timestamptz))
          / 86400
        )::int AS day_slot,
        category
      FROM activity_points
      WHERE NOT flagged
        AND identity_id IS NOT NULL
        AND tx_timestamp >= ${bounds.start}
        AND tx_timestamp < ${bounds.end}
        -- Intentional exclusions:
        --   'staking-daily' (NFT tier-based daily pts) is excluded by design.
        --     Including it would let large NFT stakers dominate the weekly
        --     leaderboard purely by holding, drowning out actual activity.
        --     It still accrues to all-time totals via daily-snapshot's
        --     all_time_staking_scaled column and the live header formula.
        --   'staking-reward' (token emission delta) is reintroduced below in
        --     the staking_emission CTE and added to weekly_score.
        AND category NOT IN (
          'referral-bonus', 'daily-mission', 'ecosystem-passive',
          'staking-daily', 'staking', 'staking-reward'
        )
        AND category NOT LIKE 'ecosystem-bonus-%'
        AND category NOT LIKE 'pado-%'
    ),
    activity_score AS (
      SELECT identity_id,
             COUNT(*)::int AS activity_score,
             COUNT(DISTINCT day_slot)::int AS active_days
      FROM week_activities
      GROUP BY identity_id
    ),
    creator_post_score AS (
      SELECT identity_id,
             COALESCE(SUM(final_points), 0) / 5.0 AS post_score
      FROM activity_points
      WHERE category = 'ecosystem-bonus-creator-posts'
        AND NOT flagged AND identity_id IS NOT NULL
        AND tx_timestamp >= ${bounds.start} AND tx_timestamp < ${bounds.end}
      GROUP BY identity_id
    ),
    bonus_score AS (
      SELECT identity_id,
        COALESCE(SUM(final_points) FILTER (
          WHERE category IN ('ecosystem-bonus-bugreport', 'ecosystem-bonus-feedback')
        ), 0) / 2.0
        + COALESCE(SUM(final_points) FILTER (
          WHERE category = 'ecosystem-bonus-game'
        ), 0) / 3.0 AS bonus_score
      FROM activity_points
      WHERE category IN ('ecosystem-bonus-bugreport','ecosystem-bonus-feedback','ecosystem-bonus-game')
        AND NOT flagged AND identity_id IS NOT NULL
        AND tx_timestamp >= ${bounds.start} AND tx_timestamp < ${bounds.end}
      GROUP BY identity_id
    ),
    volume_score AS (
      SELECT identity_id, COUNT(*)::int AS volume_count
      FROM activity_points
      WHERE category IN ('pado-lottery','pado-games','pado-scratchcard','wallet-transfer')
        AND NOT flagged AND identity_id IS NOT NULL
        AND tx_timestamp >= ${bounds.start} AND tx_timestamp < ${bounds.end}
      GROUP BY identity_id
    ),
    staking_emission AS (
      SELECT identity_id,
             COALESCE(SUM(final_points), 0)::float8 AS emission_score
      FROM activity_points
      WHERE category = 'staking-reward'
        AND NOT flagged AND identity_id IS NOT NULL
        AND tx_timestamp >= ${bounds.start} AND tx_timestamp < ${bounds.end}
      GROUP BY identity_id
    )
    SELECT
      COALESCE(a.identity_id, c.identity_id, b.identity_id, v.identity_id, se.identity_id) AS identity_id,
      COALESCE(a.activity_score, 0)::int AS activity_score,
      (
        COALESCE(a.activity_score, 0)
        + COALESCE(c.post_score, 0)
        + COALESCE(b.bonus_score, 0)
        + 1.6 * LOG(2, COALESCE(v.volume_count, 0) + 1)
        + COALESCE(se.emission_score, 0)
      )::float8 AS weekly_score
    FROM activity_score a
    FULL OUTER JOIN creator_post_score c ON a.identity_id = c.identity_id
    FULL OUTER JOIN bonus_score b
      ON COALESCE(a.identity_id, c.identity_id) = b.identity_id
    FULL OUTER JOIN volume_score v
      ON COALESCE(a.identity_id, c.identity_id, b.identity_id) = v.identity_id
    FULL OUTER JOIN staking_emission se
      ON COALESCE(a.identity_id, c.identity_id, b.identity_id, v.identity_id) = se.identity_id
    ORDER BY weekly_score DESC, activity_score DESC, identity_id ASC
    LIMIT ${TOP_N}
  `;

  const validRows = rows.filter(r => r.identity_id != null);
  console.log(`  ${validRows.length} ranked entries (top ${TOP_N})`);

  if (validRows.length === 0) {
    console.log('No leaderboard entries for this week. Exiting.');
    await pgDb.end();
    process.exit(0);
  }

  // 5. Fetch profile flags (DDB BatchGet) for tiebreak + social check
  console.log('Fetching profile flags (DynamoDB BatchGet)...');
  const identityIds = validRows.map(r => r.identity_id);
  const profileFlags = await fetchProfileFlags(identityIds);

  // 6. Build ranked rows + apply JS tiebreaker (matches /leaderboard endpoint)
  const ranked: RankedRow[] = validRows.map(r => {
    const flags = profileFlags.get(r.identity_id);
    return {
      identityId: r.identity_id,
      weeklyScore: Number(r.weekly_score),
      activityScore: r.activity_score,
      hasGenesisPass: genesisSet.has(r.identity_id),
      isTelegramMember: flags?.isTelegramMember ?? false,
      hasSocialAccount: flags?.hasSocialAccount ?? false,
      walletAddress: identityToWallet.get(r.identity_id) ?? null,
      rank: 0,
    };
  });

  ranked.sort((a, b) => {
    if (b.weeklyScore !== a.weeklyScore) return b.weeklyScore - a.weeklyScore;
    if (b.activityScore !== a.activityScore) return b.activityScore - a.activityScore;
    if (a.isTelegramMember !== b.isTelegramMember) return a.isTelegramMember ? -1 : 1;
    if (a.hasGenesisPass !== b.hasGenesisPass) return a.hasGenesisPass ? -1 : 1;
    return a.identityId.localeCompare(b.identityId);
  });
  ranked.forEach((row, idx) => { row.rank = idx + 1; });

  // 7. Ensure snapshot table exists
  await pgDb`
    CREATE TABLE IF NOT EXISTS weekly_ecosystem_snapshots (
      week_id      TEXT NOT NULL,
      identity_id  TEXT NOT NULL,
      weekly_score DOUBLE PRECISION NOT NULL,
      rank         INTEGER NOT NULL,
      settled      INTEGER NOT NULL DEFAULT 0,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (week_id, identity_id)
    )
  `;
  await pgDb`
    CREATE INDEX IF NOT EXISTS idx_wes_unsettled
      ON weekly_ecosystem_snapshots (week_id, settled)
  `;

  // 8. Upsert snapshot rows (preserve original rank from first run; idempotent)
  console.log('\nUpserting snapshot rows...');
  for (const row of ranked) {
    await pgDb`
      INSERT INTO weekly_ecosystem_snapshots (week_id, identity_id, weekly_score, rank, settled)
      VALUES (${weekId}, ${row.identityId}, ${row.weeklyScore}, ${row.rank}, 0)
      ON CONFLICT (week_id, identity_id) DO NOTHING
    `;
  }

  // 9. Settle unsettled rows
  const unsettled = await pgDb<Array<{ identity_id: string; rank: number; weekly_score: number }>>`
    SELECT identity_id, rank, weekly_score
    FROM weekly_ecosystem_snapshots
    WHERE week_id = ${weekId} AND settled = 0
    ORDER BY rank ASC
  `;
  console.log(`  ${unsettled.length} unsettled entries`);
  if (unsettled.length === 0) {
    console.log('All entries already settled for this week.');
    await pgDb.end();
    process.exit(0);
  }

  const rankedById = new Map(ranked.map(r => [r.identityId, r]));

  let awarded = 0;
  let skippedNoReward = 0;
  let skippedNoAlliance = 0;
  let skippedNoWallet = 0;

  console.log('\n--- Settlement Results ---\n');
  for (const row of unsettled) {
    const meta = rankedById.get(row.identity_id);
    const rank = row.rank;
    const basePts = getRewardPts(rank);
    if (basePts === 0) { skippedNoReward++; continue; }
    if (!meta) { skippedNoReward++; continue; }

    const idTag = `${row.identity_id.slice(-12)}`;

    if (!allianceSet.has(row.identity_id)) {
      skippedNoAlliance++;
      if (dryRun) console.log(`  #${rank} ${idTag} -> SKIP (no Alliance NFT)`);
      continue;
    }
    // Social account check removed per policy update (2026-04-27).
    // Alliance NFT remains the sole community-verification requirement.
    if (!meta.walletAddress) {
      // wallet_address is NOT NULL on activity_points; cannot insert without it.
      skippedNoWallet++;
      if (dryRun) console.log(`  #${rank} ${idTag} -> SKIP (no registered wallet)`);
      continue;
    }

    const isGP = meta.hasGenesisPass;
    const finalPts = isGP ? basePts * 2 : basePts;
    const digest = `bonus-ecosystem-weekly:${row.identity_id}:${weekId}`;

    if (dryRun) {
      const gpTag = isGP ? ' [GP 2x]' : '';
      console.log(`  #${rank} ${idTag} -> ${finalPts} pts${gpTag} (base: ${basePts})`);
      awarded++;
      continue;
    }

    try {
      await pgDb.begin(async (tx) => {
        const sql = tx as unknown as typeof pgDb;
        await sql`
          INSERT INTO activity_points
            (wallet_address, identity_id, tx_digest, category, activity_type,
             base_points, volume_tier, genesis_multiplier, final_points,
             tx_timestamp, event_seq, tx_sequence_number)
          VALUES
            (${meta.walletAddress}, ${row.identity_id}, ${digest},
             'ecosystem-bonus-leaderboard', ${'weekly-' + weekId},
             ${basePts}, 1.0, ${isGP ? 2.0 : 1.0}, ${finalPts.toFixed(2)},
             NOW()::timestamptz, 0, 0)
          ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
        `;
        await sql`
          UPDATE weekly_ecosystem_snapshots
          SET settled = 1
          WHERE week_id = ${weekId} AND identity_id = ${row.identity_id}
        `;
      });
      const gpTag = isGP ? ' [GP 2x]' : '';
      console.log(`  #${rank} ${idTag} -> ${finalPts} pts${gpTag}`);
      awarded++;
    } catch (err) {
      console.error(`  #${rank} ${idTag} ERROR:`, (err as Error).message);
    }
  }

  console.log('\n--- Summary ---');
  console.log(`  Awarded: ${awarded}`);
  console.log(`  Skipped (no Alliance NFT): ${skippedNoAlliance}`);
  console.log(`  Skipped (no registered wallet): ${skippedNoWallet}`);
  console.log(`  Skipped (rank > ${TOP_N} / no reward): ${skippedNoReward}`);

  await pgDb.end();
  console.log('\nDone.');
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\n[settle-ecosystem] FAILED: ${msg}`);
  process.exit(1);
});
