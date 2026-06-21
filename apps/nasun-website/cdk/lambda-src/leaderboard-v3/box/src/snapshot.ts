// Box port of the leaderboard-v3 generate-snapshot.ts daily snapshot generator (ENABLE_BATCH_DECAY=true
// prod path). Reuses the REAL score-calculator.ts (proven 99.93% in the parity harness) + reads the box
// lb_* mirror. Runs as a systemd timer (09:10 KST) at the Phase 3 cutover; until then the campaign is
// paused (no active season) so runLive() is a clean no-op.
//
// Three modes (snapshot-cli.ts): runLive (generate+write today's snapshot for the active season),
// runDryRun (compute+print, no write), runReproduce (recompute a past snapshot using its snapshotTime as
// the reference date and compare to the stored rows -- the validation path).
//
// Deliberately DROPPED vs the lambda (documented): the displayName-freshness refresh (cosmetic; reads
// UserProfiles + writes back to the source tables). The box cron uses the season-account displayName as
// mirrored; profile freshness is owned by the profile de-Lambda service post-cutover. This does NOT affect
// any score/rank field -- only the displayName string -- so scoring parity is unaffected.

import postgres from 'postgres';
import type { DailySnapshot, SeasonAccountScore, Season } from '../../src/types';
import { SCORE_CONSTANTS } from '../../src/types';
import {
  calculateDecayedRawScoreFromPosts,
  calculateConsistencyBonus,
  calculateDailyBaseScore,
} from '../../src/services/score-calculator';
import { calculateRankChange } from '../../src/utils/rank';
import { getTodayDateString, getYesterdayDateString } from '../../src/utils/date';
import * as db from './db';
import { PG, writeCred } from './config';

const SNAPSHOT_TTL_DAYS = 180;
const MAX_SNAPSHOT_ENTRIES = 2000;
const round3 = (x: number) => Math.round(x * 1000) / 1000;

type ScoredAccount = SeasonAccountScore & {
  userScore: number; rawScore: number; consistencyBonus: number; freshnessMultiplier: number; dailyBaseScoreTotal: number;
};

// Compute the ranked snapshot for a season (generate-snapshot.ts runSnapshotCore, batch-decay path).
// referenceDate drives freshness + the post boundary (undefined => now, for the live daily run).
export async function computeSnapshots(
  season: Season,
  todayDate: string,
  snapshotTime: string,
  referenceDate?: Date
): Promise<{ snapshots: DailySnapshot[]; filteredCount: number }> {
  const scores = await db.getSeasonAccountScores(season.seasonId);
  if (scores.length === 0) throw new Error('No accounts found for this season');

  const bannedIds = await db.getBannedAccountIds();
  const filteredScores = scores.filter((s) => s.username && !bannedIds.has(s.accountId));

  // Previous snapshot: rawScore monotonicity floor + dailyBaseScore accumulation + rank change.
  const yesterdayDate = getYesterdayDateString(todayDate);
  const { entries: prevEntries } = await db.getLatestSnapshot(season.seasonId, yesterdayDate);
  const prevFull = new Map<string, DailySnapshot>();
  const previousRanks = new Map<string, number>();
  for (const e of prevEntries) {
    prevFull.set(e.accountId, e);
    previousRanks.set(e.accountId, e.rank);
  }

  const refDate = referenceDate ?? new Date();
  const byAccount = await db.getPostsForDecay(season.seasonId, refDate.toISOString());

  const scored: ScoredAccount[] = filteredScores
    .map((score) => {
      const accountPosts = byAccount.get(score.accountId) || [];
      const decayedRawScore = calculateDecayedRawScoreFromPosts(accountPosts);
      const compressedRawScore = decayedRawScore > 0 ? Math.pow(decayedRawScore, SCORE_CONSTANTS.RAW_SCORE_EXPONENT) : 0;
      const prevEntry = prevFull.get(score.accountId);
      const rawScore = Math.max(compressedRawScore, prevEntry?.rawScore || 0);
      const consistencyBonus = calculateConsistencyBonus(Number(score.uniqueActiveDays) || 0);
      const dailyBaseScoreTotal = calculateDailyBaseScore({
        prevDailyBaseScoreTotal: prevEntry?.dailyBaseScoreTotal ?? 0,
        prevRank: prevEntry?.rank,
      });
      const daysSinceLastPost = Math.max(0, Math.floor((refDate.getTime() - new Date(score.lastSeenAt).getTime()) / (1000 * 60 * 60 * 24)));
      const effectiveDays = Math.max(0, daysSinceLastPost - SCORE_CONSTANTS.FRESHNESS_GRACE_DAYS);
      const freshnessMultiplier = 1 / (1 + effectiveDays / SCORE_CONSTANTS.FRESHNESS_HALF_LIFE_DAYS);
      const userScore = Math.max(0, rawScore * consistencyBonus * freshnessMultiplier) + dailyBaseScoreTotal + Number(score.adjustmentTotalScore || 0);
      return {
        ...score,
        rawScore: round3(rawScore),
        consistencyBonus: round3(consistencyBonus),
        freshnessMultiplier: round3(freshnessMultiplier),
        userScore: round3(userScore),
        dailyBaseScoreTotal,
      };
    })
    .sort((a, b) => b.userScore - a.userScore);

  const isFinalSnapshot = todayDate >= season.endDate;
  const ttl = isFinalSnapshot ? undefined : Math.floor(Date.now() / 1000) + SNAPSHOT_TTL_DAYS * 24 * 60 * 60;

  const snapshots: DailySnapshot[] = scored.slice(0, MAX_SNAPSHOT_ENTRIES).map((score, index) => {
    const rank = index + 1;
    const previousRank = previousRanks.get(score.accountId);
    const snapshot: DailySnapshot = {
      pk: `${season.seasonId}#${todayDate}`,
      sk: `RANK#${String(rank).padStart(4, '0')}`,
      accountId: score.accountId,
      username: score.username,
      originalUsername: score.originalUsername,
      platform: score.platform,
      userScore: score.userScore,
      rank,
      previousDayRank: previousRank,
      rankChange: calculateRankChange(rank, previousRank),
      totalPostScore: score.totalPostScore,
      postCount: score.postCount,
      uniqueActiveDays: score.uniqueActiveDays,
      rawScore: score.rawScore,
      consistencyBonus: score.consistencyBonus,
      freshnessMultiplier: score.freshnessMultiplier,
      dailyBaseScoreTotal: score.dailyBaseScoreTotal,
      displayName: score.displayName,
      profileImageUrl: score.profileImageUrl,
      isRegistered: score.isRegistered,
      isTelegramMember: score.isTelegramMember,
      snapshotDate: todayDate,
      snapshotTime,
    };
    if (ttl !== undefined) snapshot.ttl = ttl;
    return snapshot;
  });

  return { snapshots, filteredCount: filteredScores.length };
}

