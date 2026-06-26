import { Hono } from 'hono';
import { sql, pointsDb } from '../db.js';
import { cached } from '../cache.js';
import { getBalance, discoverAddressesViaRpc } from '../rpc.js';
import { OFFCHAIN_CATEGORIES } from '../config/categories.js';

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

// Max addresses to discover from DB (prevents unbounded RPC fan-out)
const MAX_DISCOVERY = 500;
// Concurrent RPC calls limit (prevents overwhelming the RPC node)
const RPC_CONCURRENCY = 20;

function safeBigInt(value: string | undefined | null): bigint {
  if (!value || !/^-?\d+$/.test(value)) return 0n;
  return BigInt(value);
}

// Run async tasks with concurrency limit
async function mapConcurrent<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

// Token stats: holder count + circulating supply per known coin type (DB-only)
app.get('/tokens', async (c) => {
  const getTokenStats = cached('token-stats', 5 * 60 * 1000, async () => {
    try {
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
    } catch (err) {
      console.error('Token stats query failed:', err);
      return [];
    }
  });

  const data = await getTokenStats();
  c.header('Cache-Control', 'public, max-age=300');
  return c.json({ data });
});

// Daily gas cost aggregated from checkpoints
app.get('/daily-gas', async (c) => {
  const days = parseDays(c.req.query('range'));

  const getDailyGas = cached(`daily-gas-${days}`, 5 * 60 * 1000, async () => {
    try {
      const rows = await sql`
        SELECT
          DATE(to_timestamp(timestamp_ms / 1000.0))::text AS day,
          SUM(total_gas_cost)::text AS total_gas_cost,
          CASE WHEN SUM(max_tx_sequence_number - min_tx_sequence_number + 1) > 0
            THEN FLOOR(SUM(total_gas_cost) / SUM(max_tx_sequence_number - min_tx_sequence_number + 1))::text
            ELSE '0'
          END AS avg_gas_per_tx,
          SUM(max_tx_sequence_number - min_tx_sequence_number + 1)::int AS tx_count
        FROM checkpoints
        WHERE timestamp_ms >= (EXTRACT(EPOCH FROM NOW()) - ${days * 86400}) * 1000
        GROUP BY DATE(to_timestamp(timestamp_ms / 1000.0))
        ORDER BY day ASC
      `;
      return rows.map((r: Record<string, unknown>) => ({
        date: r.day,
        totalGasCost: r.total_gas_cost as string,
        avgGasPerTx: r.avg_gas_per_tx as string,
        txCount: Number(r.tx_count),
      }));
    } catch (err) {
      console.error('Daily gas query failed:', err);
      return [];
    }
  });

  const data = await getDailyGas();
  c.header('Cache-Control', 'public, max-age=300');
  return c.json({ data, range: `${days}d` });
});

// RPC-based address discovery (cached separately — expensive but comprehensive)
const getRpcAddresses = cached('rpc-discovered-addresses', 5 * 60 * 1000, async () => {
  return discoverAddressesViaRpc();
});

// Top accounts by SUI balance (hybrid: address discovery from DB + RPC, real-time balance from RPC)
app.get('/top-accounts', async (c) => {
  const limit = parseLimit(c.req.query('limit'));

  const getTopAccounts = cached(`top-accounts-${limit}`, 60 * 1000, async () => {
    // Phase 1: Discover addresses from both PostgreSQL and RPC
    const [dbRows, rpcAddrs] = await Promise.all([
      sql`
        SELECT DISTINCT address FROM (
          SELECT '0x' || encode(sender, 'hex') AS address
          FROM tx_affected_addresses
          UNION
          SELECT '0x' || encode(owner_id, 'hex') AS address
          FROM objects
          WHERE owner_type = ${OWNER_TYPE_ADDRESS}
        ) all_addresses
        LIMIT ${MAX_DISCOVERY}
      `,
      getRpcAddresses().catch(() => [] as string[]),
    ]);

    // Merge and deduplicate
    const addressSet = new Set<string>();
    for (const r of dbRows) addressSet.add(r.address as string);
    for (const a of rpcAddrs) addressSet.add(a);
    addressSet.delete('0x0000000000000000000000000000000000000000000000000000000000000000');
    const addresses = [...addressSet];

    // Phase 2: Fetch real-time balances via RPC (concurrency-limited)
    const results = await mapConcurrent(
      addresses,
      async (addr) => {
        try {
          const bal = await getBalance(addr);
          return {
            address: addr,
            balance: bal.totalBalance,
            coinCount: bal.coinObjectCount,
          };
        } catch {
          return null;
        }
      },
      RPC_CONCURRENCY,
    );

    // Phase 3: Filter zero balances, sort descending, limit
    return results
      .filter((r): r is NonNullable<typeof r> => r !== null && r.balance !== '0')
      .sort((a, b) => {
        const diff = safeBigInt(b.balance) - safeBigInt(a.balance);
        return diff > 0n ? 1 : diff < 0n ? -1 : 0;
      })
      .slice(0, limit);
  });

  const data = await getTopAccounts();
  c.header('Cache-Control', 'public, max-age=60');
  return c.json({ data, count: data.length });
});

