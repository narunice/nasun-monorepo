import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { POINTS } from './leaderboard-types.js';
import type {
  LeaderboardConfig,
  TradeFillRow,
  TraderStatsRow,
  TraderPnlStatsRow,
  TraderPointsRow,
  BalanceManagerRow,
  CompetitionRow,
  CompetitionResultRow,
  CompetitionStatus,
  Period,
  VALID_PERIODS,
  OrderEventRow,
  OrderEventType,
} from './leaderboard-types.js';

let db: Database.Database | null = null;

// ===== Initialization =====

export function initLeaderboardStore(config: LeaderboardConfig): void {
  mkdirSync(dirname(config.leaderboardDbPath), { recursive: true });

  db = new Database(config.leaderboardDbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = FULL');
  db.pragma('auto_vacuum = INCREMENTAL');
  // Multi-thread access (main indexer writer + aggregator worker writer): WAL allows
  // concurrent readers but serializes writers. Without busy_timeout the second writer
  // gets SQLITE_BUSY immediately. 30s covers the worst-case worker transaction
  // (replaceTraderPnlStats: 4 periods x DELETE + 20K INSERT inside one tx, observed
  // ~4s each but variance is high. 5s margin was insufficient (2026-05-14 incident).
  db.pragma('busy_timeout = 30000');

  // Performance pragmas (mmap_size, cache_size, temp_store) deliberately left at defaults.
  // 2026-05-13: tried mmap=1GB+cache=100MB+temp=MEMORY → RSS exceeded max_memory_restart=700M
  // and triggered OOM loop. Even temp_store=MEMORY alone pushed RSS past 432MB during initial
  // aggregation. This 3.8GB RAM host has too little headroom for SQLite cache tuning until
  // max_memory_restart is raised or aggregator is moved off the main process.

  // Recover leftover WAL frames from previous unclean shutdown.
  try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* ignore */ }

  db.exec(`
    CREATE TABLE IF NOT EXISTS indexer_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS balance_managers (
      balance_manager_id TEXT PRIMARY KEY,
      owner_address TEXT NOT NULL,
      discovered_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_bm_owner
      ON balance_managers(owner_address);

    CREATE TABLE IF NOT EXISTS trade_fills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tx_digest TEXT NOT NULL,
      event_seq TEXT NOT NULL,
      pool_id TEXT NOT NULL,
      maker_address TEXT NOT NULL,
      taker_address TEXT NOT NULL,
      price TEXT NOT NULL,
      base_quantity TEXT NOT NULL,
      quote_quantity TEXT NOT NULL,
      taker_is_bid INTEGER NOT NULL,
      is_yes INTEGER,
      timestamp_ms INTEGER NOT NULL,
      UNIQUE(tx_digest, event_seq)
    );

    -- Prediction-market resolution outcomes. Populated by the indexer's
    -- MarketResolved/MarketCancelled pollers. computePredictionPnl joins
    -- this against trade_fills filtered by pool_id LIKE 'prediction:%'.
    CREATE TABLE IF NOT EXISTS prediction_markets (
      market_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      outcome INTEGER,
      resolved_at_ms INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pred_markets_resolved
      ON prediction_markets(resolved_at_ms DESC);

    CREATE INDEX IF NOT EXISTS idx_fills_timestamp
      ON trade_fills(timestamp_ms DESC);
    CREATE INDEX IF NOT EXISTS idx_fills_maker
      ON trade_fills(maker_address, timestamp_ms DESC);
    CREATE INDEX IF NOT EXISTS idx_fills_taker
      ON trade_fills(taker_address, timestamp_ms DESC);
    CREATE INDEX IF NOT EXISTS idx_fills_pool_maker
      ON trade_fills(pool_id, maker_address, timestamp_ms DESC);
    CREATE INDEX IF NOT EXISTS idx_fills_pool_taker
      ON trade_fills(pool_id, taker_address, timestamp_ms DESC);
    -- Covering indexes for runPnlAggregation maker/taker UNION ALL scans.
    -- Created in prod 2026-05-13 after blocking incident; formalized here so
    -- new environments get them automatically.
    CREATE INDEX IF NOT EXISTS idx_fills_cover_maker
      ON trade_fills(timestamp_ms, maker_address, pool_id, quote_quantity, base_quantity, taker_is_bid);
    CREATE INDEX IF NOT EXISTS idx_fills_cover_taker
      ON trade_fills(timestamp_ms, taker_address, pool_id, quote_quantity, base_quantity, taker_is_bid);

    CREATE TABLE IF NOT EXISTS trader_stats (
      address TEXT NOT NULL,
      period TEXT NOT NULL,
      volume_quote TEXT NOT NULL,
      trade_count INTEGER NOT NULL,
      unique_pools INTEGER NOT NULL,
      last_trade_at INTEGER NOT NULL,
      rank INTEGER NOT NULL DEFAULT 0,
      prev_rank INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (address, period)
    );

    CREATE INDEX IF NOT EXISTS idx_stats_period_rank
      ON trader_stats(period, rank ASC);

    CREATE TABLE IF NOT EXISTS competitions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      start_ms INTEGER NOT NULL,
      end_ms INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'upcoming',
      prize_description TEXT NOT NULL DEFAULT '',
      min_volume TEXT NOT NULL DEFAULT '0',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_comp_status
      ON competitions(status);
    CREATE INDEX IF NOT EXISTS idx_comp_dates
      ON competitions(start_ms, end_ms);

    CREATE TABLE IF NOT EXISTS competition_results (
      competition_id TEXT NOT NULL,
      address TEXT NOT NULL,
      volume_quote TEXT NOT NULL,
      trade_count INTEGER NOT NULL,
      rank INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (competition_id, address),
      FOREIGN KEY (competition_id) REFERENCES competitions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_cr_rank
      ON competition_results(competition_id, rank ASC);

    CREATE TABLE IF NOT EXISTS trader_pnl (
      address TEXT NOT NULL,
      period TEXT NOT NULL,
      realized_pnl TEXT NOT NULL,
      pnl_percent REAL NOT NULL DEFAULT 0,
      trade_count INTEGER NOT NULL DEFAULT 0,
      rank INTEGER NOT NULL DEFAULT 0,
      prev_rank INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (address, period)
    );

    CREATE INDEX IF NOT EXISTS idx_pnl_period_rank
      ON trader_pnl(period, rank ASC);

    CREATE TABLE IF NOT EXISTS trader_points (
      address TEXT PRIMARY KEY,
      total_points INTEGER NOT NULL DEFAULT 0,
      points_from_trades INTEGER NOT NULL DEFAULT 0,
      points_from_volume INTEGER NOT NULL DEFAULT 0,
      points_from_diversity INTEGER NOT NULL DEFAULT 0,
      points_from_pnl INTEGER NOT NULL DEFAULT 0,
      trade_count INTEGER NOT NULL DEFAULT 0,
      volume_quote TEXT NOT NULL DEFAULT '0',
      rank INTEGER NOT NULL DEFAULT 0,
      prev_rank INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_points_rank
      ON trader_points(rank ASC);

    CREATE TABLE IF NOT EXISTS order_events (
      tx_digest TEXT NOT NULL,
      event_seq TEXT NOT NULL,
      event_type TEXT NOT NULL,
      pool_id TEXT NOT NULL,
      balance_manager_id TEXT NOT NULL,
      owner_address TEXT NOT NULL,
      order_id TEXT NOT NULL,
      price TEXT NOT NULL,
      quantity TEXT NOT NULL,
      is_bid INTEGER NOT NULL,
      timestamp_ms INTEGER NOT NULL,
      PRIMARY KEY (tx_digest, event_seq)
    );

    CREATE INDEX IF NOT EXISTS idx_order_events_owner_pool
      ON order_events(owner_address, pool_id, timestamp_ms DESC);
    CREATE INDEX IF NOT EXISTS idx_order_events_owner_ts
      ON order_events(owner_address, timestamp_ms DESC);
    CREATE INDEX IF NOT EXISTS idx_order_events_ts
      ON order_events(timestamp_ms);
  `);

  // Migration: add maker_order_id and taker_order_id to trade_fills (nullable for existing rows)
  const columns = db.prepare("PRAGMA table_info('trade_fills')").all() as Array<{ name: string }>;
  const columnNames = new Set(columns.map(c => c.name));
  if (!columnNames.has('maker_order_id')) {
    db.exec('ALTER TABLE trade_fills ADD COLUMN maker_order_id TEXT');
  }
  if (!columnNames.has('taker_order_id')) {
    db.exec('ALTER TABLE trade_fills ADD COLUMN taker_order_id TEXT');
  }
  // is_yes is nullable: NULL for spot fills (where the concept doesn't apply)
  // and for prediction fills indexed before this column existed. Backfill those
  // older prediction rows with a one-off script if PnL retroactivity matters.
  if (!columnNames.has('is_yes')) {
    db.exec('ALTER TABLE trade_fills ADD COLUMN is_yes INTEGER');
  }

  // Migration: add points_from_pnl to trader_points
  const pointsCols = db.prepare("PRAGMA table_info('trader_points')").all() as Array<{ name: string }>;
  const pointsColNames = new Set(pointsCols.map(c => c.name));
  if (!pointsColNames.has('points_from_pnl')) {
    db.exec('ALTER TABLE trader_points ADD COLUMN points_from_pnl INTEGER NOT NULL DEFAULT 0');
  }

  // Weekly leaderboard tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS trader_points_weekly (
      week_id TEXT NOT NULL,
      address TEXT NOT NULL,
      total_score INTEGER NOT NULL DEFAULT 0,
      score_from_trades INTEGER NOT NULL DEFAULT 0,
      score_from_volume INTEGER NOT NULL DEFAULT 0,
      score_from_diversity INTEGER NOT NULL DEFAULT 0,
      score_from_pnl INTEGER NOT NULL DEFAULT 0,
      score_from_prediction_pnl INTEGER NOT NULL DEFAULT 0,
      trade_count INTEGER NOT NULL DEFAULT 0,
      volume_quote TEXT NOT NULL DEFAULT '0',
      prediction_volume_quote TEXT NOT NULL DEFAULT '0',
      prediction_unique_markets INTEGER NOT NULL DEFAULT 0,
      prediction_realized_pnl TEXT NOT NULL DEFAULT '0',
      rank INTEGER NOT NULL DEFAULT 0,
      prev_rank INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      x_handle TEXT,
      has_google INTEGER NOT NULL DEFAULT 0,
      has_telegram INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (week_id, address)
    );

    CREATE INDEX IF NOT EXISTS idx_weekly_rank
      ON trader_points_weekly(week_id, rank ASC);

    -- weekly_score_snapshots was removed in 2026-04-17 refactor.
    -- Settlement state is now tracked in PostgreSQL (nasun_points.weekly_score_snapshots).
    -- settle-pado reads trader_points_weekly via GET /api/pado/internal/weekly-scores/:weekId.
  `);

  // Migrate: add social badge + prediction PnL columns if they don't exist yet (idempotent).
  const cols = (db!.prepare(`PRAGMA table_info(trader_points_weekly)`).all() as Array<{ name: string }>).map(c => c.name);
  if (!cols.includes('x_handle')) db!.prepare(`ALTER TABLE trader_points_weekly ADD COLUMN x_handle TEXT`).run();
  if (!cols.includes('has_google')) db!.prepare(`ALTER TABLE trader_points_weekly ADD COLUMN has_google INTEGER NOT NULL DEFAULT 0`).run();
  if (!cols.includes('has_telegram')) db!.prepare(`ALTER TABLE trader_points_weekly ADD COLUMN has_telegram INTEGER NOT NULL DEFAULT 0`).run();
  if (!cols.includes('score_from_prediction_pnl')) db!.prepare(`ALTER TABLE trader_points_weekly ADD COLUMN score_from_prediction_pnl INTEGER NOT NULL DEFAULT 0`).run();
  if (!cols.includes('prediction_volume_quote')) db!.prepare(`ALTER TABLE trader_points_weekly ADD COLUMN prediction_volume_quote TEXT NOT NULL DEFAULT '0'`).run();
  if (!cols.includes('prediction_unique_markets')) db!.prepare(`ALTER TABLE trader_points_weekly ADD COLUMN prediction_unique_markets INTEGER NOT NULL DEFAULT 0`).run();
  if (!cols.includes('prediction_realized_pnl')) db!.prepare(`ALTER TABLE trader_points_weekly ADD COLUMN prediction_realized_pnl TEXT NOT NULL DEFAULT '0'`).run();
}

export function getLeaderboardDb(): Database.Database {
  if (!db) throw new Error('Leaderboard store not initialized. Call initLeaderboardStore() first.');
  return db;
}

export function closeLeaderboardStore(): void {
  if (db) {
    try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* ignore */ }
    db.close();
    db = null;
  }
}

/**
 * Purge order events older than retention period.
 * Only order_events is safe to purge (not used by aggregation, PnL, or cost basis).
 * trade_fills must NOT be purged: "all" period leaderboard, points system,
 * and computeCostBasis() depend on complete fill history.
 */
export function purgeOldOrderEvents(retentionDays: number): number {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const result = getLeaderboardDb()
    .prepare('DELETE FROM order_events WHERE timestamp_ms < ?')
    .run(cutoff);
  return result.changes;
}

// ===== Indexer State =====

export function getIndexerState(key: string): string | null {
  const row = getLeaderboardDb()
    .prepare('SELECT value FROM indexer_state WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setIndexerState(key: string, value: string): void {
  const now = Date.now();
  getLeaderboardDb()
    .prepare(
      `INSERT INTO indexer_state (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, value, now);
}

