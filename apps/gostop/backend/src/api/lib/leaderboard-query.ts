/**
 * Leaderboard SQL builder. Inputs are whitelisted to enums (no string concat
 * from user input touches the SQL) so postgres.js parameter binding is safe.
 *
 * Period semantics:
 *   - 'all' uses the gostop.player_stats matview (lifetime aggregates).
 *   - 24h/7d/30d run an on-the-fly aggregate against gostop.game_round with a
 *     timestamp_ms BETWEEN window (matview is lifetime-only by design).
 *
 * Game semantics:
 *   - 'all' = no game_id filter
 *   - 1..6  = game_id = N (CHECK constraint in schema enforces range)
 *
 * Metric semantics:
 *   - net_pnl: SUM(payout) - SUM(bet_amount)
 *   - volume:  SUM(bet_amount)
 *   - rounds:  COUNT(*)
 *
 * `final` rows only (status='final'). `unclaimed_expired` rows count as
 * house-favorable but are excluded from leaderboard to keep semantics clean.
 */

import type { Sql } from 'postgres';

export type Period = '24h' | '7d' | '30d' | 'all';
export type GameFilter = 'all' | 1 | 2 | 3 | 4 | 5 | 6;
export type Metric = 'net_pnl' | 'volume' | 'rounds';

export type LeaderboardRow = {
  rank: number;
  player: string;
  rounds: number;
  total_bet: string;
  total_payout: string;
  net_pnl: string;
  last_played_ms: number | null;
};

const PERIOD_WINDOW_MS: Record<Exclude<Period, 'all'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d':  7  * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

function metricExpr(metric: Metric): string {
  switch (metric) {
    case 'net_pnl': return '(total_payout - total_bet)';
    case 'volume':  return 'total_bet';
    case 'rounds':  return 'rounds';
  }
}

/**
 * Build & execute a leaderboard query. Returns rows ordered by metric DESC,
 * including a server-side rank starting at 1. `excludePlayers` lets the API
 * drop `feed_visibility='opt-out'` wallets without baking the join into SQL.
 */
export async function queryLeaderboard(
  sql: Sql,
  opts: {
    period: Period;
    game: GameFilter;
    metric: Metric;
    limit: number;
    excludePlayers?: string[];
  },
): Promise<LeaderboardRow[]> {
  const { period, game, metric, limit } = opts;
  const exclude = opts.excludePlayers ?? [];
  const metricSql = metricExpr(metric);

  // Period filter: matview for 'all', range query otherwise.
  if (period === 'all') {
    // Pull from matview; apply game filter via re-aggregation if needed.
    if (game === 'all') {
      const rows = await sql<LeaderboardRow[]>`
        SELECT
          player,
          rounds::int                     AS rounds,
          total_bet::text                 AS total_bet,
          total_payout::text              AS total_payout,
          (total_payout - total_bet)::text AS net_pnl,
          last_played_ms,
          ROW_NUMBER() OVER (ORDER BY ${sql.unsafe(metricSql)} DESC, player ASC)::int AS rank
        FROM gostop.player_stats
        WHERE ${exclude.length > 0 ? sql`player NOT IN ${sql(exclude)}` : sql`TRUE`}
        ORDER BY ${sql.unsafe(metricSql)} DESC, player ASC
        LIMIT ${limit}
      `;
      return rows;
    }
    // Per-game lifetime: matview is across-games, so fall through to range query
    // with a wide-open window. Keeps a single code path for per-game stats.
  }

  const nowMs = Date.now();
  const sinceMs = period === 'all' ? 0 : nowMs - PERIOD_WINDOW_MS[period];

  const rows = await sql<LeaderboardRow[]>`
    WITH agg AS (
      SELECT
        player,
        COUNT(*)::bigint                       AS rounds,
        COALESCE(SUM(bet_amount), 0)           AS total_bet,
        COALESCE(SUM(payout), 0)               AS total_payout,
        MAX(timestamp_ms)                      AS last_played_ms
      FROM gostop.game_round
      WHERE status = 'final'
        AND timestamp_ms >= ${sinceMs}
        ${game === 'all' ? sql`` : sql`AND game_id = ${game}`}
        ${exclude.length > 0 ? sql`AND player NOT IN ${sql(exclude)}` : sql``}
      GROUP BY player
    )
    SELECT
      player,
      rounds::int                       AS rounds,
      total_bet::text                   AS total_bet,
      total_payout::text                AS total_payout,
      (total_payout - total_bet)::text  AS net_pnl,
      last_played_ms,
      ROW_NUMBER() OVER (ORDER BY ${sql.unsafe(metricSql)} DESC, player ASC)::int AS rank
    FROM agg
    ORDER BY ${sql.unsafe(metricSql)} DESC, player ASC
    LIMIT ${limit}
  `;
  return rows;
}

