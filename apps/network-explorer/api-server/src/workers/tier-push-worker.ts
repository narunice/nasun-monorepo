/**
 * Dedicated pm2 process for tier-push (Phase 4 D4 process isolation).
 *
 * Runs independently of `tier-worker` (NSI compute) and `explorer-api`
 * (HTTP + scanLoop). A signAndExecute failure here cannot stall NSI
 * computation, daily-snapshot, or mission processing.
 */

import { startTierPush } from '../scanner/tier-push.js';

console.log('[tier-push-worker] starting');
console.log('[tier-push-worker] ENABLE_TIER_PUSH =', process.env.ENABLE_TIER_PUSH ?? 'unset');

// Without these, an unhandled rejection from the scanner kills the pm2 fork
// on Node 20+ (default --unhandled-rejections=throw).
process.on('unhandledRejection', (reason) => {
  console.error('[tier-push-worker] unhandledRejection', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[tier-push-worker] uncaughtException', err);
});

startTierPush();

process.on('SIGTERM', () => {
  console.log('[tier-push-worker] SIGTERM received, exiting');
  process.exit(0);
});
process.on('SIGINT', () => {
  console.log('[tier-push-worker] SIGINT received, exiting');
  process.exit(0);
});
