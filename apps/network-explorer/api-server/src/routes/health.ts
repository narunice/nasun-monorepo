import { Hono } from 'hono';
import { sql } from '../db.js';
import { cached } from '../cache.js';

const app = new Hono();

const SUI_RPC_URL = process.env.SUI_RPC_URL || 'https://rpc.devnet.nasun.io';
const EXPECTED_CHAIN_ID = process.env.CHAIN_ID || '';
if (!EXPECTED_CHAIN_ID) {
  console.warn('CHAIN_ID env not set — chain reset detection disabled');
}

// Cache RPC chain ID for 5 minutes (only changes on devnet reset)
const getRpcChainId = cached('rpc-chain-id', 5 * 60 * 1000, async () => {
  const res = await fetch(SUI_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sui_getChainIdentifier', params: [] }),
    signal: AbortSignal.timeout(5000),
  });
  const json = (await res.json()) as { result?: string };
  return json.result ?? null;
});

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

    // Check chain ID from RPC (non-blocking — don't fail health check if RPC is down)
    let rpcChainId: string | null = null;
    let chainResetDetected = false;
    try {
      rpcChainId = await getRpcChainId();
      if (EXPECTED_CHAIN_ID && rpcChainId && rpcChainId !== EXPECTED_CHAIN_ID) {
        chainResetDetected = true;
      }
    } catch {
      // RPC unreachable — don't flag as chain reset
    }

    const response = {
      status: chainResetDetected ? 'chain_reset_detected' : 'ok',
      chainId: rpcChainId,
      expectedChainId: EXPECTED_CHAIN_ID || undefined,
      chainResetDetected,
      latestCheckpoint: cpRow?.latest_cp?.toString() ?? null,
      earliestCheckpoint: cpRow?.earliest_cp?.toString() ?? null,
      totalCheckpoints: Number(cpRow?.total_cp ?? 0),
      totalTransactions: Number(txRow?.total_tx ?? 0),
      timestamp: new Date().toISOString(),
    };

    if (chainResetDetected) {
      return c.json(response, 503);
    }
    return c.json(response);
  } catch (err) {
    console.error('Health check DB query failed:', err instanceof Error ? err.message : 'Unknown error');
    return c.json(
      { status: 'error', error: 'database_unavailable', timestamp: new Date().toISOString() },
      503,
    );
  }
});

export default app;
