import { Hono } from 'hono';
import { sql } from '../db.js';
import { cached } from '../cache.js';

/**
 * Durable prediction market discovery.
 *
 * The on-chain contract has no market registry, so clients used to enumerate
 * markets by scanning `create_market` transactions. The devnet fullnode prunes
 * its transaction index, so every market silently disappeared from that scan
 * once its creating tx aged out (2026-08-09: all bots and the prediction page
 * went blank while 50 markets were still live on chain).
 *
 * The indexer's `objects` table holds the *current* object set rather than
 * history, so it keeps serving markets long after their creating tx is pruned.
 * Filtering by module+name (not by package id) means an upgrade of the
 * prediction package does not blank the list again.
 */

const app = new Hono();

const CACHE_TTL_MS = 60_000;

// Plan check (2026-08-13, 2.3M live objects): Index Scan using
// objects_package_module_name_full_type, ~32ms, all buffers cached. The
// leading index column (object_type_package) is not constrained, so this walks
// the index rather than seeking into it — fine at this size and behind the
// cache, but if the live object set grows an order of magnitude, constrain the
// package too rather than letting it creep toward the 30s statement_timeout.
const getMarkets = cached('prediction-market-ids', CACHE_TTL_MS, async () => {
  const rows = await sql<{ market_id: string; object_type: string }[]>`
    SELECT '0x' || encode(object_id, 'hex') AS market_id, object_type
    FROM objects
    WHERE object_type_module = 'prediction_market'
      AND object_type_name = 'Market'
    ORDER BY market_id
  `;
  return rows.map((r) => ({ id: r.market_id, type: r.object_type }));
});

app.get('/markets', async (c) => {
  try {
    const markets = await getMarkets();
    return c.json({
      // `marketIds` is the flat list clients render from; `markets` carries the
      // fully-qualified type so a consumer that must dispatch per package (the
      // keeper/lp/arb bots) can filter without a second RPC round trip.
      marketIds: markets.map((m) => m.id),
      markets,
      count: markets.length,
      source: 'indexer',
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('prediction/markets failed:', error);
    return c.json({ error: 'internal_error' }, 500);
  }
});

export default app;
