/**
 * Pado Weekly Leaderboard -> Ecosystem Points Settlement Script
 *
 * Fetches the weekly score snapshot from chat-server's internal API,
 * awards ranked Ecosystem Points, and records settlement state in PostgreSQL.
 *
 * All state (weekly_score_snapshots + activity_points) lives in the same
 * PostgreSQL DB (nasun_points), enabling fully atomic settlement per trader.
 *
 * Reward table (rank-based, Genesis Pass holders receive 2x at settlement):
 *   Rank 1:       50 pts
 *   Rank 2:       40 pts
 *   Rank 3:       30 pts
 *   Rank 4-50:    15 pts
 *   Rank 51-100:  10 pts
 *   Rank 101-200:  6 pts
 *   Rank 201-300:  5 pts
 *   Rank 301-400:  2 pts
 *   Rank 401-500:  1 pt
 *
 * Safety:
 *   - chat-server API refuses requests for the current (in-progress) week.
 *   - Each award uses ON CONFLICT DO NOTHING (idempotent re-runs).
 *   - weekly_score_snapshots.settled flag is set in the same PG transaction.
 *   - Traders without an identityId are skipped.
 *   - Traders without an active Alliance NFT are skipped.
 *   - Traders without at least one social account (Twitter/Google/Telegram) are skipped.
 *
 * Usage:
 *   cd ~/explorer-api && set -a && source .env && set +a
 *   npx tsx src/scripts/settle-pado.ts --week 2026-W17
 *   npx tsx src/scripts/settle-pado.ts --week 2026-W17 --dry-run
 *   npx tsx src/scripts/settle-pado.ts --week auto        # auto-detect last completed week
 */

import postgres from 'postgres';

// ===== Config =====

const POINTS_DB_URL = process.env.POINTS_DATABASE_URL;
const CHAT_SERVER_URL = process.env.CHAT_SERVER_URL;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const ECOSYSTEM_ACTIVATIONS_URL = process.env.ECOSYSTEM_ACTIVATIONS_URL;
const ECOSYSTEM_ACTIVATIONS_API_KEY = process.env.ECOSYSTEM_ACTIVATIONS_API_KEY || '';

if (!POINTS_DB_URL) {
  console.error('POINTS_DATABASE_URL not set');
  process.exit(1);
}
if (!CHAT_SERVER_URL) {
  console.error('CHAT_SERVER_URL not set (e.g. http://43.200.67.52:3101)');
  process.exit(1);
}
if (!INTERNAL_API_KEY) {
  console.error('INTERNAL_API_KEY not set');
  process.exit(1);
}
if (!ECOSYSTEM_ACTIVATIONS_URL) {
  console.error('ECOSYSTEM_ACTIVATIONS_URL not set');
  process.exit(1);
}

// ===== Reward table =====

const REWARD_TABLE: Array<{ maxRank: number; pts: number }> = [
  { maxRank: 1,   pts: 50 },
  { maxRank: 2,   pts: 40 },
  { maxRank: 3,   pts: 30 },
  { maxRank: 50,  pts: 15 },
  { maxRank: 100, pts: 10 },
  { maxRank: 200, pts: 6  },
  { maxRank: 300, pts: 5  },
  { maxRank: 400, pts: 2  },
  { maxRank: 500, pts: 1  },
];

function getRewardPts(rank: number): number {
  for (const tier of REWARD_TABLE) {
    if (rank <= tier.maxRank) return tier.pts;
  }
  return 0;
}

// ===== ISO week helpers =====

function getISOWeek(date: Date): { year: number; week: number } {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

function getPreviousWeekId(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 7);
  const { year, week } = getISOWeek(d);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

// ===== Args =====

const args = process.argv.slice(2);

function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : undefined;
}

const weekArg = getArg('week') || 'auto';
const dryRun = args.includes('--dry-run');

// ===== Types =====

interface WeeklyTrader {
  rank: number;
  address: string;
  identityId: string | null;
  hasGenesisPass: boolean;
  hasSocialAccount: boolean;
  totalScore: number;
}

interface WeeklyScoresResponse {
  weekId: string;
  traders: WeeklyTrader[];
  totalTraders: number;
  generatedAt: number;
}

// ===== Ecosystem activations fetch =====