/**
 * Lookup the requesting player's own row for `/leaderboard/me`. Returns the
 * player's aggregate plus their rank computed via COUNT(*) FILTER on the
 * same exclusion + window the public board uses. Two round-trips, both
 * bounded — no full-table transport to Node.
 *
 * Returns null when the player has no `final` rounds in the window.
 */
export async function queryLeaderboardForPlayer(
  sql: Sql,
  opts: {
    player: string;
    period: Period;
    game: GameFilter;
    metric: Metric;
    excludePlayers?: string[];
  },
): Promise<LeaderboardRow | null> {
  const { player, period, game, metric } = opts;
  const exclude = opts.excludePlayers ?? [];
  const metricSql = metricExpr(metric);

  const nowMs = Date.now();
  const sinceMs = period === 'all' ? 0 : nowMs - PERIOD_WINDOW_MS[period];

  // Step 1: aggregate the player's own stats over the same window.
  const selfRows = await sql<{
    rounds: number;
    total_bet: string;
    total_payout: string;
    net_pnl: string;
    last_played_ms: number | null;
  }[]>`
    SELECT
      COUNT(*)::int                          AS rounds,
      COALESCE(SUM(bet_amount), 0)::text     AS total_bet,
      COALESCE(SUM(payout), 0)::text         AS total_payout,
      (COALESCE(SUM(payout), 0) - COALESCE(SUM(bet_amount), 0))::text AS net_pnl,
      MAX(timestamp_ms)                      AS last_played_ms
    FROM gostop.game_round
    WHERE status = 'final'
      AND player = ${player}
      AND timestamp_ms >= ${sinceMs}
      ${game === 'all' ? sql`` : sql`AND game_id = ${game}`}
  `;
  const self = selfRows[0];
  if (!self || self.rounds === 0) return null;

  // Step 2: rank = 1 + number of other players (with opt-outs excluded) whose
  // metric strictly beats ours, plus those tied but tie-breaking ahead by
  // player ASC — matches the LIMIT query's ORDER BY for stable ranks.
  //
  // The caller is always included in the ranking window even if their own
  // wallet is in `exclude`: /me shows "where you would rank if visible".
  // Only OTHER opt-out players are filtered out.
  const otherExclude = exclude.filter((p) => p !== player);
  const rankRows = await sql<{ rank: number }[]>`
    WITH agg AS (
      SELECT
        player,
        COALESCE(SUM(bet_amount), 0)           AS total_bet,
        COALESCE(SUM(payout), 0)               AS total_payout,
        COUNT(*)::bigint                       AS rounds
      FROM gostop.game_round
      WHERE status = 'final'
        AND timestamp_ms >= ${sinceMs}
        ${game === 'all' ? sql`` : sql`AND game_id = ${game}`}
        ${otherExclude.length > 0 ? sql`AND player NOT IN ${sql(otherExclude)}` : sql``}
      GROUP BY player
    ), me AS (
      SELECT ${sql.unsafe(metricSql)} AS m FROM agg WHERE player = ${player}
    )
    SELECT (1 + COUNT(*))::int AS rank
    FROM agg, me
    WHERE agg.player <> ${player}
      AND (${sql.unsafe(metricSql)} > me.m
           OR (${sql.unsafe(metricSql)} = me.m AND agg.player < ${player}))
  `;
  const rank = rankRows[0]?.rank ?? 0;

  return {
    rank,
    player,
    rounds: self.rounds,
    total_bet: self.total_bet,
    total_payout: self.total_payout,
    net_pnl: self.net_pnl,
    last_played_ms: self.last_played_ms,
  };
}
