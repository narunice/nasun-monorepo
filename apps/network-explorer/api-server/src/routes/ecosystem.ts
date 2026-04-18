/**
 * Ecosystem Score & Leaderboard Routes
 *
 * Routes:
 *   GET /score/:identityId       - User's ecosystem score with multiplier
 *   GET /leaderboard             - Ecosystem leaderboard (daily/weekly)
 *   GET /health                  - Matview + cache health
 */

import { Hono } from 'hono';
import { pointsDb } from '../db.js';
import { cached } from '../cache.js';
import {
  getActivationsForUser,
  getActivationsCacheMap,
  getMatviewStatus,
  updateActivationsForUser,
} from '../scanner/ecosystem-cache.js';
import { getActivationBonus, calculateMultiplier } from '../config/ecosystem.js';
import { REFERRAL_ECOSYSTEM_SCALING_FACTOR } from '../config/referral.js';

// Grace period before alliance penalty takes effect (days after NFT first activation)
const ALLIANCE_PENALTY_GRACE_DAYS = 7;
import { STAKING_V2_CUTOFF_DATE } from '../config/points.js';
import { getIdentityByWallet } from '../scanner/points-scanner.js';

const app = new Hono();

const roundTo2 = (n: number) => parseFloat(n.toFixed(2));

const ALLOWED_LIMITS = [25, 50, 100, 200] as const;
const MAX_OFFSET = 10000;

// Cognito identityId format: region:uuid
const IDENTITY_ID_PATTERN = /^[\w-]+:[\w-]{36}$/;

// Must match the allowlist in index.ts. Used for explicit CORS on redirect responses
// (nginx/CloudFront may strip middleware-set CORS headers on 302).
const CORS_ALLOWED_ORIGINS = new Set([
  'https://explorer.nasun.io',
  'https://nasun.io',
  'https://staging.nasun.io',
  'https://pado.finance',
  'https://staging.pado.finance',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:4173',
]);

function parseLimit(raw: string | undefined): number {
  const n = Number(raw ?? 50);
  if (Number.isNaN(n) || n < 1) return 50;
  return ALLOWED_LIMITS.reduce((prev, curr) =>
    Math.abs(curr - n) < Math.abs(prev - n) ? curr : prev,
  );
}

function parseOffset(raw: string | undefined): number {
  const n = Number(raw ?? 0);
  if (Number.isNaN(n) || n < 0) return 0;
  return Math.min(Math.floor(n), MAX_OFFSET);
}