// ===== Balance Manager Mapping =====

export function getBalanceManagerOwner(bmId: string): string | null {
  const row = getLeaderboardDb()
    .prepare('SELECT owner_address FROM balance_managers WHERE balance_manager_id = ?')
    .get(bmId) as { owner_address: string } | undefined;
  return row?.owner_address ?? null;
}

export function setBalanceManagerOwner(bmId: string, ownerAddress: string): void {
  getLeaderboardDb()
    .prepare(
      `INSERT OR IGNORE INTO balance_managers (balance_manager_id, owner_address, discovered_at)
       VALUES (?, ?, ?)`
    )
    .run(bmId, ownerAddress, Date.now());
}

// ===== Order Events =====

export function insertOrderEvent(event: OrderEventRow): boolean {
  const result = getLeaderboardDb()
    .prepare(
      `INSERT OR IGNORE INTO order_events
         (tx_digest, event_seq, event_type, pool_id, balance_manager_id,
          owner_address, order_id, price, quantity, is_bid, timestamp_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      event.tx_digest, event.event_seq, event.event_type,
      event.pool_id, event.balance_manager_id,
      event.owner_address, event.order_id,
      event.price, event.quantity,
      event.is_bid, event.timestamp_ms,
    );
  return result.changes > 0;
}

export function getOrderEventsByAddress(
  address: string,
  options: { pool?: string; limit?: number; cursor?: number } = {},
): { events: OrderEventRow[]; nextCursor: number | null; hasMore: boolean } {
  const ldb = getLeaderboardDb();
  const limit = Math.min(options.limit || 100, 200);
  const fetchLimit = limit + 1;

  let query: string;
  let params: unknown[];

  if (options.pool) {
    if (options.cursor) {
      query = `SELECT * FROM order_events
               WHERE owner_address = ? AND pool_id = ? AND timestamp_ms < ?
               ORDER BY timestamp_ms DESC LIMIT ?`;
      params = [address, options.pool, options.cursor, fetchLimit];
    } else {
      query = `SELECT * FROM order_events
               WHERE owner_address = ? AND pool_id = ?
               ORDER BY timestamp_ms DESC LIMIT ?`;
      params = [address, options.pool, fetchLimit];
    }
  } else {
    if (options.cursor) {
      query = `SELECT * FROM order_events
               WHERE owner_address = ? AND timestamp_ms < ?
               ORDER BY timestamp_ms DESC LIMIT ?`;
      params = [address, options.cursor, fetchLimit];
    } else {
      query = `SELECT * FROM order_events
               WHERE owner_address = ?
               ORDER BY timestamp_ms DESC LIMIT ?`;
      params = [address, fetchLimit];
    }
  }

  const rows = ldb.prepare(query).all(...params) as OrderEventRow[];
  const hasMore = rows.length > limit;
  const events = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && events.length > 0
    ? events[events.length - 1].timestamp_ms
    : null;

  return { events, nextCursor, hasMore };
}

export function getTotalOrderEventsCount(): number {
  const row = getLeaderboardDb()
    .prepare('SELECT COUNT(*) as count FROM order_events')
    .get() as { count: number };
  return row.count;
}

// ===== Trade Fills =====

export function insertTradeFill(fill: Omit<TradeFillRow, 'id'>): boolean {
  const result = getLeaderboardDb()
    .prepare(
      `INSERT OR IGNORE INTO trade_fills
         (tx_digest, event_seq, pool_id, maker_address, taker_address,
          maker_order_id, taker_order_id,
          price, base_quantity, quote_quantity, taker_is_bid, is_yes, timestamp_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      fill.tx_digest, fill.event_seq, fill.pool_id,
      fill.maker_address, fill.taker_address,
      fill.maker_order_id ?? null, fill.taker_order_id ?? null,
      fill.price, fill.base_quantity, fill.quote_quantity,
      fill.taker_is_bid, fill.is_yes ?? null,
      fill.timestamp_ms,
    );
  // changes === 0 means duplicate (INSERT OR IGNORE skipped)
  return result.changes > 0;
}

export function getTotalFillsCount(): number {
  const row = getLeaderboardDb()
    .prepare('SELECT COUNT(*) as count FROM trade_fills')
    .get() as { count: number };
  return row.count;
}

export interface PoolPricePoint {
  bucket_ms: number;
  close_price_raw: string; // DeepBook V3 raw price (divide by 1e9 for human)
}

/**
 * Hourly close prices for a pool over the last `hours` hours.
 * Bucket = floor(timestamp_ms / hour_ms). Close = last fill in each bucket.
 * Returns ascending by bucket_ms.
 */
export function getPoolPriceHistory(
  poolId: string,
  hours: number,
): PoolPricePoint[] {
  const bucketMs = 3_600_000;
  const sinceMs = Date.now() - hours * bucketMs;
  // Hardcode bucket size as SQL integer literal: better-sqlite3 binds JS
  // Numbers as REAL by default, which would turn (ts / 3600000) into float
  // division and defeat bucketing.
  const rows = getLeaderboardDb()
    .prepare(
      `SELECT bucket_ms, price AS close_price_raw FROM (
         SELECT
           (timestamp_ms / 3600000) * 3600000 AS bucket_ms,
           id,
           timestamp_ms,
           price,
           ROW_NUMBER() OVER (
             PARTITION BY (timestamp_ms / 3600000)
             ORDER BY timestamp_ms DESC, id DESC
           ) AS rn
         FROM trade_fills
         WHERE pool_id = ? AND timestamp_ms >= ?
       )
       WHERE rn = 1
       ORDER BY bucket_ms ASC`,
    )
    .all(poolId, sinceMs) as PoolPricePoint[];
  return rows;
}

// ===== Aggregation Queries =====

interface AggregatedTrader {
  address: string;
  volume_quote: string;
  trade_count: number;
  unique_pools: number;
  last_trade_at: number;
}

// Safety cap: well below SQLite MAX_VARIABLE_NUMBER=32766 (confirmed 32766 on bundled SQLite 3.49.2).
// Each pair = 1 parameter (canonical key "addrA:addrB"). Expected real-world size: ~100-200 pairs.
const MAX_WASH_PAIRS_CTE = 2000;

interface WashCte {
  cte: string;
  filterClause: string;
  params: string[];
}

/**
 * Build a SQLite CTE for wash-trading pair exclusion.
 *
 * Addresses in trade_fills are stored as 0x+lowercase hex (Sui RPC canonical format).
 * buildSameIdentityPairs() also lowercases all addresses, so no LOWER() is needed.
 *
 * The filterClause is placed inside each UNION ALL branch WHERE clause.
 * Both maker_address and taker_address are accessible there even if not SELECTed,
 * because WHERE has access to all columns of the FROM table (SQL standard).
 *
 * Uses NOT EXISTS (faster than NOT IN for subquery matching in SQLite).
 */
function buildWashPairsCte(washPairs?: Set<string>): WashCte | null {
  if (!washPairs || washPairs.size === 0) return null;

  if (washPairs.size > MAX_WASH_PAIRS_CTE) {
    console.warn(`[LeaderboardStore] washPairs.size=${washPairs.size} exceeds CTE limit (${MAX_WASH_PAIRS_CTE}), skipping wash filter`);
    return null;
  }

  const values = [...washPairs].map(() => '(?)').join(', ');
  return {
    cte: `WITH wash_pairs(k) AS (VALUES ${values})`,
    // Canonical key matches buildSameIdentityPairs(): lexicographically smaller address first.
    filterClause: `
      AND NOT EXISTS (
        SELECT 1 FROM wash_pairs
        WHERE k = CASE WHEN maker_address < taker_address
                       THEN maker_address || ':' || taker_address
                       ELSE taker_address || ':' || maker_address
                  END
      )`,
    params: [...washPairs],
  };
}

/**
 * Aggregate trading volume per trader for a given period.
 * Both maker and taker sides count toward a trader's volume.
 * Returns top N traders sorted by volume descending.
 */
export function aggregateTraderVolume(
  cutoffMs: number,
  excludedAddresses: Set<string>,
  limit: number = 100,
  washPairs?: Set<string>,
): AggregatedTrader[] {
  const ldb = getLeaderboardDb();

  const excludeList = [...excludedAddresses];
  const excludePlaceholders = excludeList.length > 0
    ? `AND address NOT IN (${excludeList.map(() => '?').join(',')})`
    : '';

  const wash = buildWashPairsCte(washPairs);
  const cutoff = cutoffMs > 0 ? cutoffMs : 0;

  const query = `
    ${wash?.cte ?? ''}
    SELECT
      address,
      CAST(SUM(CAST(quote_volume AS INTEGER)) AS TEXT) as volume_quote,
      COUNT(*) as trade_count,
      COUNT(DISTINCT pool_id) as unique_pools,
      MAX(timestamp_ms) as last_trade_at
    FROM (
      SELECT maker_address as address, quote_quantity as quote_volume, pool_id, timestamp_ms
      FROM trade_fills WHERE timestamp_ms >= ?
      ${wash?.filterClause ?? ''}
      UNION ALL
      SELECT taker_address as address, quote_quantity as quote_volume, pool_id, timestamp_ms
      FROM trade_fills WHERE timestamp_ms >= ?
      ${wash?.filterClause ?? ''}
    )
    WHERE 1=1 ${excludePlaceholders}
    GROUP BY address
    ORDER BY SUM(CAST(quote_volume AS INTEGER)) DESC
    LIMIT ?
  `;

  // CTE params precede all positional params: they appear first in the query string.
  // wash.params count = washPairs.size (one param per canonical key string).
  const params = [
    ...(wash?.params ?? []),
    cutoff, cutoff,
    ...excludeList,
    limit,
  ];

  return ldb.prepare(query).all(...params) as AggregatedTrader[];
}

/**
 * Variant of aggregateTraderVolume for weekly scoring.
 * trade_count is capped per calendar day (UTC) using ROW_NUMBER window function,
 * so a trader doing all their trades on day 1 earns at most dailyCap × 1 counted trades,
 * not dailyCap × 7. Volume and unique_pools are still summed over all trades.
 */
export function aggregateWeeklyTraderVolume(
  cutoffMs: number,
  excludedAddresses: Set<string>,
  dailyCap: number,
  limit: number = 100,
  washPairs?: Set<string>,
): AggregatedTrader[] {
  const ldb = getLeaderboardDb();

  const excludeList = [...excludedAddresses];
  const excludePlaceholders = excludeList.length > 0
    ? `AND address NOT IN (${excludeList.map(() => '?').join(',')})`
    : '';
  const wash = buildWashPairsCte(washPairs);
  const cutoff = cutoffMs > 0 ? cutoffMs : 0;

  // Compose CTEs: wash_pairs (if present) then all_fills with per-day ROW_NUMBER.
  const ctePrefix = wash ? `${wash.cte},` : 'WITH';
  const filterClause = wash?.filterClause ?? '';

  const query = `
    ${ctePrefix} all_fills AS (
      SELECT address, pool_id, CAST(quote_volume AS INTEGER) as qv, timestamp_ms,
             ROW_NUMBER() OVER (
               PARTITION BY address, date(timestamp_ms / 1000, 'unixepoch')
               ORDER BY timestamp_ms
             ) AS day_rank
      FROM (
        SELECT maker_address AS address, quote_quantity AS quote_volume, pool_id, timestamp_ms,
               maker_address, taker_address
        FROM trade_fills WHERE timestamp_ms >= ?
        ${filterClause}
        UNION ALL
        SELECT taker_address AS address, quote_quantity AS quote_volume, pool_id, timestamp_ms,
               maker_address, taker_address
        FROM trade_fills WHERE timestamp_ms >= ?
        ${filterClause}
      )
      WHERE 1=1 ${excludePlaceholders}
    )
    SELECT
      address,
      CAST(SUM(qv) AS TEXT) AS volume_quote,
      SUM(CASE WHEN day_rank <= ? THEN 1 ELSE 0 END) AS trade_count,
      COUNT(DISTINCT pool_id) AS unique_pools,
      MAX(timestamp_ms) AS last_trade_at
    FROM all_fills
    GROUP BY address
    ORDER BY SUM(qv) DESC
    LIMIT ?
  `;

  const params = [
    ...(wash?.params ?? []),
    cutoff, cutoff,
    ...excludeList,
    dailyCap,
    limit,
  ];

  return ldb.prepare(query).all(...params) as AggregatedTrader[];
}

/**
 * Get current ranks for a period (for prev_rank tracking).
 */
export function getCurrentRanks(period: string): Map<string, number> {
  const rows = getLeaderboardDb()
    .prepare('SELECT address, rank FROM trader_stats WHERE period = ?')
    .all(period) as Array<{ address: string; rank: number }>;

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.address, row.rank);
  }
  return map;
}

