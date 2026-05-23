/**
 * Agent Leaderboard Daily Cron
 *
 * Runs once at UTC 01:00 (after nsi-compute settles). Reads aer_records
 * joined with agent_profiles, computes per-agent metrics for the
 * trailing 7d and 30d windows, then upserts into agent_leaderboard_daily.
 *
 * Metrics computed:
 *   - trade_count_30d   : # attributed AER rows (non-null agent_profile_id)
 *   - win_rate_30d      : share of rows with action_outcome = 1 (success)
 *   - total_profit_usd  : SUM(payment_amount) / 1e9 (rough NSN-to-USD proxy;
 *                         replaced by vault NAV in Phase 5)
 *   - last_active_at    : MAX(settled_at) in the 30d window
 *   - roi_7d            : payment_amount sum 7d / 30d ratio (relative activity
 *                         proxy until vault integration provides real PnL)
 *   - tier              : agent owner's current NSI tier from user_nsi table
 */

import { sql } from '../db.js';

const CRON_HOUR_UTC = 1; // 01:00 UTC daily

let cronTimer: ReturnType<typeof setTimeout> | null = null;

async function ensureSchema(): Promise<void> {
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS agent_leaderboard_daily (
      snapshot_date      date        NOT NULL,
      agent_profile_id   text        NOT NULL,
      operator_wallet    text        NOT NULL,
      agent_name         text        NOT NULL,
      metric_roi_7d      numeric,
      metric_total_profit_usd numeric,
      trade_count_30d    int         NOT NULL DEFAULT 0,
      win_rate_30d       numeric,
      last_active_at     timestamptz,
      tier               smallint,
      PRIMARY KEY (snapshot_date, agent_profile_id)
    )
  `);
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS idx_ald_snapshot_date
      ON agent_leaderboard_daily(snapshot_date DESC)
  `);
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS idx_ald_profile_id
      ON agent_leaderboard_daily(agent_profile_id, snapshot_date DESC)
  `);
}

async function runLeaderboardSnapshot(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const now = Date.now();
  const ms30d = 30 * 24 * 60 * 60 * 1000;
  const ms7d  =  7 * 24 * 60 * 60 * 1000;
  const cutoff30d = now - ms30d;
  const cutoff7d  = now - ms7d;

  // Aggregate AER rows per agent over 30d, join agent_profiles + user_nsi tier.
  // user_nsi lives in nasun_points DB on same host — cross-schema query works
  // because both schemas are in the same PostgreSQL instance.
  const rows = await sql<{
    agent_profile_id: string;
    operator_wallet: string;
    agent_name: string;
    trade_count_30d: number;
    win_count_30d: number;
    total_payment_30d: string;
    total_payment_7d: string;
    last_active_ms: string;
    tier: number | null;
  }[]>`
    SELECT
      a.agent_profile_id,
      ap.owner          AS operator_wallet,
      ap.name           AS agent_name,
      COUNT(*)          AS trade_count_30d,
      SUM(CASE WHEN a.action_outcome = 1 THEN 1 ELSE 0 END) AS win_count_30d,
      SUM(a.payment_amount)::text                            AS total_payment_30d,
      SUM(CASE WHEN a.settled_at >= ${String(cutoff7d)}
               THEN a.payment_amount ELSE 0 END)::text       AS total_payment_7d,
      MAX(a.settled_at)::text                                AS last_active_ms,
      un.tier
    FROM aer_records a
    JOIN agent_profiles ap ON ap.profile_id = a.agent_profile_id
    LEFT JOIN nasun_points.user_nsi un ON un.wallet_address = ap.owner
    WHERE a.agent_profile_id IS NOT NULL
      AND a.settled_at >= ${String(cutoff30d)}
    GROUP BY a.agent_profile_id, ap.owner, ap.name, un.tier
    HAVING COUNT(*) > 0
  `;

  if (rows.length === 0) {
    console.log('[agent-leaderboard] no attributed AER rows in 30d window, skipping');
    return;
  }

  for (const row of rows) {
    const tradeCount = Number(row.trade_count_30d);
    const winCount = Number(row.win_count_30d);
    const totalPayment30d = BigInt(row.total_payment_30d ?? '0');
    const totalPayment7d  = BigInt(row.total_payment_7d  ?? '0');
    const lastActiveAt = row.last_active_ms
      ? new Date(Number(row.last_active_ms)).toISOString()
      : null;
    const winRate = tradeCount > 0 ? winCount / tradeCount : null;
    // Rough USD proxy: sum(payment_amount) is in NSN base units (1e9 = 1 NSN).
    // Placeholder until vault NAV integration (Phase 5).
    const totalProfitUsd = Number(totalPayment30d) / 1e9;
    // roi_7d: ratio of 7d payment to 30d payment. Ranges 0..1 (1 = all recent).
    const roi7d = Number(totalPayment30d) > 0
      ? Number(totalPayment7d) / Number(totalPayment30d)
      : null;

    await sql`
      INSERT INTO agent_leaderboard_daily
        (snapshot_date, agent_profile_id, operator_wallet, agent_name,
         metric_roi_7d, metric_total_profit_usd,
         trade_count_30d, win_rate_30d, last_active_at, tier)
      VALUES (
        ${today}::date, ${row.agent_profile_id}, ${row.operator_wallet}, ${row.agent_name},
        ${roi7d}, ${totalProfitUsd},
        ${tradeCount}, ${winRate}, ${lastActiveAt}::timestamptz, ${row.tier ?? null}
      )
      ON CONFLICT (snapshot_date, agent_profile_id) DO UPDATE SET
        operator_wallet        = EXCLUDED.operator_wallet,
        agent_name             = EXCLUDED.agent_name,
        metric_roi_7d          = EXCLUDED.metric_roi_7d,
        metric_total_profit_usd= EXCLUDED.metric_total_profit_usd,
        trade_count_30d        = EXCLUDED.trade_count_30d,
        win_rate_30d           = EXCLUDED.win_rate_30d,
        last_active_at         = EXCLUDED.last_active_at,
        tier                   = EXCLUDED.tier
    `;
  }

  console.log(`[agent-leaderboard] snapshot ${today}: ${rows.length} agents`);
}

function msUntilNextRun(): number {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(CRON_HOUR_UTC, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

export async function startAgentLeaderboard(): Promise<void> {
  if (process.env.ENABLE_AGENT_LEADERBOARD !== 'true') {
    console.log('[agent-leaderboard] ENABLE_AGENT_LEADERBOARD != true, skipping');
    return;
  }

  console.log('[agent-leaderboard] initializing schema');
  await ensureSchema();

  const schedule = (): void => {
    const delay = msUntilNextRun();
    console.log(`[agent-leaderboard] next run in ${Math.round(delay / 60000)}m`);
    cronTimer = setTimeout(async () => {
      try {
        await runLeaderboardSnapshot();
      } catch (err) {
        console.error('[agent-leaderboard] snapshot error:', err instanceof Error ? err.message : String(err));
      } finally {
        schedule();
      }
    }, delay);
    if (cronTimer && typeof cronTimer.unref === 'function') cronTimer.unref();
  };

  schedule();
  console.log('[agent-leaderboard] cron scheduled (daily UTC 01:00)');
}