// GET /api/v1/ecosystem/score/:identityId
app.get('/score/:identityId', async (c) => {
  if (!pointsDb) {
    return c.json({ error: 'points_not_configured' }, 503);
  }

  const identityId = c.req.param('identityId');
  if (!identityId || !IDENTITY_ID_PATTERN.test(identityId)) {
    return c.json({ error: 'invalid_identity_id' }, 400);
  }

  const getData = cached(
    `eco-score-${identityId}`,
    30 * 1000,
    async () => {
      const [
        todayRow, weeklyRow, allTimeRow, snapshotSumRow, unsnapshottedRow,
        bonusRow, bonusTodayRow, bonusWeeklyRow, bonusCategoryRows,
        govAllTimeRow, govTodayRow, govWeeklyRow,
        refAllTimeRow, refTodayRow, refWeeklyRow,
        todayCategoryRows,
        stakingTodayRow, stakingWeeklyRow, stakingAllTimeRow,
        weeklySnapshotSumRow,
      ] = await Promise.all([
        pointsDb!`
          SELECT base_score::int as base_score
          FROM ecosystem_daily_scores
          WHERE identity_id = ${identityId}
            AND day = CURRENT_DATE
        `.then(r => r[0]),
        pointsDb!`
          SELECT COALESCE(SUM(base_score), 0)::int as base_score,
                 COUNT(*)::int as active_days
          FROM ecosystem_daily_scores
          WHERE identity_id = ${identityId}
            AND day >= CURRENT_DATE - INTERVAL '6 days'
            AND day <= CURRENT_DATE
        `.then(r => r[0]),
        pointsDb!`
          SELECT COALESCE(SUM(base_score), 0)::int as base_score,
                 COUNT(*)::int as active_days
          FROM ecosystem_daily_scores
          WHERE identity_id = ${identityId}
        `.then(r => r[0]),
        // Sum of base contributions from past snapshots (base_score * multiplier per day)
        // Bonus/gov/referral are queried directly from activity_points (not from snapshots)
        pointsDb!`
          SELECT COALESCE(SUM(base_score * multiplier), 0)::numeric as base_cumulative
          FROM ecosystem_score_snapshots
          WHERE identity_id = ${identityId}
        `.then(r => r[0]),
        // Yesterday's base score if snapshot hasn't been created yet
        // (covers the ~5min gap between UTC midnight and snapshot creation)
        pointsDb!`
          SELECT COALESCE(d.base_score, 0)::int as base_score
          FROM ecosystem_daily_scores d
          WHERE d.identity_id = ${identityId}
            AND d.day = CURRENT_DATE - 1
            AND NOT EXISTS (
              SELECT 1 FROM ecosystem_score_snapshots s
              WHERE s.identity_id = ${identityId} AND s.snapshot_date = CURRENT_DATE - 1
            )
        `.then(r => r[0]),
        // bonus_total: synthetic INCLUDED intentionally — allTime must reflect
        // the user-visible score including restoration rows (never-reduce-score principle).
        // See fc4b0e72 recovery plan (v10) and scripts/restore-staking-recovery.sql.
        pointsDb!`
          SELECT COALESCE(SUM(final_points), 0)::numeric as bonus_total
          FROM activity_points
          WHERE identity_id = ${identityId}
            AND category LIKE 'ecosystem-bonus-%'
            AND NOT flagged
        `.then(r => r[0]),
        pointsDb!`
          SELECT COALESCE(SUM(final_points), 0)::numeric as bonus_today
          FROM activity_points
          WHERE identity_id = ${identityId}
            AND category LIKE 'ecosystem-bonus-%'
            AND (metadata->>'synthetic') IS DISTINCT FROM 'true'
            AND NOT flagged
            AND tx_timestamp >= CURRENT_DATE AT TIME ZONE 'UTC'
            AND tx_timestamp < (CURRENT_DATE + interval '1 day') AT TIME ZONE 'UTC'
        `.then(r => r[0]),
        pointsDb!`
          SELECT COALESCE(SUM(final_points), 0)::numeric as bonus_weekly
          FROM activity_points
          WHERE identity_id = ${identityId}
            AND category LIKE 'ecosystem-bonus-%'
            AND (metadata->>'synthetic') IS DISTINCT FROM 'true'
            AND NOT flagged
            AND tx_timestamp >= (CURRENT_DATE - 6) AT TIME ZONE 'UTC'
        `.then(r => r[0]),
        // Category breakdown for composition bar (bonus + governance + referral)
        // synthetic rows (e.g., restoration) excluded to avoid exposing internal categories in UI
        pointsDb!`
          SELECT category, COALESCE(SUM(final_points), 0)::numeric as points
          FROM activity_points
          WHERE identity_id = ${identityId}
            AND NOT flagged
            AND (metadata->>'synthetic') IS DISTINCT FROM 'true'
            AND (
              category LIKE 'ecosystem-bonus-%'
              OR category IN ('governance', 'referral-bonus')
            )
          GROUP BY category
          ORDER BY points DESC
        `,
        // Governance points (allTime / today / weekly)
        pointsDb!`
          SELECT COALESCE(SUM(final_points), 0)::numeric as gov_total
          FROM activity_points
          WHERE identity_id = ${identityId}
            AND category = 'governance'
            AND NOT flagged
        `.then(r => r[0]),
        pointsDb!`
          SELECT COALESCE(SUM(final_points), 0)::numeric as gov_today
          FROM activity_points
          WHERE identity_id = ${identityId}
            AND category = 'governance'
            AND NOT flagged
            AND tx_timestamp >= CURRENT_DATE AT TIME ZONE 'UTC'
            AND tx_timestamp < (CURRENT_DATE + interval '1 day') AT TIME ZONE 'UTC'
        `.then(r => r[0]),
        pointsDb!`
          SELECT COALESCE(SUM(final_points), 0)::numeric as gov_weekly
          FROM activity_points
          WHERE identity_id = ${identityId}
            AND category = 'governance'
            AND NOT flagged
            AND tx_timestamp >= (CURRENT_DATE - 6) AT TIME ZONE 'UTC'
        `.then(r => r[0]),
        // Referral bonus (separate from ecosystem-bonus, scaled independently)
        pointsDb!`
          SELECT COALESCE(SUM(final_points), 0)::numeric as referral_total
          FROM activity_points
          WHERE identity_id = ${identityId}
            AND category = 'referral-bonus'
            AND NOT flagged
        `.then(r => r[0]),
        pointsDb!`
          SELECT COALESCE(SUM(final_points), 0)::numeric as referral_today
          FROM activity_points
          WHERE identity_id = ${identityId}
            AND category = 'referral-bonus'
            AND NOT flagged
            AND tx_timestamp >= CURRENT_DATE AT TIME ZONE 'UTC'
            AND tx_timestamp < (CURRENT_DATE + interval '1 day') AT TIME ZONE 'UTC'
        `.then(r => r[0]),
        pointsDb!`
          SELECT COALESCE(SUM(final_points), 0)::numeric as referral_weekly
          FROM activity_points
          WHERE identity_id = ${identityId}
            AND category = 'referral-bonus'
            AND NOT flagged
            AND tx_timestamp >= (CURRENT_DATE - 6) AT TIME ZONE 'UTC'
        `.then(r => r[0]),
        // Today's distinct base categories (for daily mission checklist)
        pointsDb!`
          SELECT DISTINCT category
          FROM activity_points
          WHERE identity_id = ${identityId}
            AND tx_timestamp >= CURRENT_DATE AT TIME ZONE 'UTC'
            AND tx_timestamp < (CURRENT_DATE + interval '1 day') AT TIME ZONE 'UTC'
            AND base_points > 0
            AND NOT flagged
            AND category NOT IN ('referral-bonus', 'daily-mission', 'ecosystem-passive', 'staking-daily', 'staking')
            AND category NOT LIKE 'ecosystem-bonus-%'
        `.then(rows => rows.map((r: any) => r.category as string)),
        // Staking-v2: tier-based stake_score, post-cutoff only (forward-only).
        // staking-daily row stores tier pts in base_points (v2 scanner).
        pointsDb!`
          SELECT COALESCE(SUM(base_points), 0)::int as staking_score
          FROM activity_points
          WHERE identity_id = ${identityId}
            AND category = 'staking-daily'
            AND NOT flagged
            AND tx_timestamp >= ${STAKING_V2_CUTOFF_DATE}::timestamptz
            AND tx_timestamp >= CURRENT_DATE AT TIME ZONE 'UTC'
            AND tx_timestamp < (CURRENT_DATE + interval '1 day') AT TIME ZONE 'UTC'
        `.then(r => r[0]),
        pointsDb!`
          SELECT COALESCE(SUM(base_points), 0)::int as staking_score
          FROM activity_points
          WHERE identity_id = ${identityId}
            AND category = 'staking-daily'
            AND NOT flagged
            AND tx_timestamp >= ${STAKING_V2_CUTOFF_DATE}::timestamptz
            AND tx_timestamp >= (CURRENT_DATE - 6) AT TIME ZONE 'UTC'
        `.then(r => r[0]),
        pointsDb!`
          SELECT COALESCE(SUM(base_points), 0)::int as staking_score
          FROM activity_points
          WHERE identity_id = ${identityId}
            AND category = 'staking-daily'
            AND NOT flagged
            AND tx_timestamp >= ${STAKING_V2_CUTOFF_DATE}::timestamptz
        `.then(r => r[0]),
        // Sum of base contributions from the past 6 days of snapshots
        pointsDb!`
          SELECT COALESCE(SUM(base_score * multiplier), 0)::numeric as weekly_snapshot_cumulative
          FROM ecosystem_score_snapshots
          WHERE identity_id = ${identityId}
            AND snapshot_date >= CURRENT_DATE - INTERVAL '6 days'
            AND snapshot_date < CURRENT_DATE
        `.then(r => r[0]),
      ]);

      // NFT activations: try cache first, auto-sync on miss
      let activations = getActivationsForUser(identityId);
      if (activations.length === 0) {
        const synced = await updateActivationsForUser(identityId);
        if (synced && synced.length > 0) {
          activations = synced;
        }
      }
      const hasAlliance = activations.some(a => a.nftType === 'alliance');
      const hasGenesis = activations.some(a => a.nftType === 'genesis-pass');

      let isPenalized = false;
      if (hasAlliance && !hasGenesis) {
        const [penalty] = await pointsDb!`
          SELECT 1 FROM alliance_penalties ap
          JOIN alliance_first_seen afs ON ap.identity_id = afs.identity_id
          WHERE ap.identity_id = ${identityId}
            AND afs.first_seen <= CURRENT_DATE - make_interval(days => ${ALLIANCE_PENALTY_GRACE_DAYS})
        `;
        if (penalty) isPenalized = true;
      }

      const effectiveActivations = isPenalized
        ? activations.filter(a => a.nftType !== 'alliance')
        : activations;
      const multiplier = calculateMultiplier(effectiveActivations);

      const bonusTotal = parseFloat(bonusRow?.bonus_total ?? '0');
      const bonusToday = parseFloat(bonusTodayRow?.bonus_today ?? '0');
      const bonusWeekly = parseFloat(bonusWeeklyRow?.bonus_weekly ?? '0');
      const baseCumulative = parseFloat(snapshotSumRow?.base_cumulative ?? '0');

      const govTotal = parseFloat(govAllTimeRow?.gov_total ?? '0');
      const govToday = parseFloat(govTodayRow?.gov_today ?? '0');
      const govWeekly = parseFloat(govWeeklyRow?.gov_weekly ?? '0');

      const refTotal = parseFloat(refAllTimeRow?.referral_total ?? '0');
      const refToday = parseFloat(refTodayRow?.referral_today ?? '0');
      const refWeekly = parseFloat(refWeeklyRow?.referral_weekly ?? '0');
      const scalingFactor = REFERRAL_ECOSYSTEM_SCALING_FACTOR;

      // Staking-v2 score (pre-cutoff always zero, monotonic-increase-safe).
      const stakingToday = stakingTodayRow?.staking_score ?? 0;
      const stakingWeekly = stakingWeeklyRow?.staking_score ?? 0;
      const stakingAllTime = stakingAllTimeRow?.staking_score ?? 0;

      // allTime = SUM(base*mult from past snapshots)
      //         + yesterday's base*mult if snapshot not yet created (midnight gap)
      //         + today's base*mult
      //         + allTime staking*mult (v2: tier pts, post-cutoff only)
      //         + allTime bonus + allTime governance + allTime referral*sf
      // Staking uses current multiplier across all days (same approximation as weekly).
      // No compounding: bonus/gov/referral are from activity_points (raw totals)
      const todayBase = todayRow?.base_score ?? 0;
      const unsnapshottedBase = unsnapshottedRow?.base_score ?? 0;
      const todayBaseContribution = (todayBase + unsnapshottedBase) * multiplier;
      const totalBasePoints = baseCumulative + todayBaseContribution;
      const stakingAllTimeContribution = stakingAllTime * multiplier;
      const allTimeCumulative = totalBasePoints + stakingAllTimeContribution
        + bonusTotal + govTotal + refTotal * scalingFactor;

      // Score breakdown for composition bar (base included, no reverse calculation)
      const nonBaseCategories = bonusCategoryRows.map((r: any) => ({
        category: r.category as string,
        points: parseFloat(r.points ?? '0'),
      }));
      // Apply scaling factor to referral-bonus in the breakdown
      const scoreBreakdown = [
        { category: 'base', points: totalBasePoints },
        ...nonBaseCategories.map(c =>
          c.category === 'referral-bonus'
            ? { ...c, points: c.points * scalingFactor }
            : c,
        ),
      ].filter(c => c.points > 0);

      return {
        todayBaseScore: todayBase,
        weeklyBaseScore: weeklyRow?.base_score ?? 0,
        weeklyActiveDays: weeklyRow?.active_days ?? 0,
        weeklySnapshotCumulative: parseFloat(weeklySnapshotSumRow?.weekly_snapshot_cumulative ?? '0'),
        allTimeBaseScore: allTimeRow?.base_score ?? 0,
        allTimeActiveDays: allTimeRow?.active_days ?? 0,
        allTimeCumulative,
        bonusTotal,
        bonusToday,
        bonusWeekly,
        bonusCategories: nonBaseCategories,
        scoreBreakdown,
        govTotal,
        govToday,
        govWeekly,
        refTotal,
        refToday,
        refWeekly,
        scalingFactor,
        multiplier,
        activations,
        isPenalized,
        todayCategories: todayCategoryRows,
        stakingToday,
        stakingWeekly,
        stakingAllTime,
      };
    },
  );

  const scores = await getData();

  // disabled = no active NFT at all (not penalized with alliance)
  const disabled = !scores.isPenalized && scores.multiplier === 0;

  const bt = scores.bonusTotal;

  const sf = scores.scalingFactor;
  const data = {
    identityId,
    multiplier: roundTo2(scores.multiplier),
    disabled,
    isPenalized: scores.isPenalized,
    bonusTotal: roundTo2(bt),
    referralBonus: roundTo2(scores.refTotal),
    referralScalingFactor: sf,
    activations: scores.activations.map((a) => ({
      nftType: a.nftType,
      nftCount: a.nftCount,
      bonus: roundTo2(getActivationBonus(a)),
    })),
    todayCategories: scores.todayCategories,
    daily: {
      baseScore: scores.todayBaseScore,
      stakingScore: scores.stakingToday,
      bonusTotal: roundTo2(scores.bonusToday),
      referralBonus: roundTo2(scores.refToday),
      governancePoints: roundTo2(scores.govToday),
      ecosystemScore: roundTo2(
        (scores.todayBaseScore + scores.stakingToday) * scores.multiplier
          + scores.bonusToday + scores.govToday + scores.refToday * sf,
      ),
    },
    weekly: {
      baseScore: scores.weeklyBaseScore,
      stakingScore: scores.stakingWeekly,
      bonusTotal: roundTo2(scores.bonusWeekly),
      referralBonus: roundTo2(scores.refWeekly),
      governancePoints: roundTo2(scores.govWeekly),
      // Fix: (Historical snapshots for past 6 days) + (Today contribution with current multiplier)
      // prevents UI drift when a multiplier (e.g. Genesis Pass) is upgraded mid-week.
      ecosystemScore: roundTo2(
        scores.weeklySnapshotCumulative
          + (scores.todayBaseScore + scores.stakingToday) * scores.multiplier
          + scores.bonusWeekly + scores.govWeekly + scores.refWeekly * sf,
      ),
      activeDays: scores.weeklyActiveDays,
    },
    allTime: {
      baseScore: scores.allTimeBaseScore,
      stakingScore: scores.stakingAllTime,
      bonusTotal: roundTo2(bt),
      referralBonus: roundTo2(scores.refTotal),
      governancePoints: roundTo2(scores.govTotal),
      ecosystemScore: roundTo2(scores.allTimeCumulative),
      activeDays: scores.allTimeActiveDays,
      bonusCategories: scores.bonusCategories.filter((c: any) => c.points > 0),
      scoreBreakdown: scores.scoreBreakdown.map((c: any) => ({
        category: c.category,
        points: roundTo2(c.points),
      })),
    },
  };

  c.header('Cache-Control', 'public, max-age=30');
  return c.json({ data });
});

