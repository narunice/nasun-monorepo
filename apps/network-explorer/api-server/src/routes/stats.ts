import { Hono, type Context } from 'hono';
import { sql, pointsDb } from '../db.js';
import { cached } from '../cache.js';
import { OFFCHAIN_CATEGORIES } from '../config/categories.js';
import {
  readNetworkDailyStats,
  computeTodayTxGas,
  computeTodayActiveAddresses,
} from '../scanner/network-daily-rollup.js';

const app = new Hono();

// Owner type constants from sui-indexer schema (smallint)
const OWNER_TYPE_ADDRESS = 1;

// Known coin types for token stats queries.
// Source of truth: packages/devnet-config/devnet-ids.json
// Update after devnet reset: sync coin types with devnet-ids.json
// NOTE: sui-indexer stores coin_type with zero-padded 64-char hex addresses
const KNOWN_COIN_TYPES = [
  '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
  '0xeb10b5a62d591da68c4ea2bb2a18d2b440f855d6dfae2252d485733898ad5b11::nbtc::NBTC',
  '0xeb10b5a62d591da68c4ea2bb2a18d2b440f855d6dfae2252d485733898ad5b11::nusdc::NUSDC',
  '0xe09adc42e0c830fe5f85b839fc8ff2d53045c06da1cf31abec8e72efb903daa9::neth::NETH',
  '0xe09adc42e0c830fe5f85b839fc8ff2d53045c06da1cf31abec8e72efb903daa9::nsol::NSOL',
] as const;

// Map zero-padded indexer coin types back to standard short form for API response
function normalizeAddress(coinType: string): string {
  return coinType.replace(/^0x0+/, '0x');
}

// Allowed limit values to prevent cache fragmentation
const ALLOWED_LIMITS = [25, 50, 100, 200] as const;

function parseLimit(raw: string | undefined): number {
  const n = Number(raw ?? 50);
  if (Number.isNaN(n) || n < 1) return 50;
  // Snap to nearest allowed value
  return ALLOWED_LIMITS.reduce((prev, curr) =>
    Math.abs(curr - n) < Math.abs(prev - n) ? curr : prev
  );
}

function parseDays(range: string | undefined): number {
  if (range === '30d') return 30;
  if (range === '14d') return 14;
  return 7;
}

/**
 * Uniform failure response for the read-only stats endpoints.
 *
 * Every loader below deliberately lets its error escape the `cached()` wrapper.
 * `cached()` memoises only a resolved value, so a query that fails stays
 * uncached and the next request retries -- whereas the catch-and-return-[]
 * these handlers used to share turned a timeout into a "successfully empty"
 * answer and pinned it for the rest of the TTL. That is how /network-summary
 * spent months reporting uniqueAddresses = 0, and it is indistinguishable from
 * a genuinely empty network to every caller.
 *
 * Shape mirrors the leaderboard's transient failure in routes/ecosystem.ts so
 * clients only have to understand one retry contract.
 */
function statsUnavailable(c: Context, code: string, err: unknown) {
  console.error(`${code} query failed:`, err);
  return c.json({ error: code, retryAfterMs: 30_000 }, 503);
}

// Native NSN coin type as the indexer stores it (zero-padded 64-char address).
// Spelled out rather than indexed off KNOWN_COIN_TYPES: that array carries an
// instruction to re-sync it after every devnet reset, and a reorder there must
// not silently re-point the account ranking at some other coin.
const NATIVE_COIN_TYPE =
  '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI';
// The zero address owns burn/system coin objects and is never a real account.
const ZERO_ADDRESS_BYTEA = Buffer.alloc(32);

