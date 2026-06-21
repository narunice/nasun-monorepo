// CLI entry for the snapshot generator (bundled to dist/snapshot.mjs). Modes:
//   node snapshot.mjs                       -> runLive  (generate+write today's snapshot; systemd timer)
//   node snapshot.mjs --dry-run [--date D]  -> runDryRun (compute+print, no write)
//   node snapshot.mjs --reproduce <D>       -> runReproduce (recompute a past snapshot, compare to stored)
//
// The systemd timer invokes the no-arg form. --reproduce is the validation path (run as
// `sudo -u postgres ... node snapshot.mjs --reproduce SEASON1#2026-04-09`, peer auth, no write).

import { runLive, runDryRun, runReproduce, shutdown } from './snapshot';

const args = process.argv.slice(2);

async function main(): Promise<void> {
  if (args[0] === '--reproduce') {
    const date = args[1];
    if (!date) throw new Error('--reproduce requires a date (YYYY-MM-DD or SEASON#date)');
    await runReproduce(date);
  } else if (args[0] === '--dry-run') {
    const di = args.indexOf('--date');
    await runDryRun(di >= 0 ? args[di + 1] : undefined);
  } else {
    await runLive();
  }
}

main()
  .then(async () => {
    await shutdown();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error('[snapshot] FATAL:', e instanceof Error ? e.message : e);
    await shutdown();
    process.exit(1);
  });
