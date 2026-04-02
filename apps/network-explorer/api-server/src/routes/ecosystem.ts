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
  getMatviewStatus,
  updateActivationsForUser,
} from '../scanner/ecosystem-cache.js';
import { getActivationBonus, calculateMultiplier } from '../config/ecosystem.js';

const app = new Hono();

const roundTo2 = (n: number) => parseFloat(n.toFixed(2));

const ALLOWED_LIMITS = [25, 50, 100, 200] as const;
const MAX_OFFSET = 10000;

// Cognito identityId format: region:uuid
const IDENTITY_ID_PATTERN = /^[\w-]+:[\w-]{36}$/;

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
    5 * 60 * 1000,
    async () => {
      const [todayRow, weeklyRow, allTimeRow] = await Promise.all([
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
      ]);

      // Alliance penalty check (PK lookup, <1ms)
      const activations = getActivationsForUser(identityId);
      const hasAlliance = activations.some(a => a.nftType === 'alliance');
      const hasGenesis = activations.some(a => a.nftType === 'genesis-pass');

      let isPenalized = false;
      if (hasAlliance && !hasGenesis) {
        const [penalty] = await pointsDb!`
          SELECT 1 FROM alliance_penalties WHERE identity_id = ${identityId}
        `;
        if (penalty) isPenalized = true;
      }

      const effectiveActivations = isPenalized
        ? activations.filter(a => a.nftType !== 'alliance')
        : activations;
      const multiplier = calculateMultiplier(effectiveActivations);

      return {
        todayBaseScore: todayRow?.base_score ?? 0,
        weeklyBaseScore: weeklyRow?.base_score ?? 0,
        weeklyActiveDays: weeklyRow?.active_days ?? 0,
        allTimeBaseScore: allTimeRow?.base_score ?? 0,
        allTimeActiveDays: allTimeRow?.active_days ?? 0,
        multiplier,
        activations,
        isPenalized,
      };
    },
  );

  const scores = await getData();

  const disabled = scores.multiplier === 0;

  const data = {
    identityId,
    multiplier: roundTo2(scores.multiplier),
    disabled,
    isPenalized: scores.isPenalized,
    activations: scores.activations.map((a) => ({
      nftType: a.nftType,
      nftCount: a.nftCount,
      bonus: roundTo2(getActivationBonus(a)),
    })),
    daily: {
      baseScore: scores.todayBaseScore,
      ecosystemScore: roundTo2(scores.todayBaseScore * scores.multiplier),
    },
    weekly: {
      baseScore: scores.weeklyBaseScore,
      ecosystemScore: roundTo2(scores.weeklyBaseScore * scores.multiplier),
      activeDays: scores.weeklyActiveDays,
    },
    allTime: {
      baseScore: scores.allTimeBaseScore,
      ecosystemScore: roundTo2(scores.allTimeBaseScore * scores.multiplier),
      activeDays: scores.allTimeActiveDays,
    },
  };

  c.header('Cache-Control', 'public, max-age=300');
  return c.json({ data });
});

// GET /api/v1/ecosystem/leaderboard?period=daily|weekly&limit=50&offset=0
app.get('/leaderboard', async (c) => {
  if (!pointsDb) {
    return c.json({ error: 'points_not_configured' }, 503);
  }

  const period = c.req.query('period') === 'weekly' ? 'weekly' : 'daily';
  const limit = parseLimit(c.req.query('limit'));
  const offset = parseOffset(c.req.query('offset'));

  // Fetch a generous set of top users by base_score, then apply multipliers and re-sort.
  // We fetch more than requested to account for multiplier reordering.
  const fetchLimit = Math.min(limit + offset + 200, 500);

  const getScoredLeaderboard = cached(
    `eco-leaderboard-scored-${period}-${fetchLimit}`,
    5 * 60 * 1000,
    async () => {
      const rows = period === 'daily'
        ? await pointsDb!`
            SELECT identity_id, base_score::int as base_score
            FROM ecosystem_daily_scores
            WHERE day = CURRENT_DATE
            ORDER BY base_score DESC
            LIMIT ${fetchLimit}
          `
        : await pointsDb!`
            SELECT identity_id,
                   SUM(base_score)::int as base_score,
                   COUNT(*)::int as active_days
            FROM ecosystem_daily_scores
            WHERE day >= CURRENT_DATE - INTERVAL '6 days'
              AND day <= CURRENT_DATE
            GROUP BY identity_id
            ORDER BY SUM(base_score) DESC
            LIMIT ${fetchLimit}
          `;

      // Batch penalty check inside cache
      const leaderboardIds = rows.map(r => r.identity_id as string);
      let penalizedSet = new Set<string>();
      if (leaderboardIds.length > 0) {
        const penalizedRows = await pointsDb!`
          SELECT identity_id FROM alliance_penalties
          WHERE identity_id = ANY(${leaderboardIds})
        `;
        penalizedSet = new Set(penalizedRows.map(r => r.identity_id as string));
      }

      return rows.map((r) => {
        const id = r.identity_id as string;
        let activations = getActivationsForUser(id);
        if (penalizedSet.has(id)) {
          activations = activations.filter(a => a.nftType !== 'alliance');
        }
        const multiplier = calculateMultiplier(activations);
        const baseScore = r.base_score as number;
        return {
          identityId: id,
          baseScore,
          multiplier: roundTo2(multiplier),
          ecosystemScore: roundTo2(baseScore * multiplier),
          ...(period === 'weekly' ? { activeDays: r.active_days as number } : {}),
        };
      });
    },
  );

  const scored = await getScoredLeaderboard();

  // Exclude users with no active NFTs (multiplier=0, disabled)
  const active = scored.filter(e => e.multiplier > 0);
  active.sort((a, b) => b.ecosystemScore - a.ecosystemScore);

  // Apply offset/limit and assign ranks
  const page = active.slice(offset, offset + limit);
  const ranked = page.map((entry, i) => ({
    ...entry,
    rank: offset + i + 1,
  }));

  c.header('Cache-Control', 'public, max-age=300');
  return c.json({
    data: ranked,
    meta: {
      period,
      limit,
      offset,
      total: active.length,
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

// GET /api/v1/ecosystem/health
app.get('/health', async (c) => {
  const status = getMatviewStatus();
  c.header('Cache-Control', 'no-cache');
  return c.json({ data: status });
});

export default app;