// Token stats: holder count + circulating supply per known coin type (DB-only)
app.get('/tokens', async (c) => {
  const getTokenStats = cached('token-stats', 5 * 60 * 1000, async () => {
    const rows = await sql`
      SELECT
        coin_type,
        COUNT(DISTINCT owner_id) AS holders,
        SUM(coin_balance)::text AS circulating_supply
      FROM objects
      WHERE owner_type = ${OWNER_TYPE_ADDRESS}
        AND coin_type = ANY(${KNOWN_COIN_TYPES as unknown as string[]})
      GROUP BY coin_type
    `;
    return rows.map((r: Record<string, unknown>) => ({
      coinType: normalizeAddress(r.coin_type as string),
      holders: Number(r.holders),
      circulatingSupply: (r.circulating_supply as string) ?? null,
    }));
  });

  let data: Awaited<ReturnType<typeof getTokenStats>>;
  try {
    data = await getTokenStats();
  } catch (err) {
    return statsUnavailable(c, 'token_stats_unavailable', err);
  }
  c.header('Cache-Control', 'public, max-age=300');
  return c.json({ data });
});

// Daily gas cost aggregated from checkpoints
app.get('/daily-gas', async (c) => {
  const days = parseDays(c.req.query('range'));

  // Complete days come from network_daily_stats (nasun_points), today is computed live.
  // See scanner/network-daily-rollup.ts for why: the indexer only retains ~32 days, so
  // reading history straight from `checkpoints` capped what these charts could ever show.
  const getDailyGas = cached(`daily-gas-${days}`, 5 * 60 * 1000, async () => {
    const [history, today] = await Promise.all([
      readNetworkDailyStats(days),
      computeTodayTxGas(),
    ]);
    const rows = [...history.map((r) => ({
      date: r.day,
      totalGasCost: r.totalGasCost,
      avgGasPerTx: r.avgGasPerTx,
      txCount: r.txCount,
    }))];
    if (today) {
      rows.push({
        date: today.day,
        totalGasCost: today.totalGasCost,
        avgGasPerTx: today.avgGasPerTx,
        txCount: today.txCount,
      });
    }
    return rows;
  });

  let data: Awaited<ReturnType<typeof getDailyGas>>;
  try {
    data = await getDailyGas();
  } catch (err) {
    return statsUnavailable(c, 'daily_gas_unavailable', err);
  }
  c.header('Cache-Control', 'public, max-age=300');
  return c.json({ data, range: `${days}d` });
});

// Top accounts by native NSN balance, straight from the indexer's `objects` table.
//
// The previous shape discovered up to 500 addresses from `tx_affected_addresses`
// UNION `objects`, then fanned out one `suix_getBalance` RPC call per address.
// Two things were wrong with it: the `LIMIT` sat *outside* the UNION, so Postgres
// had to dedupe ~129M rows before it could apply the cap (32s, then a statement
// timeout once the table passed ~126M rows), and "top" only ever meant "the
// largest among an arbitrary 500", never the actual top of the network.
//
// `objects` already carries `coin_balance` per coin object plus the partial index
// `objects_coin (owner_id, coin_type) WHERE coin_type IS NOT NULL AND owner_type = 1`,
// so the real ranking is a single grouped aggregate — 0.4s, no RPC fan-out at all.
// Balances are indexer-derived rather than live RPC reads; at the current lag
// (sub-second) that difference is not observable in this view.
app.get('/top-accounts', async (c) => {
  const limit = parseLimit(c.req.query('limit'));

  const getTopAccounts = cached(`top-accounts-${limit}`, 60 * 1000, async () => {
    const rows = await sql`
      SELECT
        '0x' || encode(owner_id, 'hex') AS address,
        SUM(coin_balance)::text         AS balance,
        COUNT(*)::int                   AS coin_count
      FROM objects
      WHERE owner_type = ${OWNER_TYPE_ADDRESS}
        AND coin_type = ${NATIVE_COIN_TYPE}
        AND owner_id <> ${ZERO_ADDRESS_BYTEA}
      GROUP BY owner_id
      HAVING SUM(coin_balance) > 0
      ORDER BY SUM(coin_balance) DESC
      LIMIT ${limit}
    `;
    return rows.map((r: Record<string, unknown>) => ({
      address: r.address as string,
      balance: r.balance as string,
      coinCount: Number(r.coin_count),
    }));
  });

  let data: Awaited<ReturnType<typeof getTopAccounts>>;
  try {
    data = await getTopAccounts();
  } catch (err) {
    return statsUnavailable(c, 'top_accounts_unavailable', err);
  }
  c.header('Cache-Control', 'public, max-age=60');
  return c.json({ data, count: data.length });
});

