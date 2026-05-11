import { Hono } from 'hono';
import { pointsDb } from '../db.js';
import { cached } from '../cache.js';
import { rpcCall } from '../rpc.js';
import { getScannerHealth } from '../scanner/points-scanner.js';
import { requireInternalApiKey } from '../auth/internal-api-key.js';
import {
  hasGenesisPass,
  getActivationsCacheSize,
} from '../scanner/ecosystem-cache.js';

const IDENTITY_ID_PATTERN = /^[\w-]+:[\w-]{36}$/;

const app = new Hono();

// Governance Dashboard object ID (from devnet-ids.json)
const GOVERNANCE_DASHBOARD_ID =
  '0xc6eff35e83378d77e1ef7214cac1b447b6e486c5ba1daa0ae0ca88bef2d1f0f2';

// Global cache: check if any active governance proposals exist (shared across all users)
const getHasActiveProposals = cached(
  'governance-active-proposals',
  5 * 60 * 1000,
  async (): Promise<boolean> => {
    // 1. Fetch dashboard to get proposal IDs
    const dashboard = await rpcCall<{
      data?: {
        content?: {
          dataType: string;
          fields?: { proposals_ids?: string[] };
        };
      };
    }>('sui_getObject', [GOVERNANCE_DASHBOARD_ID, { showContent: true }]);

    const proposalIds =
      dashboard.data?.content?.fields?.proposals_ids ?? [];
    if (proposalIds.length === 0) return false;

    // 2. Batch fetch proposals to check active status
    // TODO: batch in chunks of 50 if proposal count grows
    const proposals = await rpcCall<
      Array<{
        data?: {
          content?: {
            dataType: string;
            fields?: {
              expiration?: string | number;
              status?: { variant?: string };
            };
          };
        };
      }>
    >('sui_multiGetObjects', [proposalIds, { showContent: true }]);

    const now = Date.now();
    return proposals.some((p) => {
      const fields = p.data?.content?.fields;
      if (!fields) return false;
      const isDelisted = fields.status?.variant === 'Delisted';
      const isExpired = Number(fields.expiration ?? 0) < now;
      return !isDelisted && !isExpired;
    });
  },
);

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

  // Today's active categories (separate cache, shorter TTL for daily mission freshness)
  const getTodayCategories = cached(
    `points-today-${addrLower}`,
    60 * 1000, // 60 seconds
    async () => {
      const rows = await pointsDb!`
        SELECT DISTINCT category
        FROM activity_points
        WHERE wallet_address = ${addrLower}
          AND NOT flagged
          AND category != 'referral-bonus'
          AND tx_timestamp >= CURRENT_DATE AT TIME ZONE 'UTC'
          AND tx_timestamp < (CURRENT_DATE + interval '1 day') AT TIME ZONE 'UTC'
      `;
      return rows.map((r) => r.category as string);
    },
  );

  // Fetch user data + governance active proposals in parallel
  // hasActiveProposals: fail-open (true on error) so governance mission shows by default
  const [data, todayCategories, hasActiveProposals] = await Promise.all([
    getUserPoints(),
    getTodayCategories(),
    getHasActiveProposals().catch(() => true),
  ]);

  if (!data) {
    return c.json({ error: 'not_found' }, 404);
  }

  c.header('Cache-Control', 'public, max-age=60');
  return c.json({ data: { ...data, todayCategories, hasActiveProposals } });
});

