import { Hono } from 'hono';
import { sql } from '../db.js';
import { cached } from '../cache.js';
import { getBalance, discoverAddressesViaRpc } from '../rpc.js';

const app = new Hono();

// Owner type constants from sui-indexer schema (smallint)
const OWNER_TYPE_ADDRESS = 1;

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

// Active addresses: unique senders per day (from tx_affected_addresses table)
app.get('/active-addresses', async (c) => {
  const days = parseDays(c.req.query('range'));

  const getActiveAddresses = cached(`active-addresses-${days}`, 5 * 60 * 1000, async () => {
    const rows = await sql`
      SELECT
        DATE(to_timestamp(t.timestamp_ms / 1000.0)) as day,
        COUNT(DISTINCT a.sender) as active_count
      FROM tx_affected_addresses a
      JOIN transactions t ON t.tx_sequence_number = a.tx_sequence_number
      WHERE t.timestamp_ms >= (EXTRACT(EPOCH FROM NOW()) - ${days * 86400}) * 1000
      GROUP BY DATE(to_timestamp(t.timestamp_ms / 1000.0))
      ORDER BY day ASC
    `;
    return rows.map((r) => ({
      date: r.day,
      activeAddresses: Number(r.active_count),
    }));
  });

  const data = await getActiveAddresses();
  c.header('Cache-Control', 'public, max-age=300');
  return c.json({ data, range: `${days}d` });
});

// Network summary (parallel queries)
app.get('/network-summary', async (c) => {
  const getSummary = cached('network-summary', 30 * 1000, async () => {
    const [
      [txCount],
      [cpCount],
      [addrCount],
      [pkgCount],
      [latestCp],
      [eventCount],
    ] = await Promise.all([
      sql`SELECT COUNT(*) as count FROM transactions`,
      sql`SELECT COUNT(*) as count FROM checkpoints`,
      sql`SELECT COUNT(DISTINCT sender) as count FROM tx_affected_addresses`,
      sql`SELECT COUNT(*) as count FROM packages`,
      sql`SELECT MAX(sequence_number) as seq, MAX(timestamp_ms) as ts FROM checkpoints`,
      sql`SELECT COUNT(*) as count FROM events`,
    ]);

    return {
      totalTransactions: Number(txCount?.count ?? 0),
      totalCheckpoints: Number(cpCount?.count ?? 0),
      uniqueAddresses: Number(addrCount?.count ?? 0),
      totalPackages: Number(pkgCount?.count ?? 0),
      totalEvents: Number(eventCount?.count ?? 0),
      latestCheckpoint: latestCp?.seq?.toString() ?? null,
      latestTimestamp: latestCp?.ts?.toString() ?? null,
    };
  });

  const data = await getSummary();
  c.header('Cache-Control', 'public, max-age=30');
  return c.json({ data });
});

// Daily transaction counts
app.get('/daily-transactions', async (c) => {
  const days = parseDays(c.req.query('range'));

  const getDailyTx = cached(`daily-tx-${days}`, 5 * 60 * 1000, async () => {
    const rows = await sql`
      SELECT
        DATE(to_timestamp(timestamp_ms / 1000.0)) as day,
        COUNT(*) as tx_count
      FROM transactions
      WHERE timestamp_ms >= (EXTRACT(EPOCH FROM NOW()) - ${days * 86400}) * 1000
      GROUP BY DATE(to_timestamp(timestamp_ms / 1000.0))
      ORDER BY day ASC
    `;
    return rows.map((r) => ({
      date: r.day,
      transactions: Number(r.tx_count),
    }));
  });

  const data = await getDailyTx();
  c.header('Cache-Control', 'public, max-age=300');
  return c.json({ data, range: `${days}d` });
});

export default app;
