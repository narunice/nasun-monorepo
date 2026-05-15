/**
 * Verifies computeTraderPnlMultiPeriod returns the same per-period results as
 * the legacy computeTraderPnl called once per period.
 *
 * Usage (on prod EC2):
 *   cd /home/ec2-user/nasun-chat-server
 *   node --experimental-strip-types --no-warnings scripts/verify-pnl-multiperiod.ts
 *
 * Or via tsx:
 *   pnpm tsx scripts/verify-pnl-multiperiod.ts
 *
 * Reads leaderboard.db read-only (no writes). Wash filter is intentionally
 * disabled for this comparison so the only difference between old and new
 * paths is the SQL structure, not the wash semantics.
 */

import { initLeaderboardStore, computeTraderPnl, computeTraderPnlMultiPeriod } from '../src/leaderboard-store.ts';
import { PERIOD_MS, type Period } from '../src/leaderboard-types.ts';

const PERIODS: Period[] = ['24h', '7d', '30d', 'all'];
const LIMIT = 20000;

initLeaderboardStore({
  leaderboardDbPath: process.env.LEADERBOARD_DB_PATH ?? './data/leaderboard.db',
  excludedAddresses: new Set<string>(),
  aggregationIntervalMs: 60000,
});

const now = Date.now();
const periodCutoffs = PERIODS.map((p) => ({
  period: p,
  cutoffMs: PERIOD_MS[p] > 0 ? now - PERIOD_MS[p] : 0,
}));

console.log('Running 1-pass multi-period...');
const t1 = Date.now();
const newResults = computeTraderPnlMultiPeriod(periodCutoffs, new Set(), LIMIT);
const t1Elapsed = Date.now() - t1;
console.log(`  done in ${t1Elapsed}ms`);

console.log('Running 4× legacy...');
const t2 = Date.now();
const oldResults = new Map<string, ReturnType<typeof computeTraderPnl>>();
for (const { period, cutoffMs } of periodCutoffs) {
  oldResults.set(period, computeTraderPnl(cutoffMs, new Set(), LIMIT));
}
const t2Elapsed = Date.now() - t2;
console.log(`  done in ${t2Elapsed}ms`);

let totalMismatch = 0;
for (const period of PERIODS) {
  const newList = newResults.get(period) ?? [];
  const oldList = oldResults.get(period) ?? [];
  const newMap = new Map(newList.map((t) => [t.address, t]));
  const oldMap = new Map(oldList.map((t) => [t.address, t]));

  let countDiff = 0;
  let pnlDiffSum = 0;
  let pctDiffSum = 0;
  let tcDiff = 0;
  const onlyInOld: string[] = [];
  const onlyInNew: string[] = [];

  for (const [addr, o] of oldMap) {
    const n = newMap.get(addr);
    if (!n) { onlyInOld.push(addr); countDiff++; continue; }
    if (Math.abs(n.realizedPnlRaw - o.realizedPnlRaw) > 1) {
      pnlDiffSum += Math.abs(n.realizedPnlRaw - o.realizedPnlRaw);
      countDiff++;
    }
    if (Math.abs(n.pnlPercent - o.pnlPercent) > 0.02) {
      pctDiffSum += Math.abs(n.pnlPercent - o.pnlPercent);
    }
    if (n.tradeCount !== o.tradeCount) {
      tcDiff++;
    }
  }
  for (const [addr] of newMap) {
    if (!oldMap.has(addr)) onlyInNew.push(addr);
  }

  console.log(
    `[${period}] old=${oldList.length} new=${newList.length} ` +
    `mismatched_pnl=${countDiff} (sum_abs_diff=${Math.round(pnlDiffSum)}) ` +
    `pct_diff=${pctDiffSum.toFixed(4)} tc_diff=${tcDiff} ` +
    `only_old=${onlyInOld.length} only_new=${onlyInNew.length}`,
  );
  if (onlyInOld.length > 0) console.log(`  only_old sample: ${onlyInOld.slice(0, 3).join(',')}`);
  if (onlyInNew.length > 0) console.log(`  only_new sample: ${onlyInNew.slice(0, 3).join(',')}`);
  totalMismatch += countDiff + onlyInOld.length + onlyInNew.length;
}

console.log(`\nSummary: total_mismatch=${totalMismatch} multi_pass=${t1Elapsed}ms legacy_4x=${t2Elapsed}ms speedup=${(t2Elapsed / t1Elapsed).toFixed(2)}x`);
process.exit(totalMismatch > 0 ? 1 : 0);