/**
 * Replace trader stats for a period with new aggregated data.
 */
export function replaceTraderStats(
  period: string,
  traders: Array<{
    address: string;
    volumeQuote: string;
    tradeCount: number;
    uniquePools: number;
    lastTradeAt: number;
    rank: number;
    prevRank: number;
  }>,
): void {
  const ldb = getLeaderboardDb();
  const now = Date.now();

  const replaceStmt = ldb.prepare(
    `INSERT INTO trader_stats (address, period, volume_quote, trade_count, unique_pools, last_trade_at, rank, prev_rank, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(address, period) DO UPDATE SET
       volume_quote = excluded.volume_quote,
       trade_count = excluded.trade_count,
       unique_pools = excluded.unique_pools,
       last_trade_at = excluded.last_trade_at,
       rank = excluded.rank,
       prev_rank = excluded.prev_rank,
       updated_at = excluded.updated_at`
  );

  const tx = ldb.transaction(() => {
    // Remove entries not in new top list for this period
    const addresses = traders.map((t) => t.address);
    if (addresses.length > 0) {
      const placeholders = addresses.map(() => '?').join(',');
      ldb.prepare(
        `DELETE FROM trader_stats WHERE period = ? AND address NOT IN (${placeholders})`
      ).run(period, ...addresses);
    } else {
      ldb.prepare('DELETE FROM trader_stats WHERE period = ?').run(period);
    }

    for (const t of traders) {
      replaceStmt.run(
        t.address, period, t.volumeQuote, t.tradeCount,
        t.uniquePools, t.lastTradeAt, t.rank, t.prevRank, now,
      );
    }
  });

  tx();
}

// ===== Leaderboard Queries (for REST API) =====

export function getLeaderboard(
  period: string,
  limit: number = 50,
  offset: number = 0,
): TraderStatsRow[] {
  return getLeaderboardDb()
    .prepare(
      `SELECT address, period, volume_quote, trade_count, unique_pools,
              last_trade_at, rank, prev_rank, updated_at
       FROM trader_stats
       WHERE period = ?
       ORDER BY rank ASC
       LIMIT ? OFFSET ?`
    )
    .all(period, limit, offset) as TraderStatsRow[];
}

export function getTraderAllPeriodStats(address: string): TraderStatsRow[] {
  return getLeaderboardDb()
    .prepare(
      `SELECT address, period, volume_quote, trade_count, unique_pools,
              last_trade_at, rank, prev_rank, updated_at
       FROM trader_stats
       WHERE address = ?`
    )
    .all(address) as TraderStatsRow[];
}

export function getTraderFills(
  address: string,
  limit: number = 50,
): TradeFillRow[] {
  // Use UNION to leverage per-column indexes instead of OR (which causes full table scan)
  return getLeaderboardDb()
    .prepare(
      `SELECT * FROM (
         SELECT tx_digest, event_seq, pool_id, maker_address, taker_address,
                price, base_quantity, quote_quantity, taker_is_bid, timestamp_ms
         FROM trade_fills WHERE maker_address = ?
         UNION
         SELECT tx_digest, event_seq, pool_id, maker_address, taker_address,
                price, base_quantity, quote_quantity, taker_is_bid, timestamp_ms
         FROM trade_fills WHERE taker_address = ?
       ) ORDER BY timestamp_ms DESC LIMIT ?`
    )
    .all(address, address, limit + 1) as TradeFillRow[];
}

// ===== Feed Query (followed traders' fills) =====

export interface FeedFillRow {
  id: number;
  tx_digest: string;
  pool_id: string;
  address: string; // the followed trader's address
  maker_address: string;
  taker_address: string;
  price: string;
  base_quantity: string;
  quote_quantity: string;
  taker_is_bid: number;
  timestamp_ms: number;
}

/**
 * Get recent trade fills for a set of followed addresses.
 * Uses UNION ALL + JS dedup (same fill can appear as both maker and taker).
 * Leverages existing indexes: idx_fills_maker(maker_address, timestamp_ms DESC)
 * and idx_fills_taker(taker_address, timestamp_ms DESC).
 */
export function getFollowedTraderFills(
  addresses: string[],
  limit: number = 30,
  beforeTs?: number,
): { fills: FeedFillRow[]; hasMore: boolean } {
  if (addresses.length === 0) return { fills: [], hasMore: false };

  const placeholders = addresses.map(() => '?').join(',');
  const cursor = beforeTs ?? Date.now();
  const floor = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days

  const innerLimit = limit + 10; // margin for dedup
  const sql = `
    SELECT * FROM (
      SELECT * FROM (
        SELECT id, tx_digest, pool_id, maker_address as address,
               maker_address, taker_address,
               price, base_quantity, quote_quantity, taker_is_bid, timestamp_ms
        FROM trade_fills
        WHERE maker_address IN (${placeholders})
          AND timestamp_ms < ? AND timestamp_ms >= ?
        ORDER BY timestamp_ms DESC LIMIT ${innerLimit}
      )

      UNION ALL

      SELECT * FROM (
        SELECT id, tx_digest, pool_id, taker_address as address,
               maker_address, taker_address,
               price, base_quantity, quote_quantity, taker_is_bid, timestamp_ms
        FROM trade_fills
        WHERE taker_address IN (${placeholders})
          AND timestamp_ms < ? AND timestamp_ms >= ?
        ORDER BY timestamp_ms DESC LIMIT ${innerLimit}
      )
    )
    ORDER BY timestamp_ms DESC
  `;

  const params = [...addresses, cursor, floor, ...addresses, cursor, floor];
  const rows = getLeaderboardDb().prepare(sql).all(...params) as FeedFillRow[];

  // JS dedup: same fill(id) may appear from both maker and taker branches
  const seen = new Set<number>();
  const deduped: FeedFillRow[] = [];
  for (const row of rows) {
    if (!seen.has(row.id)) {
      seen.add(row.id);
      deduped.push(row);
      if (deduped.length > limit) break; // limit + 1 for hasMore
    }
  }

  const hasMore = deduped.length > limit;
  const result = hasMore ? deduped.slice(0, limit) : deduped;

  return { fills: result, hasMore };
}