// ---- Write path (cutover-gated; needs the writer role) -------------------------------------------

let writeSql: ReturnType<typeof postgres> | null = null;
function getWriteSql() {
  if (writeSql) return writeSql;
  const cred = writeCred();
  if (!cred) throw new Error('writer credential not provisioned (LEADERBOARD_WRITE_PG_USER + LEADERBOARD_WRITE_PG_PASSWORD_FILE)');
  writeSql = postgres({
    host: PG.host, port: PG.port, database: PG.database, username: cred.user, password: cred.password,
    max: 2, idle_timeout: 20, connect_timeout: 15, prepare: false, onnotice: () => {},
    connection: { statement_timeout: 30000, lock_timeout: 8000, idle_in_transaction_session_timeout: 30000 },
  });
  return writeSql;
}

async function snapshotExistsForDate(seasonId: string, date: string): Promise<boolean> {
  const rows = await db.sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM lb_snapshots WHERE snapshot_key = ${`${seasonId}#${date}`}`;
  return (rows[0]?.n ?? 0) > 0;
}

// Write the snapshot rows + update season metadata, in one transaction. Idempotency is enforced by the
// caller (snapshotExistsForDate) AND by ON CONFLICT DO NOTHING on the (snapshot_key, sk) primary key. The
// attributes jsonb is the DailySnapshot minus the promoted pk/sk/ttl (Phase 1 mirror layout).
async function writeSnapshots(seasonId: string, todayDate: string, snapshots: DailySnapshot[], totalAccounts: number): Promise<void> {
  const w = getWriteSql();
  await w.begin(async (tx) => {
    // Restore the callable tagged-template typing (the lib's TransactionSql generic loses it).
    const q = tx as unknown as typeof w;
    for (const s of snapshots) {
      const { pk, sk, ttl, ...attrs } = s;
      const expiresAt = ttl !== undefined ? new Date(ttl * 1000).toISOString() : null;
      await q`
        INSERT INTO lb_snapshots (snapshot_key, sk, attributes, expires_at)
        VALUES (${pk}, ${sk}, ${q.json(attrs as never)}, ${expiresAt})
        ON CONFLICT (snapshot_key, sk) DO NOTHING`;
    }
    await q`
      UPDATE lb_seasons
      SET attributes = jsonb_set(jsonb_set(attributes, '{totalAccounts}', ${totalAccounts}::text::jsonb), '{updatedAt}', to_jsonb(now()::text))
      WHERE season_id = ${seasonId} AND sk = 'METADATA'`;
  });
  void todayDate;
}

// ---- Run modes -----------------------------------------------------------------------------------

// Daily live generation for the active season. Paused campaign => no active season => clean no-op (the
// cron must NOT error on a paused campaign, unlike the lambda which threw).
export async function runLive(): Promise<void> {
  const season = await db.getActiveSeason();
  if (!season) {
    console.log('[snapshot] no active season; skipping (campaign paused)');
    return;
  }
  const todayDate = getTodayDateString();
  if (await snapshotExistsForDate(season.seasonId, todayDate)) {
    console.log(`[snapshot] already exists for ${season.seasonId}#${todayDate}; skipping (idempotent)`);
    return;
  }
  const snapshotTime = new Date().toISOString();
  const { snapshots, filteredCount } = await computeSnapshots(season, todayDate, snapshotTime);
  await writeSnapshots(season.seasonId, todayDate, snapshots, filteredCount);
  console.log(`[snapshot] wrote ${snapshots.length} entries for ${season.seasonId}#${todayDate} (${filteredCount} accounts)`);
}

