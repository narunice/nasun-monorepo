/**
 * /api/v1/standing — Nasun Standing Index (NSI) read API.
 *
 * # Public surface (no auth, IP rate-limited 60 rpm via index.ts):
 *   GET /by-address/:address   — { tier, nsi_score, next_threshold, benefits, has_gp, computed_at }
 *   GET /_/health              — { total_rows, latest_computed_at }   ops
 *   GET /_/distribution        — { distribution, nsi_stats }
 *
 * # Self-only surface (Phase 2 — zkLogin/Cognito):
 *   GET /me   — extends public response with sub_scores breakdown, max_seen_tier,
 *               previous_tier, first_computed_at, linked-wallet sum.
 *
 * # Threat model — `/by-address/:address` is intentionally public.
 *
 *   - The exposed fields (tier, nsi_score) are coarse signals derived entirely
 *     from public on-chain data and are also pushed to the on-chain
 *     `nasun_tier::TierRegistry` shared object. An attacker enumerating wallets
 *     can already read the same values from chain — exposing them via HTTP is
 *     consistent with that public state.
 *   - Wallet enumeration over the 0x address space is acceptable for this
 *     reason. We do NOT expose `sub_scores` (behavioural pattern), `previous_tier`,
 *     or `max_seen_tier` here — those reveal activity history and require
 *     authenticated self-only access in Phase 2.
 *   - Cache key is the full URL path (including address), so cross-user leakage
 *     via shared CDN cache is structurally impossible.
 *
 * # SSOT
 *
 *   - score → tier mapping and tier metadata come from `@nasun/standing` (TS).
 *   - tier → benefit values originate in `packages/nasun-tier/sources/policy.move`
 *     and are mirrored into `@nasun/standing/benefits.ts`. Source-parity test in
 *     that package blocks drift between Move source and TS mirror.
 *   - This route is a thin projection of those SSOTs onto the public response
 *     shape (`pado_fee_discount_bps` etc. for backward compatibility).
 */

import { Hono, type Context } from 'hono';
import {
  TIER_2_THRESHOLD,
  TIER_BENEFITS,
  nextThreshold,
  type PublicStandingResponse,
  type Tier,
} from '@nasun/standing';
import { pointsDb } from '../db.js';

const app = new Hono();

interface UserNsiRow {
  tier: number;
  nsi_score: string;
  has_gp: boolean;
  computed_at: Date;
}

/**
 * Project the internal `TIER_BENEFITS` table onto the public response shape.
 * The package's canonical names (`fee_discount_bps`) come from Move; the public
 * API has used app-prefixed names (`pado_fee_discount_bps`, `gostop_max_bet_usd`)
 * since launch and is consumed by NavStandingBadge plus future Pado/GoStop
 * surfaces. Keeping the mapping local here lets the package mirror Move 1:1
 * while the wire format stays stable.
 */
function publicBenefits(tier: Tier) {
  const b = TIER_BENEFITS[tier];
  return {
    pado_fee_discount_bps: b.fee_discount_bps,
    gostop_max_bet_usd: b.gostop_max_bet_usd,
    can_create_vault: b.can_create_vault,
  };
}

type PublicStandingWire = Omit<PublicStandingResponse, 'benefits' | 'computed_at'> & {
  benefits: ReturnType<typeof publicBenefits>;
  computed_at: string | null;
};

/**
 * Build the response payload via an explicit whitelist. Adding a new field to
 * the `user_nsi` table (e.g., `sub_scores` if we ever drop the column gate)
 * cannot accidentally leak through the public route — it has to be added here.
 */
function publicStandingView(row: UserNsiRow | null): PublicStandingWire {
  if (!row) {
    return {
      tier: 1,
      nsi_score: 0,
      next_threshold: TIER_2_THRESHOLD,
      benefits: publicBenefits(1),
      has_gp: false,
      computed_at: null,
    };
  }
  const tier = row.tier as Tier;
  return {
    tier,
    nsi_score: Number(row.nsi_score),
    next_threshold: nextThreshold(tier),
    benefits: publicBenefits(tier),
    has_gp: row.has_gp,
    computed_at: row.computed_at.toISOString(),
  };
}

/**
 * Apply cache headers consistent with other public routes (`points.ts`,
 * `stats.ts`, `ecosystem.ts`). `Vary: Origin` keeps the cache entry per-origin
 * so the Hono CORS middleware's reflected `Access-Control-Allow-Origin` value
 * does not poison the response for siblings (nasun.io vs pado.finance vs
 * gostop.app). NSI re-computes hourly upstream; 60 s edge cache is well within
 * the data's natural freshness.
 *
 * NOTE: CloudFront `/api/*` is currently `CachingDisabled` (see
 * docs/infrastructure.md); these headers are honoured by the nginx upstream
 * cache on the origin EC2 and by browsers. CDN-level promotion is a separate
 * deliverable.
 */
function applyPublicCacheHeaders(c: Context): void {
  c.header('Cache-Control', 'public, max-age=60');
  c.header('Vary', 'Origin');
}

// Sui addresses are exactly 32 bytes -> 64 hex chars -> 66-char "0x..." string.
// Enforcing both pattern + length blocks log-spam and memory-pressure vectors
// from oversized path params (open-ended `^0x[0-9a-f]+$` would otherwise
// accept multi-MB strings).
const SUI_ADDRESS_RE = /^0x[0-9a-f]{64}$/;

app.get('/by-address/:address', async (c) => {
  if (!pointsDb) return c.json({ error: 'points_db_unavailable' }, 503);

  const address = c.req.param('address').toLowerCase();
  if (!SUI_ADDRESS_RE.test(address)) {
    return c.json({ error: 'invalid_address' }, 400);
  }

  const rows = await pointsDb<UserNsiRow[]>`
    SELECT tier, nsi_score::text, has_gp, computed_at
    FROM user_nsi
    WHERE LOWER(wallet_address) = ${address}
    LIMIT 1
  `;

  applyPublicCacheHeaders(c);
  return c.json(publicStandingView(rows[0] ?? null));
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