// ===== Trade History API Queries =====

export interface TradeHistoryRow {
  id: number;
  tx_digest: string;
  event_seq: string;
  pool_id: string;
  maker_address: string;
  taker_address: string;
  maker_order_id: string | null;
  taker_order_id: string | null;
  price: string;
  base_quantity: string;
  quote_quantity: string;
  taker_is_bid: number;
  timestamp_ms: number;
}

/**
 * Get trade fills for a specific address with optional pool filter and cursor pagination.
 * Uses UNION to leverage per-column indexes (avoids OR full table scan).
 * Sorted by id DESC for stable cursor-based pagination.
 */
export function getTraderFillsByAddress(
  address: string,
  opts: { pool?: string; limit?: number; cursor?: number } = {},
): { fills: TradeHistoryRow[]; nextCursor: number | null; hasMore: boolean } {
  const ldb = getLeaderboardDb();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);

  // Build dynamic query: 2 variants (with/without pool filter)
  // Cursor filter: id < cursor (descending order)
  const cursorClause = opts.cursor != null ? 'AND id < ?' : '';
  const poolClause = opts.pool ? 'AND pool_id = ?' : '';

  const query = `
    SELECT * FROM (
      SELECT id, tx_digest, event_seq, pool_id, maker_address, taker_address,
             maker_order_id, taker_order_id,
             price, base_quantity, quote_quantity, taker_is_bid, timestamp_ms
      FROM trade_fills
      WHERE maker_address = ? ${cursorClause} ${poolClause}
      UNION
      SELECT id, tx_digest, event_seq, pool_id, maker_address, taker_address,
             maker_order_id, taker_order_id,
             price, base_quantity, quote_quantity, taker_is_bid, timestamp_ms
      FROM trade_fills
      WHERE taker_address = ? ${cursorClause} ${poolClause}
    ) ORDER BY id DESC LIMIT ?
  `;

  // Build params array dynamically
  const params: unknown[] = [];
  // maker branch
  params.push(address);
  if (opts.cursor != null) params.push(opts.cursor);
  if (opts.pool) params.push(opts.pool);
  // taker branch (same params)
  params.push(address);
  if (opts.cursor != null) params.push(opts.cursor);
  if (opts.pool) params.push(opts.pool);
  // limit (fetch 1 extra to detect hasMore)
  params.push(limit + 1);

  const rows = ldb.prepare(query).all(...params) as TradeHistoryRow[];

  const hasMore = rows.length > limit;
  const fills = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = fills.length > 0 ? fills[fills.length - 1].id : null;

  return { fills, nextCursor: hasMore ? nextCursor : null, hasMore };
}

// ===== Cost Basis Computation =====

export interface CostBasisEntryRaw {
  pool_id: string;
  total_bought: number;
  total_sold: number;
  avg_buy_price: number;
  realized_pnl: number;
  holding_qty: number;
}

/**
 * Compute FIFO weighted-average cost basis for a trader across all pools.
 * Processes all fills chronologically (oldest first) to produce accurate cost basis.
 *
 * @param baseDecimalsFn - Function to get base token decimals by pool_id
 * @param quoteDecimals - Quote token decimals (NUSDC = 6 for all pools)
 */
export function computeCostBasis(
  address: string,
  baseDecimalsFn: (poolId: string) => number,
  quoteDecimals: number = 6,
): CostBasisEntryRaw[] {
  const ldb = getLeaderboardDb();

  // Fetch ALL spot fills for this address, chronologically ascending.
  // Prediction-market pools (pool_id LIKE 'prediction:%') are excluded — see
  // aggregateTraderPnlRaw for rationale (shares are not base tokens; binary
  // outcome makes mark-to-market meaningless during trading window).
  const rows = ldb.prepare(`
    SELECT * FROM (
      SELECT id, pool_id, maker_address, taker_address,
             price, base_quantity, taker_is_bid
      FROM trade_fills WHERE maker_address = ? AND pool_id NOT LIKE 'prediction:%'
      UNION
      SELECT id, pool_id, maker_address, taker_address,
             price, base_quantity, taker_is_bid
      FROM trade_fills WHERE taker_address = ? AND pool_id NOT LIKE 'prediction:%'
    ) ORDER BY id ASC
  `).all(address, address) as Array<{
    id: number;
    pool_id: string;
    maker_address: string;
    taker_address: string;
    price: string;
    base_quantity: string;
    taker_is_bid: number;
  }>;

  // Accumulate per-pool cost basis
  const poolData = new Map<string, {
    totalBought: number;
    totalSold: number;
    avgBuyPrice: number;
    realizedPnl: number;
  }>();

  for (const row of rows) {
    const isTaker = row.taker_address === address;
    const takerIsBid = row.taker_is_bid === 1;
    const isBid = isTaker ? takerIsBid : !takerIsBid;

    const baseDec = baseDecimalsFn(row.pool_id);
    const price = Number(row.price) / Math.pow(10, quoteDecimals);
    const qty = Number(row.base_quantity) / Math.pow(10, baseDec);

    if (qty === 0) continue;

    let data = poolData.get(row.pool_id);
    if (!data) {
      data = { totalBought: 0, totalSold: 0, avgBuyPrice: 0, realizedPnl: 0 };
      poolData.set(row.pool_id, data);
    }

    if (isBid) {
      // Buy: update weighted average price
      const prevHolding = data.totalBought - data.totalSold;
      const newHolding = prevHolding + qty;
      if (newHolding > 0) {
        data.avgBuyPrice = (data.avgBuyPrice * prevHolding + price * qty) / newHolding;
      }
      data.totalBought += qty;
    } else {
      // Sell: realize PnL against average buy price
      data.realizedPnl += (price - data.avgBuyPrice) * qty;
      data.totalSold += qty;
    }
  }

  // Build result entries (only pools the user has traded)
  const entries: CostBasisEntryRaw[] = [];
  for (const [poolId, data] of poolData) {
    if (data.totalBought > 0 || data.totalSold > 0) {
      entries.push({
        pool_id: poolId,
        total_bought: Math.round(data.totalBought * 1e8) / 1e8,
        total_sold: Math.round(data.totalSold * 1e8) / 1e8,
        avg_buy_price: Math.round(data.avgBuyPrice * 100) / 100,
        realized_pnl: Math.round(data.realizedPnl * 100) / 100,
        holding_qty: Math.round((data.totalBought - data.totalSold) * 1e8) / 1e8,
      });
    }
  }

  return entries;
}

export function getTotalTradersCount(period: string = 'all'): number {
  const row = getLeaderboardDb()
    .prepare('SELECT COUNT(DISTINCT address) as count FROM trader_stats WHERE period = ?')
    .get(period) as { count: number } | undefined;
  return row?.count ?? 0;
}

export function getTotalPnlTradersCount(period: string = 'all'): number {
  const row = getLeaderboardDb()
    .prepare('SELECT COUNT(DISTINCT address) as count FROM trader_pnl WHERE period = ?')
    .get(period) as { count: number } | undefined;
  return row?.count ?? 0;
}

// ===== Competition CRUD =====