// --- Weekly leaderboard helpers ---
// ISO 8601 Thursday-anchor week ID (e.g. "2026-W17").
// Mirrors the algorithm used in chat-server/leaderboard-store.ts.
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

// Monday 00:10 UTC is the canonical week reset boundary (matches Pado Score Leaderboard).
// Returns { start, end } as Date objects for use as SQL parameters.
function getWeekBounds(weekId: string): { start: Date; end: Date } | null {
  const match = weekId.match(/^(\d{4})-W(\d{2})$/);
  if (!match) return null;
  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);
  if (week < 1 || week > 53) return null;

  // Find the Monday of ISO week: Jan 4 is always in week 1.
  // Approach: compute Jan 4 of the ISO year, go to its Monday, then add (week-1)*7 days.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // Mon=1..Sun=7
  const week1Monday = new Date(jan4.getTime() - (jan4Day - 1) * 86_400_000);
  const weekMonday = new Date(week1Monday.getTime() + (week - 1) * 7 * 86_400_000);

  // Offset by 10 minutes to match Pado reset boundary
  const start = new Date(weekMonday.getTime() + 10 * 60 * 1000);
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { start, end };
}

// Earliest allowed week (floor for /leaderboard/weeks list).
// Prevents stale test/staging data from inflating the week list.
const ECOSYSTEM_LEADERBOARD_FLOOR_DATE = new Date('2025-01-01T00:00:00Z');

