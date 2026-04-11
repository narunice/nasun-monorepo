import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
  LeaderboardConfig,
  TradeFillRow,
  TraderStatsRow,
  TraderPnlStatsRow,
  TraderScoreRow,
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
  db.pragma('synchronous = NORMAL');
  db.pragma('auto_vacuum = INCREMENTAL');

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
      timestamp_ms INTEGER NOT NULL,
      UNIQUE(tx_digest, event_seq)
    );

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

    CREATE TABLE IF NOT EXISTS points_snapshots (
      snapshot_date TEXT NOT NULL,
      address TEXT NOT NULL,
      total_points INTEGER NOT NULL,
      points_from_trades INTEGER NOT NULL,
      points_from_volume INTEGER NOT NULL,
      points_from_diversity INTEGER NOT NULL,
      points_from_pnl INTEGER NOT NULL,
      trade_count INTEGER NOT NULL,
      volume_quote TEXT NOT NULL,
      rank INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (snapshot_date, address)
    );

    CREATE INDEX IF NOT EXISTS idx_snapshots_address
      ON points_snapshots(address, snapshot_date DESC);

    CREATE INDEX IF NOT EXISTS idx_snapshots_date_rank
      ON points_snapshots(snapshot_date, rank ASC);

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

  // Migration: add points_from_pnl to trader_points
  const pointsCols = db.prepare("PRAGMA table_info('trader_points')").all() as Array<{ name: string }>;
  const pointsColNames = new Set(pointsCols.map(c => c.name));
  if (!pointsColNames.has('points_from_pnl')) {
    db.exec('ALTER TABLE trader_points ADD COLUMN points_from_pnl INTEGER NOT NULL DEFAULT 0');
  }

  // Migration: create trader_scores table (replaces trader_points)
  db.exec(`
    CREATE TABLE IF NOT EXISTS trader_scores (
      address TEXT NOT NULL,
      scope TEXT NOT NULL CHECK(scope IN ('weekly', 'alltime')),
      total_score INTEGER NOT NULL DEFAULT 0,
      score_from_trades INTEGER NOT NULL DEFAULT 0,
      score_from_volume INTEGER NOT NULL DEFAULT 0,
      score_from_diversity INTEGER NOT NULL DEFAULT 0,
      score_from_pnl INTEGER NOT NULL DEFAULT 0,
      trade_count INTEGER NOT NULL DEFAULT 0,
      volume_quote TEXT NOT NULL DEFAULT '0',
      rank INTEGER NOT NULL DEFAULT 0,
      prev_rank INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (address, scope)
    );

    CREATE INDEX IF NOT EXISTS idx_scores_scope_rank
      ON trader_scores(scope, rank ASC);
  `);

  // Migration: rename points_snapshots -> score_snapshots
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='points_snapshots'").all();
  if (tables.length > 0) {
    const scoreSnapExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='score_snapshots'").all();
    if (scoreSnapExists.length === 0) {
      db.exec('ALTER TABLE points_snapshots RENAME TO score_snapshots');
    }
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS score_snapshots (
        snapshot_date TEXT NOT NULL,
        address TEXT NOT NULL,
        total_points INTEGER NOT NULL,
        points_from_trades INTEGER NOT NULL,
        points_from_volume INTEGER NOT NULL,
        points_from_diversity INTEGER NOT NULL,
        points_from_pnl INTEGER NOT NULL,
        trade_count INTEGER NOT NULL,
        volume_quote TEXT NOT NULL,
        rank INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (snapshot_date, address)
      );

      CREATE INDEX IF NOT EXISTS idx_snapshots_address
        ON score_snapshots(address, snapshot_date DESC);

      CREATE INDEX IF NOT EXISTS idx_snapshots_date_rank
        ON score_snapshots(snapshot_date, rank ASC);
    `);
  }
}

export function getLeaderboardDb(): Database.Database {
  if (!db) throw new Error('Leaderboard store not initialized. Call initLeaderboardStore() first.');
  return db;
}

export function closeLeaderboardStore(): void {
  if (db) {
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
          price, base_quantity, quote_quantity, taker_is_bid, timestamp_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      fill.tx_digest, fill.event_seq, fill.pool_id,
      fill.maker_address, fill.taker_address,
      fill.maker_order_id ?? null, fill.taker_order_id ?? null,
      fill.price, fill.base_quantity, fill.quote_quantity,
      fill.taker_is_bid, fill.timestamp_ms,
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

// ===== Aggregation Queries =====

interface AggregatedTrader {
  address: string;
  volume_quote: string;
  trade_count: number;
  unique_pools: number;
  last_trade_at: number;
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
): AggregatedTrader[] {
  const ldb = getLeaderboardDb();

  // Build exclusion clause
  const excludeList = [...excludedAddresses];
  const excludePlaceholders = excludeList.length > 0
    ? `AND address NOT IN (${excludeList.map(() => '?').join(',')})`
    : '';

  const query = `
    SELECT
      address,
      CAST(SUM(CAST(quote_volume AS INTEGER)) AS TEXT) as volume_quote,
      COUNT(*) as trade_count,
      COUNT(DISTINCT pool_id) as unique_pools,
      MAX(timestamp_ms) as last_trade_at
    FROM (
      SELECT maker_address as address, quote_quantity as quote_volume, pool_id, timestamp_ms
      FROM trade_fills WHERE timestamp_ms >= ?
      UNION ALL
      SELECT taker_address as address, quote_quantity as quote_volume, pool_id, timestamp_ms
      FROM trade_fills WHERE timestamp_ms >= ?
    )
    WHERE 1=1 ${excludePlaceholders}
    GROUP BY address
    ORDER BY SUM(CAST(quote_volume AS INTEGER)) DESC
    LIMIT ?
  `;

  const params = cutoffMs > 0
    ? [cutoffMs, cutoffMs, ...excludeList, limit]
    : [0, 0, ...excludeList, limit];

  return ldb.prepare(query).all(...params) as AggregatedTrader[];
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
       updated_at = excluded.updated_at`
  );

  const tx = ldb.transaction(() => {
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
        t.uniquePools, t.lastTradeAt, t.rank, t.rank, // prev_rank = rank for INSERT only
        now,
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

  // Fetch ALL fills for this address, chronologically ascending
  const rows = ldb.prepare(`
    SELECT * FROM (
      SELECT id, pool_id, maker_address, taker_address,
             price, base_quantity, taker_is_bid
      FROM trade_fills WHERE maker_address = ?
      UNION
      SELECT id, pool_id, maker_address, taker_address,
             price, base_quantity, taker_is_bid
      FROM trade_fills WHERE taker_address = ?
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

// ===== PnL Aggregation =====

interface RawPnlRow {
  address: string;
  buy_base: number;
  buy_quote: number;
  sell_base: number;
  sell_quote: number;
  trade_count: number;
}

/**
 * Aggregate per-trader buy/sell totals for PnL calculation.
 * Uses weighted average cost basis: PnL = matched_qty * (avg_sell - avg_buy).
 */
export function aggregateTraderPnlRaw(
  cutoffMs: number,
  excludedAddresses: Set<string>,
): RawPnlRow[] {
  const ldb = getLeaderboardDb();

  const excludeList = [...excludedAddresses];
  const excludePlaceholders = excludeList.length > 0
    ? `AND address NOT IN (${excludeList.map(() => '?').join(',')})`
    : '';

  const query = `
    SELECT
      address,
      SUM(CASE WHEN is_buy = 1 THEN CAST(base_qty AS REAL) ELSE 0.0 END) as buy_base,
      SUM(CASE WHEN is_buy = 1 THEN CAST(quote_qty AS REAL) ELSE 0.0 END) as buy_quote,
      SUM(CASE WHEN is_buy = 0 THEN CAST(base_qty AS REAL) ELSE 0.0 END) as sell_base,
      SUM(CASE WHEN is_buy = 0 THEN CAST(quote_qty AS REAL) ELSE 0.0 END) as sell_quote,
      COUNT(*) as trade_count
    FROM (
      SELECT taker_address as address, base_quantity as base_qty, quote_quantity as quote_qty,
             taker_is_bid as is_buy, timestamp_ms
      FROM trade_fills WHERE timestamp_ms >= ?
      UNION ALL
      SELECT maker_address as address, base_quantity as base_qty, quote_quantity as quote_qty,
             CASE WHEN taker_is_bid = 1 THEN 0 ELSE 1 END as is_buy, timestamp_ms
      FROM trade_fills WHERE timestamp_ms >= ?
    )
    WHERE 1=1 ${excludePlaceholders}
    GROUP BY address
    HAVING MIN(buy_base, sell_base) > 0
  `;

  const params = [cutoffMs, cutoffMs, ...excludeList];
  return ldb.prepare(query).all(...params) as RawPnlRow[];
}

/**
 * Compute realized PnL from raw buy/sell totals.
 * Returns sorted array with PnL values (highest PnL first).
 */
export function computeTraderPnl(
  cutoffMs: number,
  excludedAddresses: Set<string>,
  limit: number = 100,
): Array<{ address: string; realizedPnlRaw: number; pnlPercent: number; tradeCount: number }> {
  const rawRows = aggregateTraderPnlRaw(cutoffMs, excludedAddresses);

  const results: Array<{ address: string; realizedPnlRaw: number; pnlPercent: number; tradeCount: number }> = [];

  for (const row of rawRows) {
    if (row.buy_base <= 0 || row.sell_base <= 0) continue;

    const matchedBase = Math.min(row.buy_base, row.sell_base);
    const buyRatio = matchedBase / row.buy_base;
    const sellRatio = matchedBase / row.sell_base;

    const costBasis = buyRatio * row.buy_quote;
    const revenue = sellRatio * row.sell_quote;
    const realizedPnlRaw = revenue - costBasis;

    const pnlPercent = costBasis > 0 ? (realizedPnlRaw / costBasis) * 100 : 0;

    results.push({
      address: row.address,
      realizedPnlRaw: Math.round(realizedPnlRaw), // round to nearest raw unit
      pnlPercent: Math.round(pnlPercent * 100) / 100, // 2 decimal places
      tradeCount: row.trade_count,
    });
  }

  // Sort by absolute PnL descending (best performers first — both profit and loss matter for ranking)
  results.sort((a, b) => b.realizedPnlRaw - a.realizedPnlRaw);

  return results.slice(0, limit);
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
        t.tradeCount, t.rank, t.rank, // prev_rank = rank for INSERT only
        now,
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

// ===== Score System =====

interface DailyTraderStats {
  address: string;
  trade_date: string;
  trade_count: number;
  volume_raw: string;
}

/**
 * Aggregate trade stats per trader per day (for daily cap enforcement).
 * Returns Map<address, DailyTraderStats[]>.
 */
export function aggregateDailyTraderStats(
  cutoffMs: number,
  excludedAddresses: Set<string>,
): Map<string, DailyTraderStats[]> {
  const ldb = getLeaderboardDb();
  const excludeList = [...excludedAddresses];
  const excludePlaceholders = excludeList.length > 0
    ? `AND address NOT IN (${excludeList.map(() => '?').join(',')})`
    : '';

  const query = `
    SELECT
      address,
      DATE(timestamp_ms / 1000, 'unixepoch') as trade_date,
      COUNT(*) as trade_count,
      CAST(SUM(CAST(quote_volume AS INTEGER)) AS TEXT) as volume_raw
    FROM (
      SELECT maker_address as address, quote_quantity as quote_volume, timestamp_ms
      FROM trade_fills WHERE timestamp_ms >= ?
      UNION ALL
      SELECT taker_address as address, quote_quantity as quote_volume, timestamp_ms
      FROM trade_fills WHERE timestamp_ms >= ?
    )
    WHERE 1=1 ${excludePlaceholders}
    GROUP BY address, trade_date
    ORDER BY address, trade_date
  `;

  const params = [cutoffMs, cutoffMs, ...excludeList];
  const rows = ldb.prepare(query).all(...params) as DailyTraderStats[];

  const map = new Map<string, DailyTraderStats[]>();
  for (const row of rows) {
    const existing = map.get(row.address);
    if (existing) {
      existing.push(row);
    } else {
      map.set(row.address, [row]);
    }
  }
  return map;
}

/**
 * Aggregate unique pool count per trader.
 */
export function aggregateUniquePools(
  cutoffMs: number,
  excludedAddresses: Set<string>,
): Map<string, number> {
  const ldb = getLeaderboardDb();
  const excludeList = [...excludedAddresses];
  const excludePlaceholders = excludeList.length > 0
    ? `AND address NOT IN (${excludeList.map(() => '?').join(',')})`
    : '';

  const query = `
    SELECT address, COUNT(DISTINCT pool_id) as unique_pools
    FROM (
      SELECT maker_address as address, pool_id FROM trade_fills WHERE timestamp_ms >= ?
      UNION ALL
      SELECT taker_address as address, pool_id FROM trade_fills WHERE timestamp_ms >= ?
    )
    WHERE 1=1 ${excludePlaceholders}
    GROUP BY address
  `;

  const params = [cutoffMs, cutoffMs, ...excludeList];
  const rows = ldb.prepare(query).all(...params) as Array<{ address: string; unique_pools: number }>;

  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.address, row.unique_pools);
  }
  return map;
}

/**
 * Replace score data for a scope. prev_rank is preserved on conflict (only rotatePrevRanks updates it).
 */
export function replaceTraderScores(
  scope: string,
  traders: Array<{
    address: string;
    totalScore: number;
    scoreFromTrades: number;
    scoreFromVolume: number;
    scoreFromDiversity: number;
    scoreFromPnl: number;
    tradeCount: number;
    volumeQuote: string;
    rank: number;
  }>,
): void {
  const ldb = getLeaderboardDb();
  const now = Date.now();

  const replaceStmt = ldb.prepare(
    `INSERT INTO trader_scores (address, scope, total_score, score_from_trades, score_from_volume,
       score_from_diversity, score_from_pnl, trade_count, volume_quote, rank, prev_rank, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(address, scope) DO UPDATE SET
       total_score = excluded.total_score,
       score_from_trades = excluded.score_from_trades,
       score_from_volume = excluded.score_from_volume,
       score_from_diversity = excluded.score_from_diversity,
       score_from_pnl = excluded.score_from_pnl,
       trade_count = excluded.trade_count,
       volume_quote = excluded.volume_quote,
       rank = excluded.rank,
       updated_at = excluded.updated_at`
  );

  const tx = ldb.transaction(() => {
    const addresses = traders.map((t) => t.address);
    if (addresses.length > 0) {
      const placeholders = addresses.map(() => '?').join(',');
      ldb.prepare(
        `DELETE FROM trader_scores WHERE scope = ? AND address NOT IN (${placeholders})`
      ).run(scope, ...addresses);
    } else {
      ldb.prepare('DELETE FROM trader_scores WHERE scope = ?').run(scope);
    }

    for (const t of traders) {
      replaceStmt.run(
        t.address, scope, t.totalScore, t.scoreFromTrades,
        t.scoreFromVolume, t.scoreFromDiversity, t.scoreFromPnl,
        t.tradeCount, t.volumeQuote,
        t.rank, t.rank, // prev_rank = rank for INSERT (new traders show no change)
        now,
      );
    }
  });

  tx();
}

export function getScoreLeaderboard(scope: string, limit: number = 50, offset: number = 0): TraderScoreRow[] {
  return getLeaderboardDb()
    .prepare(
      `SELECT address, scope, total_score, score_from_trades, score_from_volume,
              score_from_diversity, score_from_pnl, trade_count, volume_quote,
              rank, prev_rank, updated_at
       FROM trader_scores
       WHERE scope = ?
       ORDER BY rank ASC
       LIMIT ? OFFSET ?`
    )
    .all(scope, limit, offset) as TraderScoreRow[];
}

export function getTotalScoreTraders(scope: string): number {
  const row = getLeaderboardDb()
    .prepare('SELECT COUNT(*) as cnt FROM trader_scores WHERE scope = ?')
    .get(scope) as { cnt: number };
  return row.cnt;
}

export function getTraderScore(address: string, scope: string): TraderScoreRow | null {
  const row = getLeaderboardDb()
    .prepare(
      `SELECT address, scope, total_score, score_from_trades, score_from_volume,
              score_from_diversity, score_from_pnl, trade_count, volume_quote,
              rank, prev_rank, updated_at
       FROM trader_scores
       WHERE address = ? AND scope = ?`
    )
    .get(address, scope) as TraderScoreRow | undefined;
  return row ?? null;
}

export function clearTraderScores(scope: string): void {
  getLeaderboardDb()
    .prepare('DELETE FROM trader_scores WHERE scope = ?')
    .run(scope);
}

/**
 * Rotate prev_rank = rank for all leaderboard tables (24h cycle).
 * Single transaction across trader_scores, trader_stats, trader_pnl.
 */
export function rotatePrevRanks(): void {
  const ldb = getLeaderboardDb();
  const tx = ldb.transaction(() => {
    ldb.prepare('UPDATE trader_scores SET prev_rank = rank').run();
    ldb.prepare('UPDATE trader_stats SET prev_rank = rank').run();
    ldb.prepare('UPDATE trader_pnl SET prev_rank = rank').run();
  });
  tx();
}

// ===== Score Snapshots =====

interface ScoreSnapshotRow {
  snapshot_date: string;
  address: string;
  total_points: number; // column name kept for backward compat, stores score
  points_from_trades: number;
  points_from_volume: number;
  points_from_diversity: number;
  points_from_pnl: number;
  trade_count: number;
  volume_quote: string;
  rank: number;
  created_at: number;
}

/**
 * Generate a daily score snapshot from all-time scope.
 * Returns 0 if snapshot already exists for the date.
 */
export function generateScoreSnapshot(date: string): number {
  const ldb = getLeaderboardDb();

  const existing = ldb.prepare(
    'SELECT COUNT(*) as cnt FROM score_snapshots WHERE snapshot_date = ?'
  ).get(date) as { cnt: number };
  if (existing.cnt > 0) return 0;

  const now = Date.now();
  const rows = ldb.prepare(
    `SELECT address, total_score, score_from_trades, score_from_volume,
            score_from_diversity, score_from_pnl, trade_count, volume_quote, rank
     FROM trader_scores WHERE scope = 'alltime' ORDER BY rank ASC`
  ).all() as Array<{
    address: string; total_score: number; score_from_trades: number;
    score_from_volume: number; score_from_diversity: number; score_from_pnl: number;
    trade_count: number; volume_quote: string; rank: number;
  }>;

  if (rows.length === 0) return 0;

  const insertStmt = ldb.prepare(
    `INSERT INTO score_snapshots (snapshot_date, address, total_points, points_from_trades,
       points_from_volume, points_from_diversity, points_from_pnl, trade_count,
       volume_quote, rank, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const tx = ldb.transaction(() => {
    for (const r of rows) {
      insertStmt.run(
        date, r.address, r.total_score, r.score_from_trades,
        r.score_from_volume, r.score_from_diversity, r.score_from_pnl,
        r.trade_count, r.volume_quote, r.rank, now,
      );
    }
  });

  tx();
  return rows.length;
}

export function getScoreSnapshot(date: string, limit: number = 50, offset: number = 0): ScoreSnapshotRow[] {
  return getLeaderboardDb()
    .prepare(
      `SELECT * FROM score_snapshots
       WHERE snapshot_date = ?
       ORDER BY rank ASC
       LIMIT ? OFFSET ?`
    )
    .all(date, limit, offset) as ScoreSnapshotRow[];
}

export function getScoreRankHistory(
  address: string,
  days: number = 30,
): Array<{ snapshot_date: string; rank: number; total_points: number }> {
  return getLeaderboardDb()
    .prepare(
      `SELECT snapshot_date, rank, total_points
       FROM score_snapshots
       WHERE address = ?
       ORDER BY snapshot_date DESC
       LIMIT ?`
    )
    .all(address, days) as Array<{ snapshot_date: string; rank: number; total_points: number }>;
}

export function getScoreSnapshotDates(limit: number = 30): string[] {
  const rows = getLeaderboardDb()
    .prepare(
      `SELECT DISTINCT snapshot_date FROM score_snapshots
       ORDER BY snapshot_date DESC LIMIT ?`
    )
    .all(limit) as Array<{ snapshot_date: string }>;
  return rows.map(r => r.snapshot_date);
}

export function getScoreSnapshotTotalTraders(date: string): number {
  const row = getLeaderboardDb()
    .prepare('SELECT COUNT(*) as cnt FROM score_snapshots WHERE snapshot_date = ?')
    .get(date) as { cnt: number };
  return row.cnt;
}

export function purgeOldScoreSnapshots(retentionDays: number = 180): number {
  const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 10);
  const result = getLeaderboardDb()
    .prepare('DELETE FROM score_snapshots WHERE snapshot_date < ?')
    .run(cutoffDate);
  return result.changes;
}
