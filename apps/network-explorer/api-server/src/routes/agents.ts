/**
 * /api/v1/agents — Agent Leaderboard API (Phase 2)
 *
 *   GET /leaderboard?metric={profit|trades|win_rate}&window={7d|30d}&limit=50
 *     → latest daily snapshot sorted by metric
 *
 *   GET /:profile_id
 *     → agent detail: profile + recent AER records (last 20)
 */

import { Hono } from 'hono';
import { sql } from '../db.js';

const app = new Hono();

const SUI_ADDRESS_RE = /^0x[0-9a-f]{64}$/;
const VALID_METRICS = new Set(['profit', 'trades', 'win_rate']);
const VALID_WINDOWS = new Set(['7d', '30d']);
const MAX_LIMIT = 100;

type LeaderboardRow = {
  rank: number;
  agent_profile_id: string;
  agent_name: string;
  operator_wallet: string;
  metric_value: string | null;
  trade_count_30d: number;
  win_rate_30d: string | null;
  last_active_at: string | null;
  tier: number | null;
};

// GET /api/v1/agents/leaderboard
app.get('/leaderboard', async (c) => {
  const metric = c.req.query('metric') ?? 'profit';
  const window = c.req.query('window') ?? '30d';
  const limit = Math.min(Number(c.req.query('limit') ?? 50), MAX_LIMIT);

  if (!VALID_METRICS.has(metric)) {
    return c.json({ error: 'invalid_metric', valid: [...VALID_METRICS] }, 400);
  }
  if (!VALID_WINDOWS.has(window)) {
    return c.json({ error: 'invalid_window', valid: [...VALID_WINDOWS] }, 400);
  }

  const orderCol =
    metric === 'profit'   ? 'metric_total_profit_usd' :
    metric === 'trades'   ? 'trade_count_30d' :
    /* win_rate */           'win_rate_30d';

  const rows = await sql<LeaderboardRow[]>`
    SELECT
      ROW_NUMBER() OVER (ORDER BY ${sql(orderCol)} DESC NULLS LAST) AS rank,
      agent_profile_id,
      agent_name,
      operator_wallet,
      ${sql(orderCol)}::text AS metric_value,
      trade_count_30d,
      win_rate_30d::text,
      last_active_at::text,
      tier
    FROM agent_leaderboard_daily
    WHERE snapshot_date = (
      SELECT MAX(snapshot_date) FROM agent_leaderboard_daily
    )
    ORDER BY ${sql(orderCol)} DESC NULLS LAST
    LIMIT ${limit}
  `;

  return c.json({ metric, window, rows });
});

// GET /api/v1/agents/:profile_id
app.get('/:profile_id', async (c) => {
  const profileId = c.req.param('profile_id').toLowerCase();
  if (!SUI_ADDRESS_RE.test(profileId)) {
    return c.json({ error: 'invalid_profile_id' }, 400);
  }

  const [profile] = await sql<{
    profile_id: string;
    owner: string;
    agent_address: string;
    name: string;
    role: string;
    capability_id: string | null;
    is_active: boolean;
    created_at_ms: string;
  }[]>`
    SELECT profile_id, owner, agent_address, name, role,
           capability_id, is_active, created_at_ms::text
    FROM agent_profiles
    WHERE profile_id = ${profileId}
  `;

  if (!profile) return c.json({ error: 'not_found' }, 404);

  const recentAer = await sql<{
    object_id: string;
    action_type: string | null;
    action_outcome: number | null;
    payment_amount: string;
    model_name: string;
    settled_at: string;
    event_class: number | null;
  }[]>`
    SELECT object_id, action_type, action_outcome,
           payment_amount::text, model_name, settled_at::text, event_class
    FROM aer_records
    WHERE agent_profile_id = ${profileId}
    ORDER BY settled_at DESC
    LIMIT 20
  `;

  const [latest] = await sql<{
    trade_count_30d: number;
    win_rate_30d: string | null;
    metric_total_profit_usd: string | null;
    tier: number | null;
  }[]>`
    SELECT trade_count_30d, win_rate_30d::text,
           metric_total_profit_usd::text, tier
    FROM agent_leaderboard_daily
    WHERE agent_profile_id = ${profileId}
    ORDER BY snapshot_date DESC
    LIMIT 1
  `;

  return c.json({ profile, stats: latest ?? null, recentAer });
});

export default app;