// GET /api/v1/ecosystem/leaderboard/weeks
// Returns available week IDs in descending order (current week first).
app.get('/leaderboard/weeks', async (c) => {
  if (!pointsDb) return c.json({ error: 'points_not_configured' }, 503);

  const getWeeks = cached('eco-leaderboard-weeks', 60 * 60 * 1000, async () => {
    const [minRow] = await pointsDb!`
      SELECT MIN(tx_timestamp) as min_ts FROM activity_points
      WHERE identity_id IS NOT NULL AND NOT flagged
    `;
    const rawMin = minRow?.min_ts as Date | null;
    const flooredMin = rawMin && rawMin > ECOSYSTEM_LEADERBOARD_FLOOR_DATE
      ? rawMin
      : ECOSYSTEM_LEADERBOARD_FLOOR_DATE;

    const currentWeekId = getCurrentWeekId();
    const weeks: Array<{ weekId: string; label: string }> = [];
    let cursor = new Date();
    const seen = new Set<string>();

    while (true) {
      const { year, week } = getISOWeek(cursor);
      const wId = `${year}-W${String(week).padStart(2, '0')}`;
      if (seen.has(wId)) break;
      seen.add(wId);

      const bounds = getWeekBounds(wId);
      if (!bounds || bounds.start < flooredMin) break;

      const mon = new Date(bounds.start.getTime() - 10 * 60 * 1000); // strip 10min offset for label
      const sun = new Date(mon.getTime() + 6 * 24 * 60 * 60 * 1000);
      const fmt = (d: Date) =>
        d.toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      const label = wId === currentWeekId
        ? `${wId} (current)`
        : `${wId} (${fmt(mon)} - ${fmt(sun)})`;

      weeks.push({ weekId: wId, label });

      // Move to previous week
      cursor = new Date(cursor.getTime() - 7 * 24 * 60 * 60 * 1000);
    }

    return weeks;
  });

  const weeks = await getWeeks();
  c.header('Cache-Control', 'public, max-age=3600');
  return c.json({ weeks });
});