export function createCompetition(comp: Omit<CompetitionRow, 'created_at' | 'updated_at'>): void {
  const now = Date.now();
  getLeaderboardDb()
    .prepare(
      `INSERT INTO competitions (id, title, description, start_ms, end_ms, status, prize_description, min_volume, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(comp.id, comp.title, comp.description, comp.start_ms, comp.end_ms, comp.status, comp.prize_description, comp.min_volume, now, now);
}

export function updateCompetition(
  id: string,
  updates: Partial<Pick<CompetitionRow, 'title' | 'description' | 'start_ms' | 'end_ms' | 'status' | 'prize_description' | 'min_volume'>>,
): boolean {
  const ldb = getLeaderboardDb();
  const fields: string[] = [];
  const values: unknown[] = [];

  const ALLOWED_COLUMNS = new Set([
    'title', 'description', 'start_ms', 'end_ms',
    'status', 'prize_description', 'min_volume',
  ]);

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined && ALLOWED_COLUMNS.has(key)) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (fields.length === 0) return false;

  fields.push('updated_at = ?');
  values.push(Date.now());
  values.push(id);

  const result = ldb
    .prepare(`UPDATE competitions SET ${fields.join(', ')} WHERE id = ?`)
    .run(...values);

  return result.changes > 0;
}

export function getCompetition(id: string): CompetitionRow | null {
  return (getLeaderboardDb()
    .prepare('SELECT * FROM competitions WHERE id = ?')
    .get(id) as CompetitionRow | undefined) ?? null;
}

export function listCompetitions(status?: CompetitionStatus): CompetitionRow[] {
  if (status) {
    return getLeaderboardDb()
      .prepare('SELECT * FROM competitions WHERE status = ? ORDER BY start_ms DESC')
      .all(status) as CompetitionRow[];
  }
  return getLeaderboardDb()
    .prepare('SELECT * FROM competitions ORDER BY start_ms DESC')
    .all() as CompetitionRow[];
}

export function getActiveCompetitions(): CompetitionRow[] {
  return getLeaderboardDb()
    .prepare("SELECT * FROM competitions WHERE status IN ('upcoming', 'active') ORDER BY start_ms ASC")
    .all() as CompetitionRow[];
}

// ===== Competition Aggregation =====

interface AggregatedCompetitionTrader {
  address: string;
  volume_quote: string;
  trade_count: number;
}

export function aggregateCompetitionVolume(
  startMs: number,
  endMs: number,
  excludedAddresses: Set<string>,
  limit: number = 100,
): AggregatedCompetitionTrader[] {
  const ldb = getLeaderboardDb();

  const excludeList = [...excludedAddresses];
  const excludePlaceholders = excludeList.length > 0
    ? `AND address NOT IN (${excludeList.map(() => '?').join(',')})`
    : '';

  const query = `
    SELECT
      address,
      CAST(SUM(CAST(quote_volume AS INTEGER)) AS TEXT) as volume_quote,
      COUNT(*) as trade_count
    FROM (
      SELECT maker_address as address, quote_quantity as quote_volume, timestamp_ms
      FROM trade_fills WHERE timestamp_ms >= ? AND timestamp_ms <= ?
      UNION ALL
      SELECT taker_address as address, quote_quantity as quote_volume, timestamp_ms
      FROM trade_fills WHERE timestamp_ms >= ? AND timestamp_ms <= ?
    )
    WHERE 1=1 ${excludePlaceholders}
    GROUP BY address
    ORDER BY SUM(CAST(quote_volume AS INTEGER)) DESC
    LIMIT ?
  `;

  const params = [startMs, endMs, startMs, endMs, ...excludeList, limit];
  return ldb.prepare(query).all(...params) as AggregatedCompetitionTrader[];
}

export function replaceCompetitionResults(
  competitionId: string,
  traders: Array<{
    address: string;
    volumeQuote: string;
    tradeCount: number;
    rank: number;
  }>,
): void {
  const ldb = getLeaderboardDb();
  const now = Date.now();

  const replaceStmt = ldb.prepare(
    `INSERT INTO competition_results (competition_id, address, volume_quote, trade_count, rank, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(competition_id, address) DO UPDATE SET
       volume_quote = excluded.volume_quote,
       trade_count = excluded.trade_count,
       rank = excluded.rank,
       updated_at = excluded.updated_at`
  );

  const tx = ldb.transaction(() => {
    const addresses = traders.map((t) => t.address);
    if (addresses.length > 0) {
      const placeholders = addresses.map(() => '?').join(',');
      ldb.prepare(
        `DELETE FROM competition_results WHERE competition_id = ? AND address NOT IN (${placeholders})`
      ).run(competitionId, ...addresses);
    } else {
      ldb.prepare('DELETE FROM competition_results WHERE competition_id = ?').run(competitionId);
    }

    for (const t of traders) {
      replaceStmt.run(competitionId, t.address, t.volumeQuote, t.tradeCount, t.rank, now);
    }
  });

  tx();
}

export function getCompetitionResults(
  competitionId: string,
  limit: number = 100,
): CompetitionResultRow[] {
  return getLeaderboardDb()
    .prepare(
      `SELECT competition_id, address, volume_quote, trade_count, rank, updated_at
       FROM competition_results
       WHERE competition_id = ?
       ORDER BY rank ASC
       LIMIT ?`
    )
    .all(competitionId, limit) as CompetitionResultRow[];
}

// ===== Prediction Market Resolution =====

export interface PredictionMarketRow {
  market_id: string;
  status: string;
  outcome: number | null;
  resolved_at_ms: number;
}

export function upsertPredictionMarket(row: {
  market_id: string;
  status: 'resolved' | 'cancelled';
  outcome: number | null;
  resolved_at_ms: number;
}): void {
  const now = Date.now();
  // Once a market has been written, treat outcome as immutable: Move's
  // resolve_market asserts STATUS_OPEN (prediction_market.move:343) so the
  // chain itself cannot flip an outcome, but re-emission during indexer
  // replay or a Sui RPC quirk could otherwise overwrite a known result and
  // retroactively change weekly PnL. DO NOTHING preserves the first record;
  // status='cancelled' → 'resolved' transitions are equally forbidden on-chain.
  getLeaderboardDb()
    .prepare(
      `INSERT INTO prediction_markets (market_id, status, outcome, resolved_at_ms, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(market_id) DO NOTHING`
    )
    .run(row.market_id, row.status, row.outcome, row.resolved_at_ms, now);
}

export function getResolvedMarketCount(): number {
  const row = getLeaderboardDb()
    .prepare(`SELECT COUNT(*) as cnt FROM prediction_markets WHERE status = 'resolved'`)
    .get() as { cnt: number } | undefined;
  return row?.cnt ?? 0;
}

interface PredictionFillRow {
  market_id: string;
  outcome: number;
  maker_address: string;
  taker_address: string;
  is_yes: number;
  // taker_is_bid in prediction rows actually stores maker_is_bid (see indexer.ts:447,
  // prediction_market.move:202). Aliased here to make per-row math unambiguous.
  maker_is_bid: number;
  fill_shares: number;
  cost: number;
}

export interface PredictionPnlResult {
  realizedPnlRaw: number;     // signed, NUSDC raw (6 dec)
  pnlPercent: number;
  marketCount: number;
  volumeQuoteRaw: number;     // NUSDC raw, unsigned (sum of |cost|)
  marketLossesRaw: number[];  // per-market realized loss abs (NUSDC raw); only markets with net negative PnL
}

/**
 * Compute realized prediction-market PnL for every trader whose markets resolved
 * in [weekStartMs, weekEndMs). Cancelled markets are excluded (status filter).
 *
 * Per-user per-market position model:
 *   maker_is_bid = true  → maker buys long-shares of (market, is_yes),
 *                          taker sells the same shares
 *   maker_is_bid = false → maker sells, taker buys
 * Payout per (user, market, side): if side == outcome, payout = net_shares * 1 NUSDC
 *                                   else payout = 0
 * realized_pnl = sum over (market, side) of (payout - net_cost)
 *
 * Note on the SQL column rename:
 *   prediction OrderFilled's `is_bid` is emitted from the MAKER side
 *   (prediction_market.move:202 comment). The indexer stores it in the
 *   `taker_is_bid` column for backward compatibility with the spot schema.
 *   This SQL aliases it back to `maker_is_bid` so the math below reads cleanly.
 *   Do NOT join this with spot rows on that column.
 */
export function computePredictionPnl(
  startMs: number,
  endMs: number,
  excludedAddresses: Set<string>,
  washPairs?: Set<string>,
): Map<string, PredictionPnlResult> {
  const ldb = getLeaderboardDb();
  const wash = buildWashPairsCte(washPairs);

  const excludeList = [...excludedAddresses];
  const excludeMaker = excludeList.length > 0
    ? `AND tf.maker_address NOT IN (${excludeList.map(() => '?').join(',')})
       AND tf.taker_address NOT IN (${excludeList.map(() => '?').join(',')})`
    : '';

  // Single JOIN query: prediction_markets resolved in week × matching trade_fills.
  // We CAST as REAL to stay consistent with spot's aggregateTraderPnlRaw (see
  // leaderboard-store.ts:1236+); raw 6-dec NUSDC fits IEEE 754 safe range
  // (Number.MAX_SAFE_INTEGER = 2^53 ≈ 9e15 ≈ $9B per single fill).
  const sql = `
    ${wash?.cte ?? ''}
    SELECT
      pm.market_id,
      pm.outcome,
      tf.maker_address,
      tf.taker_address,
      tf.is_yes,
      tf.taker_is_bid AS maker_is_bid,
      CAST(tf.base_quantity AS REAL) AS fill_shares,
      CAST(tf.quote_quantity AS REAL) AS cost
    FROM prediction_markets pm
    JOIN trade_fills tf
      ON tf.pool_id = 'prediction:' || pm.market_id
      AND tf.timestamp_ms <= pm.resolved_at_ms
      AND tf.is_yes IS NOT NULL
    WHERE pm.status = 'resolved'
      AND pm.resolved_at_ms >= ?
      AND pm.resolved_at_ms <  ?
      ${excludeMaker}
      ${wash?.filterClause ?? ''}
  `;

  const params = [
    ...(wash?.params ?? []),
    startMs,
    endMs,
    ...excludeList, ...excludeList,
  ];

  const rows = ldb.prepare(sql).all(...params) as PredictionFillRow[];

  // Per (address, market_id, is_yes) accumulator
  interface PosKey { net_shares: number; net_cost: number; gross_cost: number }
  const positions = new Map<string, PosKey>();
  // Per address aggregator
  const userMarkets = new Map<string, Set<string>>();
  // Per (address, market_id) → outcome lookup
  const marketOutcome = new Map<string, number>();

  function key(addr: string, mid: string, isYes: number): string {
    return `${addr}|${mid}|${isYes}`;
  }

  for (const row of rows) {
    marketOutcome.set(row.market_id, row.outcome);
    const signMaker = row.maker_is_bid === 1 ? 1 : -1;

    const makerKey = key(row.maker_address, row.market_id, row.is_yes);
    let m = positions.get(makerKey);
    if (!m) { m = { net_shares: 0, net_cost: 0, gross_cost: 0 }; positions.set(makerKey, m); }
    m.net_shares += signMaker * row.fill_shares;
    m.net_cost   += signMaker * row.cost;
    m.gross_cost += row.cost;

    const takerKey = key(row.taker_address, row.market_id, row.is_yes);
    let t = positions.get(takerKey);
    if (!t) { t = { net_shares: 0, net_cost: 0, gross_cost: 0 }; positions.set(takerKey, t); }
    t.net_shares -= signMaker * row.fill_shares;
    t.net_cost   -= signMaker * row.cost;
    t.gross_cost += row.cost;

    let mSet = userMarkets.get(row.maker_address);
    if (!mSet) { mSet = new Set(); userMarkets.set(row.maker_address, mSet); }
    mSet.add(row.market_id);
    let tSet = userMarkets.get(row.taker_address);
    if (!tSet) { tSet = new Set(); userMarkets.set(row.taker_address, tSet); }
    tSet.add(row.market_id);
  }

  // Roll positions up into per-user PnL + cost basis.
  // Also accumulate per-(address, marketId) PnL so we can extract per-market losses
  // for the prediction loss penalty (Hybrid A+B). yes/no both sides on the same
  // market are netted into a single per-market PnL.
  const userAgg = new Map<string, { realizedPnlRaw: number; costBasis: number; volumeQuoteRaw: number }>();
  const perMarketPnl = new Map<string, number>(); // key: `${address}|${marketId}`

  for (const [k, pos] of positions) {
    const [address, marketId, isYesStr] = k.split('|');
    const isYes = Number(isYesStr);
    const outcome = marketOutcome.get(marketId);
    if (outcome === undefined) continue;
    const isWinning = outcome === isYes;
    // Move's fill_shares is already in NUSDC raw scale: at price=10000 (100%)
    // mint gives `amount_nusdc * MAX_PRICE / price = amount_nusdc` shares
    // (prediction_market.move:414), and `claim_winnings` pays
    // `payout = shares` raw NUSDC (line 940). So 1 share = 1 raw NUSDC = 1e-6
    // NUSDC. Multiplying by 1_000_000 would inflate PnL by 6 decimals.
    const payout = isWinning ? pos.net_shares : 0;
    const pnl = payout - pos.net_cost;
    const costInvested = pos.net_cost > 0 ? pos.net_cost : 0;

    let agg = userAgg.get(address);
    if (!agg) { agg = { realizedPnlRaw: 0, costBasis: 0, volumeQuoteRaw: 0 }; userAgg.set(address, agg); }
    agg.realizedPnlRaw += pnl;
    agg.costBasis      += costInvested;
    agg.volumeQuoteRaw += pos.gross_cost;

    const mKey = `${address}|${marketId}`;
    perMarketPnl.set(mKey, (perMarketPnl.get(mKey) ?? 0) + pnl);
  }

  // Extract per-market losses per user (only net-negative markets).
  const userMarketLosses = new Map<string, number[]>();
  for (const [mKey, pnl] of perMarketPnl) {
    if (pnl >= 0) continue;
    const [address] = mKey.split('|');
    let arr = userMarketLosses.get(address);
    if (!arr) { arr = []; userMarketLosses.set(address, arr); }
    arr.push(Math.abs(pnl));
  }

  // Rebuild per-user realizedPnlRaw with per-market gain clamped at
  // PREDICTION_MARKET_GAIN_CAP_USD. A single long-shot market hit at low odds
  // (e.g. price=1bp → 100x payout) otherwise dominates the leaderboard. Losses
  // are NOT clamped here — penalty path uses tiered per-market loss amounts.
  const marketGainCapRaw = POINTS.PREDICTION_MARKET_GAIN_CAP_USD * 1_000_000;
  const clampedPnlByAddress = new Map<string, number>();
  for (const [mKey, pnl] of perMarketPnl) {
    const [address] = mKey.split('|');
    const adjusted = pnl > 0 ? Math.min(pnl, marketGainCapRaw) : pnl;
    clampedPnlByAddress.set(address, (clampedPnlByAddress.get(address) ?? 0) + adjusted);
  }
  for (const [address, agg] of userAgg) {
    const clamped = clampedPnlByAddress.get(address);
    if (clamped !== undefined) agg.realizedPnlRaw = clamped;
  }

  const out = new Map<string, PredictionPnlResult>();
  for (const [address, agg] of userAgg) {
    const marketSet = userMarkets.get(address);
    const marketCount = marketSet ? marketSet.size : 0;
    const pnlPercent = agg.costBasis > 0
      ? Math.round((agg.realizedPnlRaw / agg.costBasis) * 10000) / 100
      : 0;
    out.set(address, {
      realizedPnlRaw: Math.round(agg.realizedPnlRaw),
      pnlPercent,
      marketCount,
      volumeQuoteRaw: Math.round(agg.volumeQuoteRaw),
      marketLossesRaw: userMarketLosses.get(address) ?? [],
    });
  }

  return out;
}

// ===== PnL Aggregation =====

interface RawPnlRow {
  address: string;
  pool_id: string;
  buy_base: number;
  buy_quote: number;
  sell_base: number;
  sell_quote: number;
  trade_count: number;
}

/**
 * Aggregate per-trader per-pool buy/sell totals for PnL calculation.
 * Grouped by (address, pool_id) to avoid mixing base token decimals across pools.
 *
 * Prediction-market pools are excluded via `pool_id NOT LIKE 'prediction:%'`.
 * Reasons:
 *   1. Prediction `fill_shares` is share count (not base token raw); applying the
 *      spot FIFO cost-basis model would treat shares as if they were base tokens
 *      with the same decimals, producing nonsense PnL.
 *   2. Prediction outcomes are binary; mark-to-market during the trading window
 *      is meaningless until `MarketResolved`. Ecosystem points already reward
 *      prediction trading via the `pado-prediction` category.
 *   3. Per-venue PnL ledger (planned): perp will need its own leverage-aware
 *      module; lending has no leaderboard PnL semantics. Filtering at SQL is
 *      cheap and reversible (one line) when prediction-specific PnL ships.
 */
export function aggregateTraderPnlRaw(
  cutoffMs: number,
  excludedAddresses: Set<string>,
  washPairs?: Set<string>,
): RawPnlRow[] {
  const ldb = getLeaderboardDb();

  const excludeList = [...excludedAddresses];
  const excludePlaceholders = excludeList.length > 0
    ? `AND address NOT IN (${excludeList.map(() => '?').join(',')})`
    : '';
  const wash = buildWashPairsCte(washPairs);

  const query = `
    ${wash?.cte ?? ''}
    SELECT
      address,
      pool_id,
      SUM(CASE WHEN is_buy = 1 THEN CAST(base_qty AS REAL) ELSE 0.0 END) as buy_base,
      SUM(CASE WHEN is_buy = 1 THEN CAST(quote_qty AS REAL) ELSE 0.0 END) as buy_quote,
      SUM(CASE WHEN is_buy = 0 THEN CAST(base_qty AS REAL) ELSE 0.0 END) as sell_base,
      SUM(CASE WHEN is_buy = 0 THEN CAST(quote_qty AS REAL) ELSE 0.0 END) as sell_quote,
      COUNT(*) as trade_count
    FROM (
      SELECT taker_address as address, pool_id, base_quantity as base_qty, quote_quantity as quote_qty,
             taker_is_bid as is_buy, timestamp_ms
      FROM trade_fills WHERE timestamp_ms >= ?
        AND pool_id NOT LIKE 'prediction:%'
      ${wash?.filterClause ?? ''}
      UNION ALL
      SELECT maker_address as address, pool_id, base_quantity as base_qty, quote_quantity as quote_qty,
             CASE WHEN taker_is_bid = 1 THEN 0 ELSE 1 END as is_buy, timestamp_ms
      FROM trade_fills WHERE timestamp_ms >= ?
        AND pool_id NOT LIKE 'prediction:%'
      ${wash?.filterClause ?? ''}
    )
    WHERE 1=1 ${excludePlaceholders}
    GROUP BY address, pool_id
    HAVING MIN(buy_base, sell_base) > 0
  `;

  const params = [
    ...(wash?.params ?? []),
    cutoffMs, cutoffMs,
    ...excludeList,
  ];
  return ldb.prepare(query).all(...params) as RawPnlRow[];
}

/**
 * Compute realized PnL per pool then aggregate per trader.
 * Per-pool isolation prevents decimal mismatch between different base tokens
 * (e.g. NSOL raw units vs NBTC raw units) from producing phantom profit.
 */
export function computeTraderPnl(
  cutoffMs: number,
  excludedAddresses: Set<string>,
  limit: number = 100,
  washPairs?: Set<string>,
): Array<{ address: string; realizedPnlRaw: number; pnlPercent: number; tradeCount: number }> {
  const rawRows = aggregateTraderPnlRaw(cutoffMs, excludedAddresses, washPairs);

  // Accumulate per-pool PnL into per-trader totals
  const traderMap = new Map<string, { realizedPnlRaw: number; totalCostBasis: number; tradeCount: number }>();

  for (const row of rawRows) {
    if (row.buy_base <= 0 || row.sell_base <= 0) continue;

    const matchedBase = Math.min(row.buy_base, row.sell_base);
    const buyRatio = matchedBase / row.buy_base;
    const sellRatio = matchedBase / row.sell_base;

    const costBasis = buyRatio * row.buy_quote;
    const revenue = sellRatio * row.sell_quote;
    const poolPnl = revenue - costBasis;

    const existing = traderMap.get(row.address);
    if (existing) {
      existing.realizedPnlRaw += poolPnl;
      existing.totalCostBasis += costBasis;
      existing.tradeCount += row.trade_count;
    } else {
      traderMap.set(row.address, {
        realizedPnlRaw: poolPnl,
        totalCostBasis: costBasis,
        tradeCount: row.trade_count,
      });
    }
  }

  const results: Array<{ address: string; realizedPnlRaw: number; pnlPercent: number; tradeCount: number }> = [];

  for (const [address, data] of traderMap) {
    const pnlPercent = data.totalCostBasis > 0 ? (data.realizedPnlRaw / data.totalCostBasis) * 100 : 0;
    results.push({
      address,
      realizedPnlRaw: Math.round(data.realizedPnlRaw),
      pnlPercent: Math.round(pnlPercent * 100) / 100,
      tradeCount: data.tradeCount,
    });
  }

  // Sort by absolute PnL descending (best performers first — both profit and loss matter for ranking)
  results.sort((a, b) => b.realizedPnlRaw - a.realizedPnlRaw);

  return results.slice(0, limit);
}

/**
 * Multi-period spot PnL in a single table scan.
 *
 * Replaces N separate calls to computeTraderPnl (one per period). The wash
 * filter (NOT EXISTS over wash_pairs) is the dominant cost on a 774k-row
 * trade_fills table; running it once instead of N times keeps the cycle
 * within the 60s aggregation interval. Period bucketing is done inside the
 * SQL via CASE WHEN aggregates against each period's cutoff, so the final
 * row count stays bounded by (address × pool_id) and JS post-processing is
 * cheap.
 *
 * Returns one entry per period in the input list, each containing the
 * top-`limit` traders by realizedPnlRaw for that period.
 */
export function computeTraderPnlMultiPeriod(
  periodCutoffs: ReadonlyArray<{ period: string; cutoffMs: number }>,
  excludedAddresses: Set<string>,
  limit: number = 100,
  washPairs?: Set<string>,
): Map<string, Array<{ address: string; realizedPnlRaw: number; pnlPercent: number; tradeCount: number }>> {
  const result = new Map<string, Array<{ address: string; realizedPnlRaw: number; pnlPercent: number; tradeCount: number }>>();
  if (periodCutoffs.length === 0) return result;

  const ldb = getLeaderboardDb();

  // Inline excluded addresses and wash pairs as SQL literals instead of bound
  // parameters. With 14k+ banned addresses and up to 2k wash pairs the
  // combined parameter count exceeds better-sqlite3's per-statement limit.
  // Both inputs are normalized lowercase hex (UserProfiles canonical form,
  // validated upstream by banned-loader / buildSameIdentityPairs); the strict
  // regex below is defense-in-depth against future drift.
  const HEX_ADDR_RE = /^0x[0-9a-f]+$/;
  const excludeQuoted: string[] = [];
  for (const addr of excludedAddresses) {
    if (!HEX_ADDR_RE.test(addr)) {
      throw new Error(`computeTraderPnlMultiPeriod: excluded address "${addr}" is not lowercase 0x-hex`);
    }
    excludeQuoted.push(`'${addr}'`);
  }
  const excludeClause = excludeQuoted.length > 0
    ? `AND address NOT IN (${excludeQuoted.join(',')})`
    : '';

  const WASH_KEY_RE = /^0x[0-9a-f]+:0x[0-9a-f]+$/;
  let washCte = '';
  let washFilter = '';
  if (washPairs && washPairs.size > 0 && washPairs.size <= MAX_WASH_PAIRS_CTE) {
    const washValues: string[] = [];
    for (const k of washPairs) {
      if (!WASH_KEY_RE.test(k)) {
        throw new Error(`computeTraderPnlMultiPeriod: wash pair "${k}" is not canonical`);
      }
      washValues.push(`('${k}')`);
    }
    washCte = `WITH wash_pairs(k) AS (VALUES ${washValues.join(', ')})`;
    washFilter = `
      AND NOT EXISTS (
        SELECT 1 FROM wash_pairs
        WHERE k = CASE WHEN maker_address < taker_address
                       THEN maker_address || ':' || taker_address
                       ELSE taker_address || ':' || maker_address
                  END
      )`;
  } else if (washPairs && washPairs.size > MAX_WASH_PAIRS_CTE) {
    console.warn(`[LeaderboardStore] computeTraderPnlMultiPeriod: washPairs.size=${washPairs.size} exceeds CTE limit (${MAX_WASH_PAIRS_CTE}), skipping wash filter`);
  }

  // Build per-period conditional aggregate columns. Column index ↔ periodCutoffs index.
  const aggCols: string[] = [];
  for (let i = 0; i < periodCutoffs.length; i++) {
    aggCols.push(`SUM(CASE WHEN is_buy = 1 AND timestamp_ms >= ? THEN base_qty ELSE 0.0 END) as buy_base_${i}`);
    aggCols.push(`SUM(CASE WHEN is_buy = 1 AND timestamp_ms >= ? THEN quote_qty ELSE 0.0 END) as buy_quote_${i}`);
    aggCols.push(`SUM(CASE WHEN is_buy = 0 AND timestamp_ms >= ? THEN base_qty ELSE 0.0 END) as sell_base_${i}`);
    aggCols.push(`SUM(CASE WHEN is_buy = 0 AND timestamp_ms >= ? THEN quote_qty ELSE 0.0 END) as sell_quote_${i}`);
    aggCols.push(`SUM(CASE WHEN timestamp_ms >= ? THEN 1 ELSE 0 END) as count_${i}`);
  }

  // Lowest cutoff among periods bounds the unioned scan; for 'all' (cutoff=0)
  // this is a no-op.
  const minCutoff = Math.min(...periodCutoffs.map((p) => p.cutoffMs));

  const query = `
    ${washCte}
    SELECT
      address,
      pool_id,
      ${aggCols.join(',\n      ')}
    FROM (
      SELECT taker_address as address, pool_id,
             CAST(base_quantity AS REAL) as base_qty, CAST(quote_quantity AS REAL) as quote_qty,
             taker_is_bid as is_buy, timestamp_ms
      FROM trade_fills WHERE timestamp_ms >= ?
        AND pool_id NOT LIKE 'prediction:%'
      ${washFilter}
      UNION ALL
      SELECT maker_address as address, pool_id,
             CAST(base_quantity AS REAL) as base_qty, CAST(quote_quantity AS REAL) as quote_qty,
             CASE WHEN taker_is_bid = 1 THEN 0 ELSE 1 END as is_buy, timestamp_ms
      FROM trade_fills WHERE timestamp_ms >= ?
        AND pool_id NOT LIKE 'prediction:%'
      ${washFilter}
    )
    WHERE 1=1 ${excludeClause}
    GROUP BY address, pool_id
  `;

  // Bound params: 5 cutoffs per period (CASE WHEN order), then UNION branch
  // cutoffs (taker, maker). Wash and exclude lists are inlined as literals.
  const selectCutoffParams: number[] = [];
  for (const { cutoffMs } of periodCutoffs) {
    for (let k = 0; k < 5; k++) selectCutoffParams.push(cutoffMs);
  }

  const params = [
    ...selectCutoffParams,
    minCutoff,
    minCutoff,
  ];

  type RawRow = { address: string; pool_id: string } & Record<string, number>;
  const rows = ldb.prepare(query).all(...params) as RawRow[];

  // Per-period accumulator: address -> { realizedPnlRaw, totalCostBasis, tradeCount }
  for (let i = 0; i < periodCutoffs.length; i++) {
    const traderMap = new Map<string, { realizedPnlRaw: number; totalCostBasis: number; tradeCount: number }>();

    for (const row of rows) {
      const buyBase = row[`buy_base_${i}`] as number;
      const sellBase = row[`sell_base_${i}`] as number;
      if (buyBase <= 0 || sellBase <= 0) continue;

      const buyQuote = row[`buy_quote_${i}`] as number;
      const sellQuote = row[`sell_quote_${i}`] as number;
      const tradeCount = row[`count_${i}`] as number;

      const matchedBase = Math.min(buyBase, sellBase);
      const buyRatio = matchedBase / buyBase;
      const sellRatio = matchedBase / sellBase;

      const costBasis = buyRatio * buyQuote;
      const revenue = sellRatio * sellQuote;
      const poolPnl = revenue - costBasis;

      const existing = traderMap.get(row.address);
      if (existing) {
        existing.realizedPnlRaw += poolPnl;
        existing.totalCostBasis += costBasis;
        existing.tradeCount += tradeCount;
      } else {
        traderMap.set(row.address, {
          realizedPnlRaw: poolPnl,
          totalCostBasis: costBasis,
          tradeCount,
        });
      }
    }

    const periodResults: Array<{ address: string; realizedPnlRaw: number; pnlPercent: number; tradeCount: number }> = [];
    for (const [address, data] of traderMap) {
      const pnlPercent = data.totalCostBasis > 0 ? (data.realizedPnlRaw / data.totalCostBasis) * 100 : 0;
      periodResults.push({
        address,
        realizedPnlRaw: Math.round(data.realizedPnlRaw),
        pnlPercent: Math.round(pnlPercent * 100) / 100,
        tradeCount: data.tradeCount,
      });
    }

    periodResults.sort((a, b) => b.realizedPnlRaw - a.realizedPnlRaw);
    result.set(periodCutoffs[i].period, periodResults.slice(0, limit));
  }

  return result;
}

/**
 * Get current PnL ranks for a period.
 */
export function getPnlCurrentRanks(period: string): Map<string, number> {
  const rows = getLeaderboardDb()
    .prepare('SELECT address, rank FROM trader_pnl WHERE period = ?')
    .all(period) as Array<{ address: string; rank: number }>;

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.address, row.rank);
  }
  return map;
}

/**
 * Replace PnL stats for a period.
 */
export function replaceTraderPnlStats(
  period: string,
  traders: Array<{
    address: string;
    realizedPnlRaw: number;
    pnlPercent: number;
    tradeCount: number;
    rank: number;
    prevRank: number;
  }>,
): void {
  const ldb = getLeaderboardDb();
  const now = Date.now();

  const replaceStmt = ldb.prepare(
    `INSERT INTO trader_pnl (address, period, realized_pnl, pnl_percent, trade_count, rank, prev_rank, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(address, period) DO UPDATE SET
       realized_pnl = excluded.realized_pnl,
       pnl_percent = excluded.pnl_percent,
       trade_count = excluded.trade_count,
       rank = excluded.rank,
       prev_rank = excluded.prev_rank,
       updated_at = excluded.updated_at`
  );

  const tx = ldb.transaction(() => {
    const addresses = traders.map((t) => t.address);
    if (addresses.length > 0) {
      const placeholders = addresses.map(() => '?').join(',');
      ldb.prepare(
        `DELETE FROM trader_pnl WHERE period = ? AND address NOT IN (${placeholders})`
      ).run(period, ...addresses);
    } else {
      ldb.prepare('DELETE FROM trader_pnl WHERE period = ?').run(period);
    }

    for (const t of traders) {
      replaceStmt.run(
        t.address, period, String(t.realizedPnlRaw), t.pnlPercent,
        t.tradeCount, t.rank, t.prevRank, now,
      );
    }
  });

  tx();
}

/**
 * Get PnL leaderboard for a period.
 */
export function getLeaderboardPnl(
  period: string,
  limit: number = 50,
  offset: number = 0,
): TraderPnlStatsRow[] {
  return getLeaderboardDb()
    .prepare(
      `SELECT address, period, realized_pnl, pnl_percent, trade_count, rank, prev_rank, updated_at
       FROM trader_pnl
       WHERE period = ?
       ORDER BY rank ASC
       LIMIT ? OFFSET ?`
    )
    .all(period, limit, offset) as TraderPnlStatsRow[];
}

// ===== Points System =====

/**
 * Get current points ranks (for prev_rank tracking).
 */
export function getPointsCurrentRanks(): Map<string, number> {
  const rows = getLeaderboardDb()
    .prepare('SELECT address, rank FROM trader_points')
    .all() as Array<{ address: string; rank: number }>;
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.address, row.rank);
  }
  return map;
}

/**
 * Replace all points data with newly computed values.
 */
export function replaceTraderPoints(
  traders: Array<{
    address: string;
    totalPoints: number;
    pointsFromTrades: number;
    pointsFromVolume: number;
    pointsFromDiversity: number;
    pointsFromPnl: number;
    tradeCount: number;
    volumeQuote: string;
    rank: number;
    prevRank: number;
  }>,
): void {
  const ldb = getLeaderboardDb();
  const now = Date.now();

  const replaceStmt = ldb.prepare(
    `INSERT INTO trader_points (address, total_points, points_from_trades, points_from_volume, points_from_diversity, points_from_pnl, trade_count, volume_quote, rank, prev_rank, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(address) DO UPDATE SET
       total_points = excluded.total_points,
       points_from_trades = excluded.points_from_trades,
       points_from_volume = excluded.points_from_volume,
       points_from_diversity = excluded.points_from_diversity,
       points_from_pnl = excluded.points_from_pnl,
       trade_count = excluded.trade_count,
       volume_quote = excluded.volume_quote,
       rank = excluded.rank,
       prev_rank = excluded.prev_rank,
       updated_at = excluded.updated_at`
  );

  const tx = ldb.transaction(() => {
    const addresses = traders.map((t) => t.address);
    if (addresses.length > 0) {
      const placeholders = addresses.map(() => '?').join(',');
      ldb.prepare(
        `DELETE FROM trader_points WHERE address NOT IN (${placeholders})`
      ).run(...addresses);
    } else {
      ldb.prepare('DELETE FROM trader_points').run();
    }

    for (const t of traders) {
      replaceStmt.run(
        t.address, t.totalPoints, t.pointsFromTrades,
        t.pointsFromVolume, t.pointsFromDiversity, t.pointsFromPnl,
        t.tradeCount, t.volumeQuote,
        t.rank, t.prevRank, now,
      );
    }
  });

  tx();
}

// ===== Score API (pado DEX trading score) =====
// trader_points is the historical SQLite table name; values are DEX trading scores.
// DB rename to pado_trader_scores is follow-up (SQLite ALTER TABLE O(1)).
// See .claude/handoffs/2026-04-12-chat-server-role-clarification.md

/** Score leaderboard (alltime). */
export function getScoreLeaderboard(limit: number = 50, offset: number = 0): TraderPointsRow[] {
  return getLeaderboardDb()
    .prepare(
      `SELECT address, total_points, points_from_trades, points_from_volume,
              points_from_diversity, points_from_pnl, trade_count, volume_quote, rank, prev_rank, updated_at
       FROM trader_points
       ORDER BY rank ASC
       LIMIT ? OFFSET ?`
    )
    .all(limit, offset) as TraderPointsRow[];
}

/** Individual trader score. */
export function getTraderScore(address: string): TraderPointsRow | null {
  return (getLeaderboardDb()
    .prepare(
      `SELECT address, total_points, points_from_trades, points_from_volume,
              points_from_diversity, points_from_pnl, trade_count, volume_quote, rank, prev_rank, updated_at
       FROM trader_points
       WHERE address = ?`
    )
    .get(address) as TraderPointsRow | undefined) ?? null;
}

export function getTotalScoreTraders(): number {
  const row = getLeaderboardDb()
    .prepare('SELECT COUNT(*) as count FROM trader_points')
    .get() as { count: number } | undefined;
  return row?.count ?? 0;
}

/** Aggregator last-run timestamp for pado score aggregation. 0 if never run. */
export function getPadoAggregatorLastRun(): number {
  const v = getIndexerState('pado_aggregator_last_run_ms');
  return v ? Number(v) : 0;
}

/**
 * Get distinct trader addresses from the 'all' period leaderboard (top N by rank).
 * Used by the profile sync job to pre-cache display names.
 */
export function getActiveTraderAddresses(limit: number = 500): string[] {
  const rows = getLeaderboardDb()
    .prepare(
      `SELECT address FROM trader_stats WHERE period = 'all' ORDER BY rank ASC LIMIT ?`
    )
    .all(limit) as Array<{ address: string }>;
  return rows.map((r) => r.address);
}

// ===== ISO Week Utilities =====

/**
 * Compute ISO week number (1-53) for a given date.
 * ISO 8601: week 1 is the week containing the first Thursday of the year.
 * Uses ISO week-numbering year (may differ from calendar year near Jan 1).
 */
function getISOWeek(date: Date): { year: number; week: number } {
  // Thursday of the current week determines the ISO year
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7; // Mon=1 ... Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - day); // Nearest Thursday
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

/**
 * Format a timestamp as an ISO week ID string: 'YYYY-Www' (e.g. '2026-W17').
 * Uses ISO week-numbering year to handle year-boundary edge cases correctly.
 * e.g. 2026-12-31 (Thu) belongs to 2026-W53, not 2027-W01.
 */
export function getWeekId(timestampMs: number): string {
  const { year, week } = getISOWeek(new Date(timestampMs));
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Return the start of the current ISO week as a UTC timestamp (ms).
 * Week start = Monday 00:00 UTC. Settlement crons run at 00:15/00:20 UTC.
 */
export function getCurrentWeekStart(): number {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 1=Mon...6=Sat
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - daysSinceMonday);
  monday.setUTCHours(0, 0, 0, 0);
  // If we're before Monday 00:00 UTC this week, step back one more week
  if (monday.getTime() > now.getTime()) {
    monday.setUTCDate(monday.getUTCDate() - 7);
  }
  return monday.getTime();
}

// ===== Weekly Score Store =====

export interface WeeklyScoreRow {
  week_id: string;
  address: string;
  total_score: number;
  score_from_trades: number;
  score_from_volume: number;
  score_from_diversity: number;
  score_from_pnl: number;
  score_from_prediction_pnl: number;
  trade_count: number;
  volume_quote: string;
  prediction_volume_quote: string;
  prediction_unique_markets: number;
  prediction_realized_pnl: string;
  rank: number;
  prev_rank: number;
  updated_at: number;
  x_handle: string | null;
  has_google: number;
  has_telegram: number;
}

export function getWeeklyCurrentRanks(weekId: string): Map<string, number> {
  const rows = getLeaderboardDb()
    .prepare('SELECT address, rank FROM trader_points_weekly WHERE week_id = ?')
    .all(weekId) as Array<{ address: string; rank: number }>;
  return new Map(rows.map((r) => [r.address, r.rank]));
}

/**
 * Replace the current week's score leaderboard atomically inside a transaction.
 * Deletes all rows for this week_id, then bulk-inserts the new ranked entries.
 * The transaction minimises the window where the leaderboard appears empty.
 */
export function replaceWeeklyTraderScores(
  weekId: string,
  traders: Array<{
    address: string;
    totalScore: number;
    scoreFromTrades: number;
    scoreFromVolume: number;
    scoreFromDiversity: number;
    scoreFromPnl: number;
    scoreFromPredictionPnl: number;
    tradeCount: number;
    volumeQuote: string;
    predictionVolumeQuote: string;
    predictionUniqueMarkets: number;
    predictionRealizedPnl: string;
    rank: number;
    prevRank: number;
    xHandle?: string | null;
    hasGoogle?: boolean;
    hasTelegram?: boolean;
  }>,
): void {
  const ldb = getLeaderboardDb();
  const now = Date.now();

  const insertStmt = ldb.prepare(
    `INSERT INTO trader_points_weekly
       (week_id, address, total_score, score_from_trades, score_from_volume,
        score_from_diversity, score_from_pnl, score_from_prediction_pnl,
        trade_count, volume_quote,
        prediction_volume_quote, prediction_unique_markets, prediction_realized_pnl,
        rank, prev_rank, updated_at, x_handle, has_google, has_telegram)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(week_id, address) DO UPDATE SET
       total_score = excluded.total_score,
       score_from_trades = excluded.score_from_trades,
       score_from_volume = excluded.score_from_volume,
       score_from_diversity = excluded.score_from_diversity,
       score_from_pnl = excluded.score_from_pnl,
       score_from_prediction_pnl = excluded.score_from_prediction_pnl,
       trade_count = excluded.trade_count,
       volume_quote = excluded.volume_quote,
       prediction_volume_quote = excluded.prediction_volume_quote,
       prediction_unique_markets = excluded.prediction_unique_markets,
       prediction_realized_pnl = excluded.prediction_realized_pnl,
       rank = excluded.rank,
       prev_rank = excluded.prev_rank,
       updated_at = excluded.updated_at,
       x_handle = excluded.x_handle,
       has_google = excluded.has_google,
       has_telegram = excluded.has_telegram`
  );

  const tx = ldb.transaction(() => {
    // Remove addresses that are no longer in the top list
    const addresses = traders.map((t) => t.address);
    if (addresses.length > 0) {
      const placeholders = addresses.map(() => '?').join(',');
      ldb.prepare(
        `DELETE FROM trader_points_weekly WHERE week_id = ? AND address NOT IN (${placeholders})`
      ).run(weekId, ...addresses);
    } else {
      ldb.prepare('DELETE FROM trader_points_weekly WHERE week_id = ?').run(weekId);
    }

    for (const t of traders) {
      insertStmt.run(
        weekId, t.address, t.totalScore,
        t.scoreFromTrades, t.scoreFromVolume,
        t.scoreFromDiversity, t.scoreFromPnl, t.scoreFromPredictionPnl,
        t.tradeCount, t.volumeQuote,
        t.predictionVolumeQuote, t.predictionUniqueMarkets, t.predictionRealizedPnl,
        t.rank, t.prevRank, now,
        t.xHandle ?? null, t.hasGoogle ? 1 : 0, t.hasTelegram ? 1 : 0,
      );
    }
  });

  tx();
}

function formatWeekLabel(weekId: string): string {
  if (!/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(weekId)) return weekId;
  const [yearStr, wStr] = weekId.split('-W');
  const year = parseInt(yearStr, 10);
  const week = parseInt(wStr, 10);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - (dayOfWeek - 1) + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `W${wStr} (${fmt(monday)} - ${fmt(sunday)})`;
}

/** List of week IDs with labels, ordered newest first. */
export function getAvailableWeeks(): Array<{ weekId: string; label: string }> {
  // idx_weekly_rank (week_id, rank ASC) covers this as an index-only scan
  const rows = getLeaderboardDb()
    .prepare('SELECT DISTINCT week_id FROM trader_points_weekly ORDER BY week_id DESC')
    .all() as Array<{ week_id: string }>;
  return rows.map(r => ({ weekId: r.week_id, label: formatWeekLabel(r.week_id) }));
}

/** Weekly score leaderboard for a given week_id. */
export function getWeeklyScoreLeaderboard(
  weekId: string,
  limit: number = 50,
  offset: number = 0,
): WeeklyScoreRow[] {
  return getLeaderboardDb()
    .prepare(
      `SELECT * FROM trader_points_weekly
       WHERE week_id = ?
       ORDER BY rank ASC
       LIMIT ? OFFSET ?`
    )
    .all(weekId, limit, offset) as WeeklyScoreRow[];
}

export function getWeeklyScoreCount(weekId: string): number {
  const row = getLeaderboardDb()
    .prepare('SELECT COUNT(*) as cnt FROM trader_points_weekly WHERE week_id = ?')
    .get(weekId) as { cnt: number };
  return row.cnt;
}

/** Count unique traders who made at least one trade in the given week window. */
export function countWeeklyUniqueTraders(
  weekStartMs: number,
  weekEndMs: number,
  excludedAddresses: Set<string> = new Set(),
): number {
  const excludeList = [...excludedAddresses];
  const excludeClause = excludeList.length > 0
    ? `AND address NOT IN (${excludeList.map(() => '?').join(',')})`
    : '';
  const row = getLeaderboardDb()
    .prepare(
      `SELECT COUNT(DISTINCT address) as cnt FROM (
         SELECT maker_address AS address FROM trade_fills
           WHERE timestamp_ms >= ? AND timestamp_ms < ?
         UNION
         SELECT taker_address AS address FROM trade_fills
           WHERE timestamp_ms >= ? AND timestamp_ms < ?
       )
       WHERE 1=1 ${excludeClause}`
    )
    .get(weekStartMs, weekEndMs, weekStartMs, weekEndMs, ...excludeList) as { cnt: number };
  return row.cnt;
}

export function setWeeklyParticipantCount(weekId: string, count: number): void {
  setIndexerState(`weekly_participants_${weekId}`, String(count));
}

export function getWeeklyParticipantCount(weekId: string): number {
  const val = getIndexerState(`weekly_participants_${weekId}`);
  return val !== null ? parseInt(val, 10) : 0;
}

/** Individual trader weekly score. */
export function getTraderWeeklyScore(weekId: string, address: string): WeeklyScoreRow | null {
  return (getLeaderboardDb()
    .prepare('SELECT * FROM trader_points_weekly WHERE week_id = ? AND address = ?')
    .get(weekId, address) as WeeklyScoreRow | undefined) ?? null;
}

