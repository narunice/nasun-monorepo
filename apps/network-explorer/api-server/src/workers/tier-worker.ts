/**
 * Dedicated process for NSI computation.
 *
 * Running these three hourly cron jobs in their own pm2 fork keeps the main
 * `explorer-api` scanLoop completely untouched — a worker failure (RPC blip,
 * gostop schema change, formula bug) cannot affect daily-snapshot, mission
 * processing, or point awards.
 *
 *   staking-principal-sync : suix_getStakes -> user_staking_daily_snapshots
 *   lp-position-sync       : gostop.bankroll_event -> user_lp_daily_snapshots
 *   nsi-compute            : merges the two + tx/diversity/nft -> user_nsi
 *
 * Each cron is independently gated by an env flag so we can roll them out one
 * at a time during the 24h gate sequence.
 */

import { startStakingPrincipalSync } from '../scanner/staking-principal-sync';
import { startLpPositionSync } from '../scanner/lp-position-sync';
import { startNsiCompute } from '../scanner/nsi-compute';

console.log('[tier-worker] starting');
console.log('[tier-worker] ENABLE_STAKING_PRINCIPAL_SYNC =', process.env.ENABLE_STAKING_PRINCIPAL_SYNC ?? 'unset');
console.log('[tier-worker] ENABLE_LP_POSITION_SYNC      =', process.env.ENABLE_LP_POSITION_SYNC ?? 'unset');
console.log('[tier-worker] ENABLE_NSI_COMPUTE           =', process.env.ENABLE_NSI_COMPUTE ?? 'unset');

startStakingPrincipalSync();
startLpPositionSync();
startNsiCompute();

// Keep process alive; setInterval handles keep it from exiting but be explicit.
process.on('SIGTERM', () => {
  console.log('[tier-worker] SIGTERM received, exiting');
  process.exit(0);
});
process.on('SIGINT', () => {
  console.log('[tier-worker] SIGINT received, exiting');
  process.exit(0);
});