async function fetchActivationsPayload(): Promise<{
  activations: Record<string, Array<{ nftType: string; nftCount: number }>>;
}> {
  const headers: Record<string, string> = {};
  if (ECOSYSTEM_ACTIVATIONS_API_KEY) headers['x-api-key'] = ECOSYSTEM_ACTIVATIONS_API_KEY;

  const res = await fetch(ECOSYSTEM_ACTIVATIONS_URL!, {
    headers,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Ecosystem activations API error: ${res.status}`);

  const data = await res.json() as
    | { activations: Record<string, Array<{ nftType: string; nftCount: number }>> }
    | { url: string };

  // Handle S3 presigned offload (same pattern as ecosystem-cache.ts).
  if ('url' in data) {
    const s3Res = await fetch(data.url, { signal: AbortSignal.timeout(60_000) });
    if (!s3Res.ok) throw new Error(`Ecosystem activations S3 offload error: ${s3Res.status}`);
    return s3Res.json() as Promise<{ activations: Record<string, Array<{ nftType: string; nftCount: number }>> }>;
  }

  return data;
}

async function fetchAllianceSet(): Promise<Set<string>> {
  const payload = await fetchActivationsPayload();

  const allianceSet = new Set<string>();
  for (const [identityId, activations] of Object.entries(payload.activations)) {
    if (activations.some((a) => a.nftType === 'alliance')) {
      allianceSet.add(identityId);
    }
  }
  return allianceSet;
}

// ===== API fetch =====

async function fetchWeeklyScores(weekId: string): Promise<WeeklyScoresResponse> {
  const url = `${CHAT_SERVER_URL}/api/pado/internal/weekly-scores/${weekId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${INTERNAL_API_KEY}` },
    signal: AbortSignal.timeout(30_000),
  });

  if (res.status === 403) {
    const body = await res.json() as { error: string; message?: string };
    throw new Error(`Chat-server refused: ${body.message ?? body.error}`);
  }
  if (!res.ok) {
    throw new Error(`Chat-server API error: ${res.status}`);
  }

  return res.json() as Promise<WeeklyScoresResponse>;
}

// ===== Main =====

async function main() {
  // Resolve week
  let weekId: string;
  if (weekArg === 'auto') {
    weekId = getPreviousWeekId();
    console.log(`[settle-pado] Auto-detected week: ${weekId}`);
  } else {
    weekId = weekArg;
  }

  if (!/^\d{4}-W\d{2}$/.test(weekId)) {
    console.error(`Invalid week format: ${weekId} (expected YYYY-Www e.g. 2026-W17)`);
    process.exit(1);
  }

  console.log(`\n=== Pado Weekly Settlement ${weekId} (${dryRun ? 'DRY RUN' : 'LIVE'}) ===\n`);

  // 1. Fetch Alliance NFT set from ecosystem API
  console.log('Fetching Alliance NFT activations...');
  const allianceSet = await fetchAllianceSet();
  console.log(`  ${allianceSet.size} identities with active Alliance NFT`);

  if (allianceSet.size === 0) {
    console.error('ABORT: Alliance NFT set is empty. API may be unavailable or returned no data.');
    process.exit(1);
  }

  // 2. Fetch weekly scores from chat-server (includes hasSocialAccount)
  console.log('Fetching weekly scores from chat-server...');
  const data = await fetchWeeklyScores(weekId);
  console.log(`  ${data.traders.length} traders in week ${weekId}`);

  if (data.traders.length === 0) {
    console.log('No traders found for this week. Has aggregation run?');
    process.exit(0);
  }

  // 3. Connect to PostgreSQL
  const pgDb = postgres(POINTS_DB_URL!, { max: 3, idle_timeout: 30, connect_timeout: 10 });

  // 4. Ensure weekly_score_snapshots table exists (idempotent DDL)
  await pgDb`
    CREATE TABLE IF NOT EXISTS weekly_score_snapshots (
      week_id     TEXT NOT NULL,
      address     TEXT NOT NULL,
      total_score INTEGER NOT NULL,
      rank        INTEGER NOT NULL,
      settled     INTEGER NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (week_id, address)
    )
  `;
  await pgDb`
    CREATE INDEX IF NOT EXISTS idx_wss_unsettled
      ON weekly_score_snapshots (week_id, settled)
  `;

  // 5. Upsert snapshot rows (idempotent: existing rows are not overwritten)
  console.log('\nUpserting snapshot rows...');
  for (const trader of data.traders) {
    await pgDb`
      INSERT INTO weekly_score_snapshots (week_id, address, total_score, rank, settled)
      VALUES (${weekId}, ${trader.address}, ${trader.totalScore}, ${trader.rank}, 0)
      ON CONFLICT (week_id, address) DO NOTHING
    `;
  }

  // 6. Fetch unsettled rows (re-runnable: skip already-settled)
  const unsettled = await pgDb<Array<{ address: string; rank: number; total_score: number }>>`
    SELECT address, rank, total_score
    FROM weekly_score_snapshots
    WHERE week_id = ${weekId} AND settled = 0
    ORDER BY rank ASC
  `;
  console.log(`  ${unsettled.length} unsettled traders`);

  if (unsettled.length === 0) {
    console.log('All traders already settled for this week. Exiting.');
    await pgDb.end();
    process.exit(0);
  }

  // Build lookup from address -> trader data (from chat-server response)
  const traderMap = new Map<string, WeeklyTrader>(
    data.traders.map((t) => [t.address.toLowerCase(), t])
  );

  // 7. Settle each trader
  let awarded = 0;
  let skippedUnregistered = 0;
  let skippedNoReward = 0;
  let skippedNoAlliance = 0;
  let skippedNoSocial = 0;

  console.log('\n--- Settlement Results ---\n');

  for (const row of unsettled) {
    const addr = row.address.toLowerCase();
    const rank = row.rank;
    const basePts = getRewardPts(rank);

    if (basePts === 0) {
      skippedNoReward++;
      continue;
    }

    const trader = traderMap.get(addr);
    const identityId = trader?.identityId ?? null;

    if (!identityId) {
      skippedUnregistered++;
      if (dryRun) {
        console.log(`  #${rank} ${addr.slice(0, 10)}... -> SKIP (not registered)`);
      }
      continue;
    }

    if (!allianceSet.has(identityId)) {
      skippedNoAlliance++;
      if (dryRun) {
        console.log(`  #${rank} ${addr.slice(0, 10)}... -> SKIP (no Alliance NFT)`);
      }
      continue;
    }

    if (!trader?.hasSocialAccount) {
      skippedNoSocial++;
      if (dryRun) {
        console.log(`  #${rank} ${addr.slice(0, 10)}... -> SKIP (no social account)`);
      }
      continue;
    }

    const isGP = trader.hasGenesisPass;
    const finalPts = isGP ? basePts * 2 : basePts;
    const digest = `bonus-pado-weekly:${identityId}:${weekId}`;

    if (dryRun) {
      const gpTag = isGP ? ' [GP 2x]' : '';
      console.log(`  #${rank} ${addr.slice(0, 10)}... -> ${finalPts} pts${gpTag} (base: ${basePts}) [alliance+social OK]`);
      awarded++;
      continue;
    }

    // Atomic: INSERT activity_points + UPDATE settled in one PG transaction.
    // ON CONFLICT DO NOTHING ensures idempotency on re-runs.
    try {
      await pgDb.begin(async (tx) => {
        const sql = tx as unknown as typeof pgDb;
        await sql`
          INSERT INTO activity_points
            (wallet_address, identity_id, tx_digest, category, activity_type,
             base_points, volume_tier, genesis_multiplier, final_points,
             tx_timestamp, event_seq, tx_sequence_number)
          VALUES
            (${addr}, ${identityId}, ${digest}, 'ecosystem-bonus-pado', ${'weekly-' + weekId},
             ${basePts}, 1.0, ${isGP ? 2.0 : 1.0}, ${finalPts.toFixed(2)},
             NOW()::timestamptz, 0, 0)
          ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
        `;

        await sql`
          UPDATE weekly_score_snapshots
          SET settled = 1
          WHERE week_id = ${weekId} AND address = ${row.address}
        `;
      });

      const gpTag = isGP ? ' [GP 2x]' : '';
      console.log(`  #${rank} ${addr.slice(0, 10)}... -> ${finalPts} pts${gpTag}`);
      awarded++;
    } catch (err) {
      console.error(`  #${rank} ${addr.slice(0, 10)}... ERROR:`, (err as Error).message);
    }
  }

  console.log('\n--- Summary ---');
  console.log(`  Awarded: ${awarded}`);
  console.log(`  Skipped (unregistered): ${skippedUnregistered}`);
  console.log(`  Skipped (no Alliance NFT): ${skippedNoAlliance}`);
  console.log(`  Skipped (no social account): ${skippedNoSocial}`);
  console.log(`  Skipped (rank > 500): ${skippedNoReward}`);

  await pgDb.end();
  console.log('\nDone.');
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\n[settle-pado] FAILED: ${msg}`);
  process.exit(1);
});