// Active addresses: unique senders per day (checkpoint-derived tx ranges — avoids scanning transactions table)
app.get('/active-addresses', async (c) => {
  const days = parseDays(c.req.query('range'));

  // 15min TTL: today's DISTINCT sender scan is still ~14s. Before the rollup the same
  // scan ran once per day in the window, which put range=14d and 30d past the request
  // timeout. The catch that used to sit here then returned [] and this cache served
  // that empty array for 15 minutes, so the charts looked simply "empty" rather than
  // broken -- the failure mode statsUnavailable now exists to prevent.
  const getActiveAddresses = cached(`active-addresses-${days}`, 15 * 60 * 1000, async () => {
    const [history, today] = await Promise.all([
      readNetworkDailyStats(days),
      computeTodayActiveAddresses(),
    ]);
    const rows = history.map((r) => ({ date: r.day, activeAddresses: r.activeAddresses }));
    if (today) rows.push({ date: today.day, activeAddresses: today.activeAddresses });
    return rows;
  });

  let data: Awaited<ReturnType<typeof getActiveAddresses>>;
  try {
    data = await getActiveAddresses();
  } catch (err) {
    return statsUnavailable(c, 'active_addresses_unavailable', err);
  }
  c.header('Cache-Control', 'public, max-age=300');
  return c.json({ data, range: `${days}d` });
});

// Network summary: split into fast (checkpoint-derived) and slow (unique addresses) cache groups
// Errors deliberately propagate out of these two: `cached()` only memoises a
// resolved value, so swallowing a failure into a zeroed object (which is what
// both of these used to do) pinned that fabricated answer in the cache for a
// full TTL. A failed scan must stay uncached so the next request retries.
//
// "fast" is relative -- `events` is a partitioned parent, so COUNT(*) fans out
// across partitions and takes ~9s cold.
const getFastStats = cached('network-summary-fast', 5 * 60 * 1000, async () => {
  const [[cpStats], [pkgCount], [eventCount]] = await Promise.all([
    // Checkpoint-based aggregate: tx count + cp count + latest checkpoint in one scan
    // Reuses SUM(max_tx - min_tx + 1) pattern from daily-transactions endpoint
    sql`SELECT
      COUNT(*) as cp_count,
      SUM(max_tx_sequence_number - min_tx_sequence_number + 1)::bigint as total_tx,
      MAX(sequence_number) as latest_seq,
      MAX(timestamp_ms) as latest_ts
    FROM checkpoints`,
    sql`SELECT COUNT(*) as count FROM packages`,
    sql`SELECT COUNT(*) as count FROM events`,
  ]);
  return { cpStats, pkgCount, eventCount };
});

// 30min TTL: this scans the whole retained tx window (~7s on cache miss).
const getSlowStats = cached('network-summary-slow', 30 * 60 * 1000, async () => {
  // COUNT(DISTINCT sender) makes the planner sort all ~126M rows; grouping
  // instead lets it hash-aggregate into the ~11k real sender groups, which is
  // the difference between 7s and a statement timeout. Combined with the catch
  // that used to sit here, that timeout is why this endpoint spent months
  // quietly reporting uniqueAddresses = 0.
  const [addrCount] = await sql`
    SELECT COUNT(*)::text AS count
    FROM (
      SELECT 1 FROM tx_affected_addresses WHERE sender IS NOT NULL GROUP BY sender
    ) senders
  `;
  return { uniqueAddresses: Number(addrCount?.count ?? 0) };
});

