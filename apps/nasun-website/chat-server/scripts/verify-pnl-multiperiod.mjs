// Standalone verifier: 1-pass multi-period vs legacy 4× per-period PnL.
// Reads the leaderboard.db read-only via the existing better-sqlite3 connection.
// Usage on prod: cd /home/ec2-user/nasun-chat-server && node scripts/verify-pnl-multiperiod.mjs

import { initLeaderboardStore, computeTraderPnl, computeTraderPnlMultiPeriod } from '../dist/leaderboard-store.js';
import { PERIOD_MS } from '../dist/leaderboard-types.js';

const PERIODS = ['24h', '7d', '30d', 'all'];
const LIMIT = 20000;

initLeaderboardStore({
  leaderboardDbPath: process.env.LEADERBOARD_DB_PATH ?? './data/leaderboard.db',
  excludedAddresses: new Set(),
  aggregationIntervalMs: 60000,
});

const now = Date.now();
const periodCutoffs = PERIODS.map((p) => ({
  period: p,
  cutoffMs: PERIOD_MS[p] > 0 ? now - PERIOD_MS[p] : 0,
}));

console.log('1-pass multi-period...');
const t1 = Date.now();
const newResults = computeTraderPnlMultiPeriod(periodCutoffs, new Set(), LIMIT);
const t1Elapsed = Date.now() - t1;
console.log(`  ${t1Elapsed}ms`);

console.log('4× legacy...');
const t2 = Date.now();
const oldResults = new Map();
for (const { period, cutoffMs } of periodCutoffs) {
  oldResults.set(period, computeTraderPnl(cutoffMs, new Set(), LIMIT));
}
const t2Elapsed = Date.now() - t2;
console.log(`  ${t2Elapsed}ms`);

let totalMismatch = 0;
for (const period of PERIODS) {
  const newList = newResults.get(period) ?? [];
  const oldList = oldResults.get(period) ?? [];
  const newMap = new Map(newList.map((t) => [t.address, t]));
  const oldMap = new Map(oldList.map((t) => [t.address, t]));

  let pnlMismatch = 0;
  let pnlSumDiff = 0;
  let pctSumDiff = 0;
  let tcMismatch = 0;
  const onlyOld = [], onlyNew = [];

  for (const [addr, o] of oldMap) {
    const n = newMap.get(addr);
    if (!n) { onlyOld.push(addr); continue; }
    const pnlD = Math.abs(n.realizedPnlRaw - o.realizedPnlRaw);
    if (pnlD > 1) { pnlMismatch++; pnlSumDiff += pnlD; }
    const pctD = Math.abs(n.pnlPercent - o.pnlPercent);
    if (pctD > 0.02) pctSumDiff += pctD;
    if (n.tradeCount !== o.tradeCount) tcMismatch++;
  }
  for (const [addr] of newMap) if (!oldMap.has(addr)) onlyNew.push(addr);

  const periodMismatch = pnlMismatch + onlyOld.length + onlyNew.length + tcMismatch;
  totalMismatch += periodMismatch;
  console.log(
    `[${period}] old=${oldList.length} new=${newList.length} ` +
    `pnl_mismatch=${pnlMismatch}(sum_abs=${Math.round(pnlSumDiff)}) ` +
    `pct_diff_sum=${pctSumDiff.toFixed(2)} tc_mismatch=${tcMismatch} ` +
    `only_old=${onlyOld.length} only_new=${onlyNew.length}`,
  );
  if (onlyOld.length > 0) console.log(`  only_old: ${onlyOld.slice(0, 3).join(' ')}`);
  if (onlyNew.length > 0) console.log(`  only_new: ${onlyNew.slice(0, 3).join(' ')}`);
}

console.log(`\nSummary total_mismatch=${totalMismatch} multi=${t1Elapsed}ms legacy=${t2Elapsed}ms speedup=${(t2Elapsed / t1Elapsed).toFixed(2)}x`);
process.exit(totalMismatch > 0 ? 1 : 0);
