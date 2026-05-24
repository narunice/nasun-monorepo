// Per-operation wallclock trace. Pairs with event-loop-monitor.ts:
// the monitor tells us *that* the loop stalls; this tells us *which* operation
// owned the main thread during the stall.
//
// Usage:
//   await traceAsync('indexer.poll', () => runAllPolls(), { threshold: 200 });
//   const out = traceSync('store.heavyQuery', () => db.exec(...), { threshold: 50 });
//
// Logs only when elapsed >= threshold to keep log volume bounded. Format is
// greppable: `[Trace] indexer.poll took 1234ms` — same shape as alpha-cron's
// existing "slow tick took" line so dashboards/grep aliases keep working.

const DEFAULT_ASYNC_THRESHOLD_MS = 200;
const DEFAULT_SYNC_THRESHOLD_MS = 50;

export interface TraceOptions {
  threshold?: number;
  /** Extra context appended to the log line, e.g. row counts. */
  context?: () => string;
}

export async function traceAsync<T>(
  label: string,
  fn: () => Promise<T>,
  opts: TraceOptions = {},
): Promise<T> {
  const threshold = opts.threshold ?? DEFAULT_ASYNC_THRESHOLD_MS;
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const took = Math.round(performance.now() - start);
    if (took >= threshold) {
      const ctx = opts.context ? ` ${opts.context()}` : '';
      console.warn(`[Trace] ${label} took ${took}ms${ctx}`);
    }
  }
}

export function traceSync<T>(
  label: string,
  fn: () => T,
  opts: TraceOptions = {},
): T {
  const threshold = opts.threshold ?? DEFAULT_SYNC_THRESHOLD_MS;
  const start = performance.now();
  try {
    return fn();
  } finally {
    const took = Math.round(performance.now() - start);
    if (took >= threshold) {
      const ctx = opts.context ? ` ${opts.context()}` : '';
      console.warn(`[Trace] ${label} took ${took}ms${ctx}`);
    }
  }
}