// Prime both caches shortly after boot, chained rather than parallel. Cold-path
// cost is ~9s + ~7s of scanning, which is past the explorer client's 15s abort
// in lib/explorer-api.ts -- so the first request after a restart would have died
// client-side and looked like flakiness. Priming here means no user request ever
// pays for the cold scan. Failures stay uncached and simply retry on demand, so
// a database that is not up yet is harmless.
//
// Delayed, not immediate: running these at import time put two large scans in
// front of the deploy script's post-restart health check, whose own query is a
// full `checkpoints` scan on a 5s curl timeout. That contention failed a real
// deploy. The delay keeps priming well inside the 5min TTL while leaving the
// boot window clear. `unref()` so a pending timer never holds the process open.
const CACHE_PRIME_DELAY_MS = 30_000;
setTimeout(() => {
  void getFastStats()
    .then(() => getSlowStats())
    .catch(() => {});
}, CACHE_PRIME_DELAY_MS).unref();

app.get('/network-summary', async (c) => {
  // Sequential, not Promise.all: on a cold cache these are four large scans
  // against the same database, and running them together was enough contention
  // to push one past the 30s pool statement_timeout even though each finishes
  // in 0.05-9s on its own. The TTLs mean this only costs anything on a miss.
  let fast: Awaited<ReturnType<typeof getFastStats>>;
  let slow: Awaited<ReturnType<typeof getSlowStats>>;
  try {
    fast = await getFastStats();
    slow = await getSlowStats();
  } catch (err) {
    return statsUnavailable(c, 'network_summary_unavailable', err);
  }
  c.header('Cache-Control', 'public, max-age=300');
  return c.json({
    data: {
      totalTransactions: Number(fast.cpStats?.total_tx ?? 0),
      totalCheckpoints: Number(fast.cpStats?.cp_count ?? 0),
      uniqueAddresses: slow.uniqueAddresses,
      totalPackages: Number(fast.pkgCount?.count ?? 0),
      totalEvents: Number(fast.eventCount?.count ?? 0),
      latestCheckpoint: fast.cpStats?.latest_seq?.toString() ?? null,
      latestTimestamp: fast.cpStats?.latest_ts?.toString() ?? null,
    },
  });
});

// Daily transaction counts (derived from checkpoints — fast even on 60M+ tx)
app.get('/daily-transactions', async (c) => {
  const days = parseDays(c.req.query('range'));

  const getDailyTx = cached(`daily-tx-${days}`, 5 * 60 * 1000, async () => {
    const [history, today] = await Promise.all([
      readNetworkDailyStats(days),
      computeTodayTxGas(),
    ]);
    const rows = history.map((r) => ({ date: r.day, transactions: r.txCount }));
    if (today) rows.push({ date: today.day, transactions: today.txCount });
    return rows;
  });

  let data: Awaited<ReturnType<typeof getDailyTx>>;
  try {
    data = await getDailyTx();
  } catch (err) {
    return statsUnavailable(c, 'daily_transactions_unavailable', err);
  }
  c.header('Cache-Control', 'public, max-age=300');
  return c.json({ data, range: `${days}d` });
});