// TODO(security): Leaderboard exposes raw Cognito identityIds (region:uuid) in unauthenticated
// responses. Any caller can enumerate all active users' identityIds by paging through the
// leaderboard and then mass-scrape per-user detail data via /score/:identityId.
// Fix: replace identityId in leaderboard response with SHA256(identityId).slice(0,16).
// Clients finding "my rank" should hash their own identityId client-side for comparison.
// Blocked by: EcosystemPointsCard and other components that currently use identityId directly.
// Tracked: https://github.com/narunice/nasun-monorepo/issues/1

// GET /api/v1/ecosystem/leaderboard?weekId=2026-W17&limit=50&offset=0
//
// Weekly ecosystem leaderboard — no NFT multiplier applied to ranking.
// Score = activity_diversity_score (distinct non-pado categories per day, summed over week)
//       + creator_post_score (admin-granted ecosystem-bonus-creator-posts points)
// All users with any activity in the week appear; NFT ownership is not required.
app.get('/leaderboard', async (c) => {
  if (!pointsDb) {
    return c.json({ error: 'points_not_configured' }, 503);
  }

  const rawWeekId = c.req.query('weekId');
  const weekId = rawWeekId && /^\d{4}-W\d{2}$/.test(rawWeekId)
    ? rawWeekId
    : getCurrentWeekId();

  const limit = parseLimit(c.req.query('limit'));
  const offset = parseOffset(c.req.query('offset'));

  const bounds = getWeekBounds(weekId);
  if (!bounds) {
    return c.json({ error: 'invalid_week_id' }, 400);
  }

  const getScoredLeaderboard = cached(
    `eco-leaderboard-${weekId}`,
    5 * 60 * 1000,
    async () => {
      // Excluded from activity diversity score (same logic as matview, plus all pado-*):
      //   - system-generated bonuses (referral-bonus, daily-mission, ecosystem-passive, staking-daily, staking)
      //   - ecosystem-bonus-* (creator-posts counted separately below)
      //   - pado-* (covered by the dedicated Pado Score Leaderboard)
      const rows = await pointsDb!`
        WITH week_activities AS (
          SELECT DISTINCT identity_id,
            -- Use epoch-based day slot relative to week start to avoid the 10-minute offset
            -- artifact: calendar date_trunc can produce 8 distinct days per 7-day window
            -- because the reset boundary (Mon 00:10 UTC) crosses midnight (Mon 00:00 UTC).
            -- Slots 0-6 guarantee activeDays <= 7 regardless of the offset.
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
            AND category NOT IN (
              'referral-bonus', 'daily-mission', 'ecosystem-passive',
              'staking-daily', 'staking'
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
                 COALESCE(SUM(final_points), 0)::numeric AS post_score
          FROM activity_points
          WHERE category = 'ecosystem-bonus-creator-posts'
            AND NOT flagged
            AND identity_id IS NOT NULL
            AND tx_timestamp >= ${bounds.start}
            AND tx_timestamp < ${bounds.end}
          GROUP BY identity_id
        )
        SELECT
          COALESCE(a.identity_id, c.identity_id) AS identity_id,
          COALESCE(a.activity_score, 0)::int AS activity_score,
          COALESCE(c.post_score, 0)::numeric AS post_score,
          (COALESCE(a.activity_score, 0) + COALESCE(c.post_score, 0))::numeric AS weekly_score,
          COALESCE(a.active_days, 0)::int AS active_days
        FROM activity_score a
        FULL OUTER JOIN creator_post_score c ON a.identity_id = c.identity_id
        ORDER BY weekly_score DESC, identity_id ASC
      `;

      return rows.map((r) => ({
        identityId: r.identity_id as string,
        activityScore: r.activity_score as number,
        creatorPostScore: parseFloat(r.post_score as string),
        weeklyScore: parseFloat(r.weekly_score as string),
        activeDays: r.active_days as number,
      }));
    },
  );

  const all = await getScoredLeaderboard();

  const page = all.slice(offset, offset + limit);
  const ranked = page.map((entry, i) => ({
    ...entry,
    creatorPostScore: roundTo2(entry.creatorPostScore),
    weeklyScore: roundTo2(entry.weeklyScore),
    rank: offset + i + 1,
  }));

  c.header('Cache-Control', 'public, max-age=300');
  return c.json({
    data: ranked,
    meta: {
      weekId,
      weekStart: bounds.start.getTime(),
      limit,
      offset,
      total: all.length,
      updatedAt: Date.now(),
    },
  });
});

