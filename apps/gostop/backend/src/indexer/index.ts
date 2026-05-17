/**
 * gostop-indexer entry point.
 *
 * Tier 0.0 boilerplate. Real stream subscribers (bankroll_pool::GameResult,
 * lottery::*, crash::*) land in follow-up commits — see
 * apps/gostop/docs/game-result-schema.md §6.
 */

import { env } from '../env.js';

function main() {
  console.log('[gostop-indexer] boot', {
    rpc: env.rpc.url,
    poolMax: env.db.poolMax,
    concurrency: env.rpc.concurrency,
  });
  console.log('[gostop-indexer] stub — stream subscribers not yet implemented');
}

main();