// Daily metrics for devnet admin dashboard.
// Source of truth: nasun_points.activity_points (all point-earning wallet activity).
// DAU = distinct wallets active on date. new = wallets whose first-ever activity_points
// row is on date. cumulative = rolling distinct wallet count up to and including date.
// dailyTx is populated from sui-indexer checkpoints when available (post-indexer-reset
// 2026-04-14); null when the indexer has no checkpoints covering the date.
app.get('/daily-metrics', async (c) => {
  const dateParam = c.req.query('date');
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateParam || !DATE_RE.test(dateParam)) {
    return c.json({ error: 'date query param required in YYYY-MM-DD format' }, 400);
  }
  if (!pointsDb) {
    return c.json({ error: 'points db not configured' }, 503);
  }

  const compute = cached(`daily-metrics-${dateParam}`, 30 * 60 * 1000, async () => {
    const [agg] = await pointsDb!`
      WITH onchain AS (
        SELECT wallet_address, tx_timestamp::date AS day
        FROM activity_points
        WHERE category NOT IN ${pointsDb!(OFFCHAIN_CATEGORIES)}
      ),
      first_seen AS (
        SELECT wallet_address, MIN(day) AS first_day
        FROM onchain
        GROUP BY wallet_address
      ),
      active AS (
        SELECT DISTINCT wallet_address
        FROM onchain
        WHERE day = ${dateParam}::date
      )
      SELECT
        (SELECT COUNT(*) FROM active)::int AS dau,
        (SELECT COUNT(*) FROM active a JOIN first_seen f USING (wallet_address)
         WHERE f.first_day = ${dateParam}::date)::int AS new_addresses,
        (SELECT COUNT(*) FROM first_seen WHERE first_day <= ${dateParam}::date)::int AS cumulative
    `;

    // dailyTx from sui-indexer checkpoints; null if indexer doesn't cover the date
    let dailyTx: number | null = null;
    try {
      const [tx] = await sql`
        SELECT SUM(max_tx_sequence_number - min_tx_sequence_number + 1)::bigint AS tx_count
        FROM checkpoints
        WHERE timestamp_ms >= EXTRACT(EPOCH FROM ${dateParam}::date) * 1000
          AND timestamp_ms < EXTRACT(EPOCH FROM (${dateParam}::date + interval '1 day')) * 1000
      `;
      if (tx?.tx_count != null) dailyTx = Number(tx.tx_count);
    } catch (err) {
      console.warn('daily-metrics: checkpoint tx query failed:', err);
    }

    return {
      date: dateParam,
      dau: Number(agg?.dau ?? 0),
      newAddresses: Number(agg?.new_addresses ?? 0),
      cumulativeAddresses: Number(agg?.cumulative ?? 0),
      dailyTx,
    };
  });

  try {
    const data = await compute();
    c.header('Cache-Control', 'public, max-age=1800');
    return c.json(data);
  } catch (err) {
    console.error('daily-metrics query failed:', err);
    return c.json({ error: 'query failed' }, 500);
  }
});