// POST /api/v1/ecosystem/sync/:identityId
// Triggers per-user NFT activation cache refresh.
// Called by frontend after activate/deactivate or manual Refresh button.
app.post('/sync/:identityId', async (c) => {
  const identityId = c.req.param('identityId');
  if (!identityId || !IDENTITY_ID_PATTERN.test(identityId)) {
    return c.json({ error: 'invalid_identity_id' }, 400);
  }

  const updated = await updateActivationsForUser(identityId);
  if (updated === null) {
    return c.json({ error: 'rate_limited', message: 'Try again in 20 seconds' }, 429);
  }

  const multiplier = calculateMultiplier(updated);
  return c.json({
    data: {
      identityId,
      activations: updated,
      multiplier: roundTo2(multiplier),
      synced: true,
    },
  });
});

// GET /api/v1/ecosystem/score/wallet/:address
// Wallet-based score lookup (for Pado frontend, no Cognito identity).
const SUI_ADDRESS_RE = /^0x[a-fA-F0-9]{1,64}$/;

app.get('/score/wallet/:address', async (c) => {
  if (!pointsDb) return c.json({ error: 'points_not_configured' }, 503);

  const address = c.req.param('address');
  if (!address || !SUI_ADDRESS_RE.test(address)) {
    return c.json({ error: 'invalid_address' }, 400);
  }

  const identityId = getIdentityByWallet(address);
  if (!identityId) {
    return c.json({ data: null, message: 'wallet_not_registered' });
  }

  // Redirect to the identityId-based score endpoint.
  // Explicit CORS header on 302 response (nginx/CloudFront may strip middleware headers on redirects)
  const url = new URL(c.req.url);
  url.pathname = url.pathname.replace(`/wallet/${address}`, `/${encodeURIComponent(identityId)}`);
  const origin = c.req.header('origin');
  if (origin && CORS_ALLOWED_ORIGINS.has(origin)) {
    c.header('Access-Control-Allow-Origin', origin);
  }
  return c.redirect(url.pathname, 302);
});

