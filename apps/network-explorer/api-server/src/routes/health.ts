import { Hono } from 'hono';
import { sql } from '../db.js';

const app = new Hono();

app.get('/', async (c) => {
  try {
    const [cpRow] = await sql`
      SELECT
        COUNT(*) as total_cp,
        MAX(sequence_number) as latest_cp,
        MIN(sequence_number) as earliest_cp
      FROM checkpoints
    `;
    const [txRow] = await sql`
      SELECT COUNT(*) as total_tx FROM transactions
    `;

    return c.json({
      status: 'ok',
      latestCheckpoint: cpRow?.latest_cp?.toString() ?? null,
      earliestCheckpoint: cpRow?.earliest_cp?.toString() ?? null,
      totalCheckpoints: Number(cpRow?.total_cp ?? 0),
      totalTransactions: Number(txRow?.total_tx ?? 0),
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Health check DB query failed:', err);
    return c.json(
      { status: 'error', error: 'database_unavailable', timestamp: new Date().toISOString() },
      503,
    );
  }
});

export default app;
