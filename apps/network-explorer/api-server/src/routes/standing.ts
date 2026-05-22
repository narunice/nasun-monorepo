/**
 * /api/v1/standing — Nasun Standing Index (NSI) read API.
 *
 *   GET /by-address/:address   public — current tier + nsi_score + benefits
 *   GET /_/health              ops    — table row count + latest computed_at
 *   GET /_/distribution        public — tier counts + NSI percentile stats
 *
 * Owner-only sub-score breakdown is gated behind zkLogin auth and lands in
 * `GET /me` once the Phase 2 auth wiring is in place. Phase 1 surfaces just
 * enough for the nasun-website badge: tier, score, next threshold, benefits.
 */

import { Hono } from 'hono';
import { pointsDb } from '../db.js';

const app = new Hono();

const TIER_BENEFITS = {
  1: { pado_fee_discount_bps: 0, gostop_max_bet_usd: 100, can_create_vault: false },
  2: { pado_fee_discount_bps: 3500, gostop_max_bet_usd: 1000, can_create_vault: false },
  3: { pado_fee_discount_bps: 6000, gostop_max_bet_usd: 10000, can_create_vault: true },
} as const;

const TIER_2_THRESHOLD = 250;
const TIER_3_THRESHOLD = 600;

function nextThreshold(tier: number): number | null {
  if (tier === 1) return TIER_2_THRESHOLD;
  if (tier === 2) return TIER_3_THRESHOLD;
  return null;
}

app.get('/by-address/:address', async (c) => {
  if (!pointsDb) return c.json({ error: 'points_db_unavailable' }, 503);

  const address = c.req.param('address').toLowerCase();
  if (!/^0x[0-9a-f]+$/.test(address)) {
    return c.json({ error: 'invalid_address' }, 400);
  }

  const rows = await pointsDb<Array<{ tier: number; nsi_score: string; has_gp: boolean; computed_at: Date }>>`
    SELECT tier, nsi_score::text, has_gp, computed_at
    FROM user_nsi
    WHERE LOWER(wallet_address) = ${address}
    LIMIT 1
  `;

  if (rows.length === 0) {
    return c.json({
      tier: 1,
      nsi_score: 0,
      next_threshold: TIER_2_THRESHOLD,
      benefits: TIER_BENEFITS[1],
      computed_at: null,
    });
  }

  const row = rows[0];
  const tier = row.tier as 1 | 2 | 3;
  return c.json({
    tier,
    nsi_score: Number(row.nsi_score),
    next_threshold: nextThreshold(tier),
    benefits: TIER_BENEFITS[tier],
    has_gp: row.has_gp,
    computed_at: row.computed_at,
  });
});

app.get('/_/health', async (c) => {
  if (!pointsDb) return c.json({ error: 'points_db_unavailable' }, 503);
  const [countRow] = await pointsDb<Array<{ count: number }>>`
    SELECT COUNT(*)::int AS count FROM user_nsi
  `;
  const [latestRow] = await pointsDb<Array<{ latest: Date | null }>>`
    SELECT MAX(computed_at) AS latest FROM user_nsi
  `;
  return c.json({
    total_rows: countRow?.count ?? 0,
    latest_computed_at: latestRow?.latest ?? null,
  });
});

app.get('/_/distribution', async (c) => {
  if (!pointsDb) return c.json({ error: 'points_db_unavailable' }, 503);

  const distribution = await pointsDb<Array<{ tier: number; user_count: string }>>`
    SELECT tier, COUNT(*)::text AS user_count
    FROM user_nsi
    GROUP BY tier
    ORDER BY tier
  `;
  const [stats] = await pointsDb<
    Array<{
      min: string | null;
      max: string | null;
      avg: string | null;
      p50: string | null;
      p90: string | null;
      p99: string | null;
    }>
  >`
    SELECT
      MIN(nsi_score)::text AS min,
      MAX(nsi_score)::text AS max,
      AVG(nsi_score)::text AS avg,
      PERCENTILE_CONT(0.5)  WITHIN GROUP (ORDER BY nsi_score)::text AS p50,
      PERCENTILE_CONT(0.9)  WITHIN GROUP (ORDER BY nsi_score)::text AS p90,
      PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY nsi_score)::text AS p99
    FROM user_nsi
  `;

  const toNum = (v: string | null) => (v === null ? null : Number(v));
  return c.json({
    distribution: distribution.map((r) => ({ tier: r.tier, user_count: Number(r.user_count) })),
    nsi_stats: stats
      ? {
          min: toNum(stats.min),
          max: toNum(stats.max),
          avg: toNum(stats.avg),
          p50: toNum(stats.p50),
          p90: toNum(stats.p90),
          p99: toNum(stats.p99),
        }
      : null,
  });
});

export default app;