// GET /api/v1/ecosystem/snapshot/history/:identityId?days=30
app.get('/snapshot/history/:identityId', async (c) => {
  if (!pointsDb) return c.json({ error: 'points_not_configured' }, 503);

  const identityId = c.req.param('identityId');
  if (!identityId || !IDENTITY_ID_PATTERN.test(identityId)) {
    return c.json({ error: 'invalid_identity_id' }, 400);
  }

  const days = Math.min(Math.max(1, parseInt(c.req.query('days') ?? '30', 10)), 90);

  const rows = await pointsDb`
    SELECT snapshot_date, base_score, multiplier::numeric, bonus_total::numeric,
           COALESCE(referral_bonus, 0)::numeric as referral_bonus,
           ecosystem_score::numeric, is_penalized, rank
    FROM ecosystem_score_snapshots
    WHERE identity_id = ${identityId}
    ORDER BY snapshot_date DESC
    LIMIT ${days}
  `;

  c.header('Cache-Control', 'public, max-age=300');
  return c.json({
    data: rows.map(r => ({
      date: r.snapshot_date,
      baseScore: Number(r.base_score),
      multiplier: parseFloat(r.multiplier as string),
      bonusTotal: parseFloat(r.bonus_total as string),
      referralBonus: parseFloat(r.referral_bonus as string),
      ecosystemScore: parseFloat(r.ecosystem_score as string),
      isPenalized: r.is_penalized,
      rank: r.rank,
    })),
  });
});

