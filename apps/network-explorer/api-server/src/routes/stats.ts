import { Hono } from 'hono';
import { sql, pointsDb } from '../db.js';
import { cached } from '../cache.js';
import { getBalance, discoverAddressesViaRpc } from '../rpc.js';

const app = new Hono();

// Owner type constants from sui-indexer schema (smallint)
const OWNER_TYPE_ADDRESS = 1;

// Known coin types for token stats queries.
// Source of truth: packages/devnet-config/devnet-ids.json
// Update after devnet reset: sync coin types with devnet-ids.json
// NOTE: sui-indexer stores coin_type with zero-padded 64-char hex addresses
const KNOWN_COIN_TYPES = [
  '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
  '0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731::nbtc::NBTC',
  '0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731::nusdc::NUSDC',
  '0xe672843fd6e5388ca1248200059c6ef50e82a68689f42f7b9efb3e70dcabdf31::neth::NETH',
  '0xcc65166f76b0aed75f8c94527405cec82bb4b416483c7bcdd7725490179601b2::nsol::NSOL',
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

  // DAU scope = wallets with on-chain point-earning activity. Exclude
  // off-chain (chat) and admin-granted ecosystem bonuses so the metric
  // reflects actual on-chain engagement.
  const OFFCHAIN_CATEGORIES = [
    'chat',
    'daily-mission',
    'ecosystem-bonus-restoration',
    'ecosystem-bonus-earlybird',
    'ecosystem-bonus-admin',
    'ecosystem-bonus-game',
    'ecosystem-bonus-creators-appreciation',
    'ecosystem-bonus-bugreport',
    'ecosystem-bonus-creator-posts',
  ];

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

export default app;
