import { Hono } from 'hono';
import { sql } from '../db.js';
import { cached } from '../cache.js';

const app = new Hono();

// Owner type constants from sui-indexer schema (smallint)
const OWNER_TYPE_ADDRESS = 1;

// SUI coin type (stored in objects.coin_type, not object_type)
const SUI_COIN_TYPE =
  '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI';

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

// Top accounts by SUI balance
app.get('/top-accounts', async (c) => {
  const limit = parseLimit(c.req.query('limit'));

  const getTopAccounts = cached(`top-accounts-${limit}`, 5 * 60 * 1000, async () => {
    const rows = await sql`
      SELECT
        '0x' || encode(owner_id, 'hex') as address,
        SUM(coin_balance) as total_balance,
        COUNT(*) as coin_count
      FROM objects
      WHERE coin_type = ${SUI_COIN_TYPE}
        AND owner_type = ${OWNER_TYPE_ADDRESS}
        AND coin_balance IS NOT NULL
      GROUP BY owner_id
      ORDER BY SUM(coin_balance) DESC
      LIMIT ${limit}
    `;
    return rows.map((r) => ({
      address: r.address,
      balance: r.total_balance?.toString() ?? '0',
      coinCount: Number(r.coin_count),
    }));
  });

  const data = await getTopAccounts();
  c.header('Cache-Control', 'public, max-age=300');
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