// GET /api/v1/ecosystem/bonus-history/:identityId?days=30
// Returns per-day breakdown of bonus categories (earlybird, pado, game, airdrop, referral)
app.get('/bonus-history/:identityId', async (c) => {
  if (!pointsDb) return c.json({ error: 'points_not_configured' }, 503);

  const identityId = c.req.param('identityId');
  if (!identityId || !IDENTITY_ID_PATTERN.test(identityId)) {
    return c.json({ error: 'invalid_identity_id' }, 400);
  }

  const days = Math.min(Math.max(1, parseInt(c.req.query('days') ?? '30', 10)), 90);

  const rows = await pointsDb`
    SELECT
      date_trunc('day', tx_timestamp)::date AS day,
      category,
      activity_type,
      SUM(final_points)::numeric AS points,
      COUNT(*)::int AS count
    FROM activity_points
    WHERE identity_id = ${identityId}
      AND NOT flagged
      AND (metadata->>'synthetic') IS DISTINCT FROM 'true'
      AND (category LIKE 'ecosystem-bonus-%' OR category = 'referral-bonus')
      AND tx_timestamp >= CURRENT_DATE - make_interval(days => ${days})
    GROUP BY day, category, activity_type
    ORDER BY day DESC, points DESC
  `;

  // Group by day
  const byDay = new Map<string, Array<{ category: string; activityType: string; points: number; count: number }>>();
  for (const r of rows) {
    const day = (r.day as Date).toISOString().split('T')[0];
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push({
      category: r.category as string,
      activityType: r.activity_type as string,
      points: parseFloat(r.points as string),
      count: r.count as number,
    });
  }

  c.header('Cache-Control', 'public, max-age=300');
  return c.json({
    data: [...byDay.entries()].map(([day, items]) => ({
      date: day,
      total: items.reduce((s, i) => s + i.points, 0),
      items,
    })),
  });
});

// GET /api/v1/ecosystem/health
app.get('/health', async (c) => {
  const status = getMatviewStatus();
  c.header('Cache-Control', 'no-cache');
  return c.json({ data: status });
});

export default app;
