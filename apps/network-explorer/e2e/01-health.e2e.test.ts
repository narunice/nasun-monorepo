import { describe, test, expect } from 'vitest';
import { API_BASE, FRONTEND_URL, RPC_URL, FAUCET_URL, get, post, CHAIN_ID } from './helpers';

describe('01 — API Health Check', () => {
  test('GET /api/v1/health returns ok status', async () => {
    const res = await get(`${API_BASE}/health`);
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeTruthy();
    expect(typeof body.totalCheckpoints).toBe('number');
    expect(typeof body.totalTransactions).toBe('number');
    expect(body.totalCheckpoints).toBeGreaterThan(0);
    expect(body.totalTransactions).toBeGreaterThan(0);
  });

  test('Health check returns valid checkpoint range', async () => {
    const res = await get(`${API_BASE}/health`);
    const body = res.body as Record<string, unknown>;
    expect(body.latestCheckpoint).toBeTruthy();
    expect(body.earliestCheckpoint).toBeTruthy();
    const latest = Number(body.latestCheckpoint);
    const earliest = Number(body.earliestCheckpoint);
    expect(latest).toBeGreaterThan(earliest);
    // Indexer started at checkpoint 4665621
    expect(earliest).toBeGreaterThanOrEqual(4665621);
  });

  test('Health check has chain ID matching expected', async () => {
    const res = await get(`${API_BASE}/health`);
    const body = res.body as Record<string, unknown>;
    if (body.chainId) {
      expect(body.chainId).toBe(CHAIN_ID);
    }
    expect(body.chainResetDetected).toBe(false);
  });
});

describe('01 — RPC Endpoint Health', () => {
  test('RPC endpoint responds to sui_getChainIdentifier', async () => {
    const res = await post(RPC_URL, {
      jsonrpc: '2.0',
      id: 1,
      method: 'sui_getChainIdentifier',
      params: [],
    });
    expect(res.status).toBe(200);
    const body = res.body as { result: string };
    expect(body.result).toBe(CHAIN_ID);
  });

  test('RPC endpoint responds to sui_getLatestCheckpointSequenceNumber', async () => {
    const res = await post(RPC_URL, {
      jsonrpc: '2.0',
      id: 1,
      method: 'sui_getLatestCheckpointSequenceNumber',
      params: [],
    });
    expect(res.status).toBe(200);
    const body = res.body as { result: string };
    expect(Number(body.result)).toBeGreaterThan(0);
  });

  test('Faucet endpoint is reachable', async () => {
    // Faucet endpoint responds to OPTIONS or GET with some status
    const res = await get(FAUCET_URL);
    // Faucet may return 404 for GET (expects POST /gas), but not 5xx
    expect(res.status).toBeLessThan(500);
  });
});

describe('01 — Frontend Health', () => {
  test('Frontend serves index.html at /devnet/', async () => {
    const res = await fetch(FRONTEND_URL);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html.toLowerCase()).toContain('<!doctype html');
    expect(html).toContain('Nasun');
  });

  test('Frontend assets are reachable (favicon)', async () => {
    const res = await fetch(`${FRONTEND_URL}/favicon.ico`);
    // favicon may be at root level or return 404, but not 5xx
    expect(res.status).toBeLessThan(500);
  });
});

describe('01 — All API Endpoints Respond', () => {
  const endpoints = [
    { name: 'Health', path: '/health' },
    { name: 'Network Summary', path: '/stats/network-summary' },
    { name: 'Token Stats', path: '/stats/tokens' },
    { name: 'Top Accounts', path: '/stats/top-accounts' },
    { name: 'Daily Transactions (7d)', path: '/stats/daily-transactions?range=7d' },
    { name: 'Active Addresses (7d)', path: '/stats/active-addresses?range=7d' },
    { name: 'Daily Gas (7d)', path: '/stats/daily-gas?range=7d' },
  ];

  for (const ep of endpoints) {
    test(`${ep.name} responds (no 5xx)`, async () => {
      const res = await get(`${API_BASE}${ep.path}`);
      expect(res.status).toBeLessThan(500);
    });
  }
});