// Active addresses: unique senders per day (checkpoint-derived tx ranges — avoids scanning transactions table)
app.get('/active-addresses', async (c) => {
  const days = parseDays(c.req.query('range'));

  // 15min TTL: DISTINCT sender JOIN is expensive on large tables
  const getActiveAddresses = cached(`active-addresses-${days}`, 15 * 60 * 1000, async () => {
    try {
      const rows = await sql`
        WITH date_ranges AS (
          SELECT
            DATE(to_timestamp(timestamp_ms / 1000.0))::text AS day,
            MIN(min_tx_sequence_number) AS day_min_seq,
            MAX(max_tx_sequence_number) AS day_max_seq
          FROM checkpoints
          WHERE timestamp_ms >= (EXTRACT(EPOCH FROM NOW()) - ${days * 86400}) * 1000
          GROUP BY DATE(to_timestamp(timestamp_ms / 1000.0))
        )
        SELECT
          dr.day,
          COUNT(DISTINCT a.sender) AS active_count
        FROM date_ranges dr
        JOIN tx_affected_addresses a
          ON a.tx_sequence_number BETWEEN dr.day_min_seq AND dr.day_max_seq
        GROUP BY dr.day
        ORDER BY dr.day ASC
      `;
      return rows.map((r) => ({
        date: r.day,
        activeAddresses: Number(r.active_count),
      }));
    } catch (err) {
      console.error('Active addresses query failed:', err);
      return [];
    }
  });

  const data = await getActiveAddresses();
  c.header('Cache-Control', 'public, max-age=300');
  return c.json({ data, range: `${days}d` });
});

// Network summary: split into fast (checkpoint-derived) and slow (unique addresses) cache groups
const getFastStats = cached('network-summary-fast', 5 * 60 * 1000, async () => {
  try {
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
  } catch (err) {
    console.error('Network summary fast stats query failed:', err);
    return { cpStats: null, pkgCount: null, eventCount: null };
  }
});

// 30min TTL: COUNT(DISTINCT sender) is expensive (~4s on cache miss)
const getSlowStats = cached('network-summary-slow', 30 * 60 * 1000, async () => {
  try {
    const [[addrCount]] = await Promise.all([
      sql`SELECT COUNT(DISTINCT sender) as count FROM tx_affected_addresses`,
    ]);
    return { uniqueAddresses: Number(addrCount?.count ?? 0) };
  } catch (err) {
    console.error('Network summary slow stats query failed:', err);
    return { uniqueAddresses: 0 };
  }
});

app.get('/network-summary', async (c) => {
  const [fast, slow] = await Promise.all([getFastStats(), getSlowStats()]);
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
    try {
      const rows = await sql`
        SELECT
          DATE(to_timestamp(timestamp_ms / 1000.0))::text AS day,
          SUM(max_tx_sequence_number - min_tx_sequence_number + 1)::int AS tx_count
        FROM checkpoints
        WHERE timestamp_ms >= (EXTRACT(EPOCH FROM NOW()) - ${days * 86400}) * 1000
        GROUP BY DATE(to_timestamp(timestamp_ms / 1000.0))
        ORDER BY day ASC
      `;
      return rows.map((r) => ({
        date: r.day,
        transactions: Number(r.tx_count),
      }));
    } catch (err) {
      console.error('Daily transactions query failed:', err);
      return [];
    }
  });

  const data = await getDailyTx();
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