// Daily metrics over a date RANGE for the devnet admin dashboard. Single PG range scan that returns the
// SAME per-day { date, dau, newAddresses, cumulativeAddresses, dailyTx } shape as GET /daily-metrics, for
// every day in [from, to] inclusive (gaps zero-filled). This collapses the box admin compute's former
// N per-day round-trips (one /daily-metrics call per day) into one request. Definitions are byte-parity
// with the single-date route:
//   dau               = distinct wallets with on-chain activity on the day
//   newAddresses      = wallets whose first-ever on-chain activity is on the day
//   cumulativeAddresses = rolling distinct wallet count up to and including the day
//                       = (count of first activity BEFORE `from`) + running sum of newAddresses in-range
//   dailyTx           = sui-indexer checkpoint tx count for the day (null when uncovered; different DB)
const MAX_RANGE_DAYS = 400;
app.get('/daily-metrics-range', async (c) => {
  const fromParam = c.req.query('from');
  const toParam = c.req.query('to');
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if (!fromParam || !DATE_RE.test(fromParam) || !toParam || !DATE_RE.test(toParam)) {
    return c.json({ error: 'from and to query params required in YYYY-MM-DD format' }, 400);
  }
  if (fromParam > toParam) {
    return c.json({ error: 'from must be <= to' }, 400);
  }
  // Span guard: bound the scan window (lexical compare is safe for YYYY-MM-DD; exact day count is enforced
  // in SQL via generate_series, this is just a cheap pre-check against an absurd range).
  const spanDays = Math.round(
    (Date.parse(`${toParam}T00:00:00Z`) - Date.parse(`${fromParam}T00:00:00Z`)) / 86400000,
  ) + 1;
  if (spanDays > MAX_RANGE_DAYS) {
    return c.json({ error: `range too large (max ${MAX_RANGE_DAYS} days)` }, 400);
  }
  if (!pointsDb) {
    return c.json({ error: 'points db not configured' }, 503);
  }

  const compute = cached(`daily-metrics-range-${fromParam}-${toParam}`, 30 * 60 * 1000, async () => {
    // dau / new / cumulative from nasun_points.activity_points (one range scan).
    const rows = await pointsDb!<
      { date: string; dau: number; new_addresses: number; cumulative: number }[]
    >`
      WITH onchain AS (
        SELECT wallet_address, tx_timestamp::date AS day
        FROM activity_points
        WHERE category NOT IN ${pointsDb!(OFFCHAIN_CATEGORIES)}
      ),
      first_seen AS (
        SELECT wallet_address, MIN(day) AS first_day
        FROM onchain
        GROUP BY wallet_address
      ),
      days AS (
        SELECT generate_series(${fromParam}::date, ${toParam}::date, interval '1 day')::date AS day
      ),
      dau AS (
        SELECT day, COUNT(DISTINCT wallet_address) AS dau
        FROM onchain
        WHERE day BETWEEN ${fromParam}::date AND ${toParam}::date
        GROUP BY day
      ),
      new_per_day AS (
        SELECT first_day AS day, COUNT(*) AS new_addresses
        FROM first_seen
        WHERE first_day BETWEEN ${fromParam}::date AND ${toParam}::date
        GROUP BY first_day
      ),
      baseline AS (
        SELECT COUNT(*)::bigint AS c FROM first_seen WHERE first_day < ${fromParam}::date
      )
      SELECT
        to_char(d.day, 'YYYY-MM-DD') AS date,
        COALESCE(dau.dau, 0)::int AS dau,
        COALESCE(n.new_addresses, 0)::int AS new_addresses,
        (b.c + SUM(COALESCE(n.new_addresses, 0)) OVER (ORDER BY d.day))::int AS cumulative
      FROM days d
      CROSS JOIN baseline b
      LEFT JOIN dau ON dau.day = d.day
      LEFT JOIN new_per_day n ON n.day = d.day
      ORDER BY d.day
    `;

    // dailyTx per day from sui-indexer checkpoints (a DIFFERENT db -> separate query, merged in JS).
    // Day bucketing is timezone-independent: floor(timestamp_ms / 86400000) is the UTC day index, the same
    // boundary the single-date route uses (EXTRACT(EPOCH FROM date) * 1000). Best-effort: a failure leaves
    // every day's dailyTx null (parity with the single-date checkpoint try/catch).
    const txByDate = new Map<string, number>();
    try {
      const txRows = await sql<{ day: string; tx_count: string | number }[]>`
        SELECT
          to_char(DATE '1970-01-01' + (timestamp_ms / 1000 / 86400)::int, 'YYYY-MM-DD') AS day,
          SUM(max_tx_sequence_number - min_tx_sequence_number + 1)::bigint AS tx_count
        FROM checkpoints
        WHERE timestamp_ms >= EXTRACT(EPOCH FROM ${fromParam}::date) * 1000
          AND timestamp_ms < EXTRACT(EPOCH FROM (${toParam}::date + interval '1 day')) * 1000
        GROUP BY 1
      `;
      for (const r of txRows) {
        if (r.tx_count != null) txByDate.set(r.day, Number(r.tx_count));
      }
    } catch (err) {
      console.warn('daily-metrics-range: checkpoint tx query failed:', err);
    }

    return rows.map((r) => ({
      date: r.date,
      dau: Number(r.dau) || 0,
      newAddresses: Number(r.new_addresses) || 0,
      cumulativeAddresses: Number(r.cumulative) || 0,
      dailyTx: txByDate.has(r.date) ? txByDate.get(r.date)! : null,
    }));
  });

  try {
    const data = await compute();
    c.header('Cache-Control', 'public, max-age=1800');
    return c.json({ data, range: `${fromParam}..${toParam}` });
  } catch (err) {
    console.error('daily-metrics-range query failed:', err);
    return c.json({ error: 'query failed' }, 500);
  }
});

export default app;
