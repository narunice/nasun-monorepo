import { Hono } from 'hono';
import { pointsDb } from '../db.js';
import { cached } from '../cache.js';
import { getScannerHealth } from '../scanner/points-scanner.js';

const app = new Hono();

const ALLOWED_LIMITS = [25, 50, 100] as const;

function parseLimit(raw: string | undefined): number {
  const n = Number(raw ?? 50);
  if (Number.isNaN(n) || n < 1) return 50;
  return ALLOWED_LIMITS.reduce((prev, curr) =>
    Math.abs(curr - n) < Math.abs(prev - n) ? curr : prev,
  );
}

const MAX_OFFSET = 10000;

function parseOffset(raw: string | undefined): number {
  const n = Number(raw ?? 0);
  if (Number.isNaN(n) || n < 0) return 0;
  return Math.min(Math.floor(n), MAX_OFFSET);
}

// GET /api/v1/points/leaderboard?limit=50&offset=0
app.get('/leaderboard', async (c) => {
  if (!pointsDb) {
    return c.json({ error: 'points_not_configured' }, 503);
  }

  const limit = parseLimit(c.req.query('limit'));
  const offset = parseOffset(c.req.query('offset'));

  const getLeaderboard = cached(
    `points-leaderboard-${limit}-${offset}`,
    5 * 60 * 1000,
    async () => {
      const rows = await pointsDb!`
        SELECT
          identity_id,
          SUM(final_points)::text as total_points,
          COUNT(*)::int as activity_count,
          COUNT(DISTINCT category)::int as active_categories,
          DENSE_RANK() OVER (ORDER BY SUM(final_points) DESC)::int as rank
        FROM activity_points
        WHERE NOT flagged AND identity_id IS NOT NULL
        GROUP BY identity_id
        ORDER BY SUM(final_points) DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      return rows.map((r) => ({
        identityId: r.identity_id,
        totalPoints: r.total_points,
        activityCount: r.activity_count,
        activeCategories: r.active_categories,
        rank: r.rank,
      }));
    },
  );

  const data = await getLeaderboard();
  c.header('Cache-Control', 'public, max-age=300');
  return c.json({ data });
});

// GET /api/v1/points/user/:address
app.get('/user/:address', async (c) => {
  if (!pointsDb) {
    return c.json({ error: 'points_not_configured' }, 503);
  }

  const address = c.req.param('address');
  if (!address || !/^0x[a-fA-F0-9]{64}$/.test(address)) {
    return c.json({ error: 'invalid_address' }, 400);
  }

  const addrLower = address.toLowerCase();

  const getUserPoints = cached(
    `points-user-${addrLower}`,
    5 * 60 * 1000,
    async () => {
      const [[summary], categories] = await Promise.all([
        pointsDb!`
          SELECT
            wallet_address,
            MAX(identity_id) as identity_id,
            SUM(final_points)::text as total_points,
            COUNT(*)::int as activity_count,
            COUNT(DISTINCT category)::int as active_categories,
            MIN(tx_timestamp) as first_activity,
            MAX(tx_timestamp) as last_activity
          FROM activity_points
          WHERE wallet_address = ${addrLower} AND NOT flagged
          GROUP BY wallet_address
        `,
        pointsDb!`
          SELECT
            category,
            SUM(final_points)::text as points,
            COUNT(*)::int as count
          FROM activity_points
          WHERE wallet_address = ${addrLower} AND NOT flagged
          GROUP BY category
          ORDER BY SUM(final_points) DESC
        `,
      ]);

      if (!summary) return null;

      return {
        walletAddress: summary.wallet_address,
        identityId: summary.identity_id,
        totalPoints: summary.total_points,
        activityCount: summary.activity_count,
        activeCategories: summary.active_categories,
        firstActivity: summary.first_activity?.toISOString() ?? null,
        lastActivity: summary.last_activity?.toISOString() ?? null,
        categories: categories.map((r) => ({
          category: r.category,
          points: r.points,
          count: r.count,
        })),
      };
    },
  );

  const data = await getUserPoints();
  if (!data) {
    return c.json({ error: 'not_found' }, 404);
  }

  c.header('Cache-Control', 'public, max-age=300');
  return c.json({ data });
});

// GET /api/v1/points/referral-stats?referrer=:identityId
// Public read-only endpoint for Lambda my-stats to fetch bonus totals
app.get('/referral-stats', async (c) => {
  if (!pointsDb) {
    return c.json({ error: 'points_not_configured' }, 503);
  }

  const referrer = c.req.query('referrer');
  if (!referrer || referrer.length < 10) {
    return c.json({ error: 'invalid_referrer' }, 400);
  }

  const getReferralStats = cached(
    `points-referral-stats-${referrer}`,
    5 * 60 * 1000,
    async () => {
      const [row] = await pointsDb!`
        SELECT COALESCE(SUM(final_points), 0)::text as total_bonus_points
        FROM activity_points
        WHERE identity_id = ${referrer}
          AND category = 'referral-bonus'
          AND NOT flagged
      `;
      return {
        totalBonusPoints: Number(row?.total_bonus_points ?? 0),
      };
    },
  );

  const data = await getReferralStats();
  c.header('Cache-Control', 'public, max-age=300');
  return c.json(data);
});

// GET /api/v1/points/health
app.get('/health', async (c) => {
  const health = await getScannerHealth();
  c.header('Cache-Control', 'no-cache');
  return c.json({ data: health });
});

export default app;