// GET /api/v1/points/referral-stats?referrer=:identityId
// Internal endpoint for Lambda my-stats to fetch bonus totals (API key required)
app.get('/referral-stats', requireInternalApiKey('REFERRAL_MAPPINGS_API_KEY'), async (c) => {
  if (!pointsDb) {
    return c.json({ error: 'points_not_configured' }, 503);
  }

  const referrer = c.req.query('referrer');
  if (!referrer || !IDENTITY_ID_PATTERN.test(referrer)) {
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
          AND activity_type = 'l1-bonus'
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

// POST /api/v1/points/bug-report-reward
// Internal endpoint for admin Lambda to grant bug report bonus points.
// Uses ecosystem-bonus-bugreport category to integrate with existing bonus pipeline.
app.post('/bug-report-reward', requireInternalApiKey('BUG_REPORT_API_KEY'), async (c) => {
  if (!pointsDb) {
    return c.json({ error: 'points_not_configured' }, 503);
  }

  const body = await c.req.json<{
    walletAddress?: string;
    identityId?: string;
    reportId?: string;
    points?: number;
    reason?: string;
    type?: 'bug-report' | 'feedback';
  }>();

  // Validate required fields
  if (!body.walletAddress || typeof body.walletAddress !== 'string') {
    return c.json({ error: 'walletAddress is required' }, 400);
  }
  // Validate Sui address format (0x + 64 hex chars)
  if (!/^0x[a-fA-F0-9]{64}$/.test(body.walletAddress)) {
    return c.json({ error: 'Invalid walletAddress format (expected 0x + 64 hex chars)' }, 400);
  }
  if (!body.identityId || typeof body.identityId !== 'string') {
    return c.json({ error: 'identityId is required' }, 400);
  }
  // Validate Cognito identityId format (region:uuid)
  if (!/^[\w-]+:[\w-]{36}$/.test(body.identityId)) {
    return c.json({ error: 'Invalid identityId format' }, 400);
  }
  if (!body.reportId || typeof body.reportId !== 'string') {
    return c.json({ error: 'reportId is required' }, 400);
  }
  if (!body.points || typeof body.points !== 'number' || body.points <= 0 || body.points > 100) {
    return c.json({ error: 'points must be 1-100' }, 400);
  }

  const finalPoints = body.points;
  const rewardType = body.type === 'feedback' ? 'feedback' : 'bug-report';
  const txDigest = rewardType === 'feedback' ? `feedback:${body.reportId}` : `bugreport:${body.reportId}`;
  const category = rewardType === 'feedback' ? 'ecosystem-bonus-feedback' : 'ecosystem-bonus-bugreport';
  const walletAddress = body.walletAddress.toLowerCase();

  // metadata for bonus-feed UI (graceful fallback if absent on legacy rows).
  // Reason text is truncated to 200 chars to avoid bloating the row.
  const reasonClipped = typeof body.reason === 'string'
    ? body.reason.slice(0, 200)
    : null;
  const metadata = {
    reportType: rewardType,
    reportId: body.reportId,
    reason: reasonClipped,
  };

  // INSERT with ON CONFLICT DO NOTHING for idempotency
  const result = await pointsDb`
    INSERT INTO activity_points (
      tx_digest, tx_sequence_number, tx_timestamp,
      wallet_address, identity_id,
      category, activity_type,
      base_points, volume_tier, genesis_multiplier, final_points,
      event_seq, metadata
    ) VALUES (
      ${txDigest}, 0, NOW(),
      ${walletAddress}, ${body.identityId},
      ${category}, 'report-accepted',
      ${finalPoints}, 1.0, 1.0, ${finalPoints},
      0, ${pointsDb.json(metadata)}
    )
    ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
  `;

  const created = result.count > 0;

  console.log(
    `[${rewardType === 'feedback' ? 'Feedback' : 'BugReport'}] Reward: ${body.reportId} -> ${walletAddress} ${finalPoints}pts` +
    `${created ? '' : ' (duplicate, skipped)'} reason: ${body.reason || 'N/A'}`,
  );

  return c.json({
    success: true,
    created,
    finalPoints,
    reportId: body.reportId,
  });
});

// POST /api/v1/points/creator-post-reward
// Internal endpoint for admin Lambda to grant creator-post bonus points.
// Uses ecosystem-bonus-creator-posts category. identityId-based grant; wallet optional.
app.post('/creator-post-reward', requireInternalApiKey('BUG_REPORT_API_KEY'), async (c) => {
  if (!pointsDb) {
    return c.json({ error: 'points_not_configured' }, 503);
  }

  const body = await c.req.json<{
    identityId?: string;
    walletAddress?: string;
    postId?: string;
    points?: number;
  }>();

  if (!body.identityId || typeof body.identityId !== 'string') {
    return c.json({ error: 'identityId is required' }, 400);
  }
  if (!/^[\w-]+:[\w-]{36}$/.test(body.identityId)) {
    return c.json({ error: 'Invalid identityId format' }, 400);
  }
  if (!body.postId || typeof body.postId !== 'string' || !/^\d{5,25}$/.test(body.postId)) {
    return c.json({ error: 'postId must be a numeric tweet id' }, 400);
  }
  if (!body.points || typeof body.points !== 'number' || body.points < 1 || body.points > 30) {
    return c.json({ error: 'points must be 1-30' }, 400);
  }
  // walletAddress is optional; if present, validate Sui format
  let walletAddress: string | null = null;
  if (body.walletAddress !== undefined && body.walletAddress !== null && body.walletAddress !== '') {
    if (typeof body.walletAddress !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(body.walletAddress)) {
      return c.json({ error: 'Invalid walletAddress format (expected 0x + 64 hex chars)' }, 400);
    }
    walletAddress = body.walletAddress.toLowerCase();
  }

  const finalPoints = body.points;
  const txDigest = `creatorpost:${body.postId}`;

  const result = await pointsDb`
    INSERT INTO activity_points (
      tx_digest, tx_sequence_number, tx_timestamp,
      wallet_address, identity_id,
      category, activity_type,
      base_points, volume_tier, genesis_multiplier, final_points,
      event_seq
    ) VALUES (
      ${txDigest}, 0, NOW(),
      ${walletAddress}, ${body.identityId},
      'ecosystem-bonus-creator-posts', 'creator-post-reward',
      ${finalPoints}, 1.0, 1.0, ${finalPoints},
      0
    )
    ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
  `;

  const created = result.count > 0;

  console.log(
    `[CreatorPost] Reward: ${body.postId} -> identity=${body.identityId.slice(0, 16)}... ${finalPoints}pts` +
    `${created ? '' : ' (duplicate, skipped)'}`,
  );

  return c.json({
    created,
    txDigest,
    finalPoints,
    postId: body.postId,
  });
});

// POST /api/v1/points/onboarding-bonus
// Internal endpoint for nasun-website Lambdas to grant onboarding bonus points
// to referral-activated users on their first social action.
// Uses ecosystem-bonus-onboard category. Idempotency via PG UNIQUE
// (tx_digest, activity_type, event_seq) — txDigest is `onboard-{kind}:{externalId}`.
const ONBOARDING_BONUS_POINTS = {
  'follow-nasun': 25,
  'x-link': 25,
  'google-link': 10,
  'telegram-link': 10,
} as const;
type OnboardingKind = keyof typeof ONBOARDING_BONUS_POINTS;

// Per-kind externalId validation. Google externalId is a Cognito identityId
// (federated identity is stable across re-login for the same Google account).
const ONBOARDING_EXTERNAL_ID_REGEX: Record<OnboardingKind, RegExp> = {
  'follow-nasun': /^\d{1,25}$/,
  'x-link': /^\d{1,25}$/,
  'google-link': /^[\w-]+:[\w-]{36}$/,
  'telegram-link': /^\d{1,25}$/,
};

app.post('/onboarding-bonus', requireInternalApiKey('ONBOARDING_BONUS_API_KEY'), async (c) => {
  if (!pointsDb) {
    return c.json({ error: 'points_not_configured' }, 503);
  }

  const body = await c.req.json<{
    identityId?: string;
    walletAddress?: string;
    kind?: string;
    externalId?: string;
  }>();

  if (!body.identityId || !IDENTITY_ID_PATTERN.test(body.identityId)) {
    return c.json({ error: 'Invalid identityId' }, 400);
  }
  if (!body.kind || !(body.kind in ONBOARDING_BONUS_POINTS)) {
    return c.json({ error: 'Invalid kind' }, 400);
  }
  const kind = body.kind as OnboardingKind;
  if (!body.externalId || typeof body.externalId !== 'string' ||
      !ONBOARDING_EXTERNAL_ID_REGEX[kind].test(body.externalId)) {
    return c.json({ error: 'Invalid externalId for kind' }, 400);
  }

  let walletAddress: string | null = null;
  if (body.walletAddress !== undefined && body.walletAddress !== null && body.walletAddress !== '') {
    if (typeof body.walletAddress !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(body.walletAddress)) {
      return c.json({ error: 'Invalid walletAddress format' }, 400);
    }
    walletAddress = body.walletAddress.toLowerCase();
  }

  const points = ONBOARDING_BONUS_POINTS[kind];
  const txDigest = `onboard-${kind}:${body.externalId}`;

  const result = await pointsDb`
    INSERT INTO activity_points (
      tx_digest, tx_sequence_number, tx_timestamp,
      wallet_address, identity_id,
      category, activity_type,
      base_points, volume_tier, genesis_multiplier, final_points,
      event_seq
    ) VALUES (
      ${txDigest}, 0, NOW(),
      ${walletAddress}, ${body.identityId},
      'ecosystem-bonus-onboard', ${kind},
      ${points}, 1.0, 1.0, ${points},
      0
    )
    ON CONFLICT (tx_digest, activity_type, event_seq) DO NOTHING
  `;

  const created = result.count > 0;

  console.log(
    `[onboarding-bonus] decision=${created ? 'granted' : 'dup'} ` +
    `id=${body.identityId.slice(0, 16)}... kind=${kind} points=${points}`,
  );

  return c.json({ created, txDigest, points });
});

// GET /api/v1/points/referral-eligibility-signals/:identityId
// Internal endpoint: returns raw signals used by the referral handler Lambda
// to decide whether the caller qualifies for a referral code. Decision policy
// lives in the handler; this endpoint only reports facts.
app.get(
  '/referral-eligibility-signals/:identityId',
  requireInternalApiKey('REFERRAL_MAPPINGS_API_KEY'),
  async (c) => {
    if (!pointsDb) {
      return c.json({ error: 'points_not_configured' }, 503);
    }

    const identityId = c.req.param('identityId');
    if (!identityId || !IDENTITY_ID_PATTERN.test(identityId)) {
      return c.json({ error: 'invalid_identity_id' }, 400);
    }

    const activationsCacheReady = getActivationsCacheSize() > 0;
    const gpHeld = activationsCacheReady ? hasGenesisPass(identityId) : false;

    const getSignals = cached(
      `referral-eligibility-${identityId}`,
      60 * 1000,
      async () => {
        const [govRow] = await pointsDb!`
          SELECT 1
          FROM activity_points
          WHERE identity_id = ${identityId}
            AND category = 'governance'
            AND activity_type = 'vote'
            AND NOT flagged
          LIMIT 1
        `;
        const [bonusRow] = await pointsDb!`
          SELECT COALESCE(SUM(final_points), 0)::float8 as total
          FROM activity_points
          WHERE identity_id = ${identityId}
            AND category IN (
              'ecosystem-bonus-creator-posts',
              'ecosystem-bonus-bugreport',
              'ecosystem-bonus-feedback'
            )
            AND NOT flagged
        `;
        return {
          hasGovernanceVote: !!govRow,
          adminCuratedBonusTotal: Number(bonusRow?.total ?? 0),
        };
      },
    );

    const sql = await getSignals();

    c.header('Cache-Control', 'no-store');
    return c.json({
      hasGovernanceVote: sql.hasGovernanceVote,
      hasGenesisPass: gpHeld,
      adminCuratedBonusTotal: sql.adminCuratedBonusTotal,
      activationsCacheReady,
    });
  },
);

// GET /api/v1/points/health
app.get('/health', async (c) => {
  const health = await getScannerHealth();
  c.header('Cache-Control', 'no-cache');
  return c.json({ data: health });
});

export default app;