// Compute + print, no write. Uses the active season (or a customDate backfill date).
export async function runDryRun(customDate?: string): Promise<void> {
  const season = await db.getActiveSeason();
  if (!season) {
    console.log('[snapshot:dry] no active season');
    return;
  }
  const todayDate = customDate || getTodayDateString();
  const referenceDate = customDate ? new Date(`${customDate}T00:00:00+09:00`) : undefined;
  const snapshotTime = customDate ? new Date(`${customDate}T00:00:00+09:00`).toISOString() : new Date().toISOString();
  const { snapshots, filteredCount } = await computeSnapshots(season, todayDate, snapshotTime, referenceDate);
  console.log(`[snapshot:dry] ${season.seasonId}#${todayDate} accounts=${filteredCount} entries=${snapshots.length}`);
  console.log(JSON.stringify(snapshots.slice(0, 10).map((s) => ({ rank: s.rank, username: s.username, userScore: s.userScore, rawScore: s.rawScore })), null, 0));
}

// Reproduce a past snapshot (referenceDate = its snapshotTime) and compare to the stored rows. Validation
// path -- no write. Reports userScore/rank/rawScore/dailyBaseScore match rates.
export async function runReproduce(date: string): Promise<void> {
  // Accept either a full snapshot_key (SEASON1#2026-04-09) or a bare date (defaults to SEASON1).
  const seasonId = date.includes('#') ? date.split('#')[0] : 'SEASON1';
  const snapDate = date.includes('#') ? date.split('#')[1] : date;
  const seasonObj = await db.getSeasonById(seasonId);
  if (!seasonObj) throw new Error(`season ${seasonId} not found`);

  const stored = await db.querySnapshot(seasonId, snapDate);
  if (stored.length === 0) throw new Error(`no stored snapshot for ${seasonId}#${snapDate}`);
  const snapshotTime = stored[0].snapshotTime;
  const referenceDate = new Date(snapshotTime);

  const { snapshots } = await computeSnapshots(seasonObj, snapDate, snapshotTime, referenceDate);

  const storedByAcct = new Map(stored.map((s) => [s.accountId, s]));
  let compared = 0, scoreMatch = 0, rankMatch = 0, rawMatch = 0, dbsMatch = 0;
  const mism: object[] = [];
  snapshots.forEach((s) => {
    const ss = storedByAcct.get(s.accountId);
    if (!ss) return;
    compared++;
    if (Math.abs(ss.userScore - s.userScore) < 0.0005) scoreMatch++;
    else if (mism.length < 8) mism.push({ acct: s.accountId.slice(0, 8), computed: s.userScore, stored: ss.userScore, myRank: s.rank, storedRank: ss.rank });
    if (ss.rank === s.rank) rankMatch++;
    if (Math.abs((ss.rawScore || 0) - s.rawScore) < 0.0005) rawMatch++;
    if (Math.abs((ss.dailyBaseScoreTotal || 0) - (s.dailyBaseScoreTotal || 0)) < 0.0005) dbsMatch++;
  });
  const pct = (n: number) => ((100 * n) / compared).toFixed(2);
  console.log(JSON.stringify({
    snapshot: `${seasonId}#${snapDate}`, snapshotTime, reproduced: snapshots.length, stored: stored.length, compared,
    scoreMatchPct: pct(scoreMatch), rankMatchPct: pct(rankMatch), rawMatchPct: pct(rawMatch), dailyBaseMatchPct: pct(dbsMatch),
  }, null, 0));
  if (mism.length) console.log('mismatches:', JSON.stringify(mism));
}

export async function shutdown(): Promise<void> {
  await db.sql.end({ timeout: 5 }).catch(() => {});
  if (writeSql) await writeSql.end({ timeout: 5 }).catch(() => {});
}
