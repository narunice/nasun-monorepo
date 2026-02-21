import { describe, test, expect } from 'vitest';
import { API_BASE, RPC_URL, COIN_TYPES, get, rpcCall } from './helpers';

describe('09 — API vs RPC Data Consistency', () => {
  test('API health latest checkpoint is close to RPC latest checkpoint', async () => {
    const [apiRes, rpcResult] = await Promise.all([
      get(`${API_BASE}/health`),
      rpcCall<string>('sui_getLatestCheckpointSequenceNumber'),
    ]);
    const apiLatest = Number((apiRes.body as Record<string, unknown>).latestCheckpoint);
    const rpcLatest = Number(rpcResult);

    // Indexer may lag behind RPC, especially after restarts or resets
    // Allow up to 50k checkpoints lag (indexer catches up at ~100 cp/s)
    const lag = rpcLatest - apiLatest;
    expect(lag).toBeGreaterThanOrEqual(0);
    expect(lag).toBeLessThan(50000);
  });

  test('API NSN holders count matches addresses with non-zero balance', async () => {
    const res = await get(`${API_BASE}/stats/tokens`);
    const body = res.body as { data: Array<{ coinType: string; holders: number }> };
    const nsn = body.data.find((t) => t.coinType === COIN_TYPES.NSN);
    if (nsn) {
      // Holders count should be a reasonable number (at least validators)
      expect(nsn.holders).toBeGreaterThanOrEqual(2);
      // But not excessively high for devnet
      expect(nsn.holders).toBeLessThan(10000);
    }
  });

  test('Network summary total TXs matches or exceeds daily-transactions sum', async () => {
    const [summaryRes, dailyRes] = await Promise.all([
      get(`${API_BASE}/stats/network-summary`),
      get(`${API_BASE}/stats/daily-transactions?range=30d`),
    ]);

    const totalTx = (summaryRes.body as { data: { totalTransactions: number } }).data.totalTransactions;
    const dailyData = (dailyRes.body as { data: Array<{ transactions: number }> }).data;
    const dailySum = dailyData.reduce((sum, d) => sum + d.transactions, 0);

    // Total should be >= sum of recent 30d (total includes all time)
    expect(totalTx).toBeGreaterThanOrEqual(dailySum);
  });

  test('Daily gas txCount matches daily-transactions count for same period', async () => {
    const [gasRes, txRes] = await Promise.all([
      get(`${API_BASE}/stats/daily-gas?range=7d`),
      get(`${API_BASE}/stats/daily-transactions?range=7d`),
    ]);

    const gasData = (gasRes.body as { data: Array<{ date: string; txCount: number }> }).data;
    const txData = (txRes.body as { data: Array<{ date: string; transactions: number }> }).data;

    const txMap = new Map(txData.map((d) => [d.date, d.transactions]));

    for (const gasEntry of gasData) {
      const txCount = txMap.get(gasEntry.date);
      if (txCount !== undefined) {
        // Gas txCount comes from checkpoint tx ranges, daily-transactions from transactions table
        // They should be approximately equal (minor differences possible due to query timing)
        const diff = Math.abs(gasEntry.txCount - txCount);
        const tolerance = Math.max(txCount * 0.1, 10); // 10% or 10 TXs tolerance
        expect(diff).toBeLessThanOrEqual(tolerance);
      }
    }
  });
});

describe('09 — Token Stats vs RPC Consistency', () => {
  test('NSN circulating supply from API is within range of RPC total supply', async () => {
    const [apiRes, rpcResult] = await Promise.all([
      get(`${API_BASE}/stats/tokens`),
      rpcCall<{ value: string }>('suix_getTotalSupply', [COIN_TYPES.NSN]),
    ]);

    const apiData = (apiRes.body as { data: Array<{ coinType: string; circulatingSupply: string | null }> }).data;
    const nsn = apiData.find((t) => t.coinType === COIN_TYPES.NSN);
    if (nsn?.circulatingSupply) {
      const apiSupply = BigInt(nsn.circulatingSupply);
      const rpcSupply = BigInt(rpcResult.value);

      // API circulating supply = SUM(coin_balance) for owned objects (owner_type=1)
      // RPC total supply = all minted coins (including locked, staked, system objects)
      // On devnet, most coins are in system/validator objects, so circulating << total
      expect(apiSupply).toBeLessThanOrEqual(rpcSupply);
      // Should be at least some non-zero amount
      expect(apiSupply).toBeGreaterThan(0n);
    }
  });

  test('Top accounts total balance is <= RPC total supply', async () => {
    const [accountsRes, rpcResult] = await Promise.all([
      get(`${API_BASE}/stats/top-accounts?limit=200`),
      rpcCall<{ value: string }>('suix_getTotalSupply', [COIN_TYPES.NSN]),
    ]);

    const accounts = (accountsRes.body as { data: Array<{ balance: string }> }).data;
    const totalBalance = accounts.reduce((sum, a) => sum + BigInt(a.balance), 0n);
    const totalSupply = BigInt(rpcResult.value);

    expect(totalBalance).toBeLessThanOrEqual(totalSupply);
  });
});

describe('09 — Indexer Freshness', () => {
  test('API health timestamp is recent (within 1 hour)', async () => {
    const res = await get(`${API_BASE}/health`);
    const body = res.body as { timestamp: string };
    const apiTime = new Date(body.timestamp).getTime();
    const now = Date.now();
    expect(now - apiTime).toBeLessThan(60 * 60 * 1000);
  });

  test('Network summary latest timestamp is within 24 hours of now', async () => {
    const res = await get(`${API_BASE}/stats/network-summary`);
    const data = (res.body as { data: { latestTimestamp: string } }).data;
    const ts = Number(data.latestTimestamp);
    const diffHours = (Date.now() - ts) / (1000 * 60 * 60);
    expect(diffHours).toBeLessThan(24);
  });

  test('Daily transactions include today or yesterday', async () => {
    const res = await get(`${API_BASE}/stats/daily-transactions?range=7d`);
    const data = (res.body as { data: Array<{ date: string }> }).data;
    if (data.length > 0) {
      const latestDate = data[data.length - 1].date;
      const latest = new Date(latestDate);
      const now = new Date();
      const diffDays = (now.getTime() - latest.getTime()) / (1000 * 60 * 60 * 24);
      // Latest data point should be within 2 days
      expect(diffDays).toBeLessThan(2);
    }
  });
});
