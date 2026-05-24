// Event-loop lag monitor. Uses perf_hooks.monitorEventLoopDelay (histogram-backed)
// so we get accurate p50/p99 lag without the drift of self-scheduled setInterval probes.
//
// Why this exists: chat-server runs everything on a single Node thread —
// better-sqlite3 sync queries, alpha-cron, indexer poll, profile-sync, auth
// flood. When the loop stalls, every WebSocket and HTTP client sees the same
// latency cliff. This module quantifies the stalls so we can identify which
// subsystem is the culprit (instead of guessing from anecdotal "site feels slow").

import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';

let histogram: IntervalHistogram | null = null;
let reportTimer: ReturnType<typeof setInterval> | null = null;

const SAMPLE_RESOLUTION_MS = 20; // sample every 20ms
const REPORT_INTERVAL_MS = 30_000; // log a snapshot every 30s
const STALL_THRESHOLD_MS = 200; // p99 above this = noteworthy
const SEVERE_STALL_MS = 1000; // p99 above this = WARN

export function startEventLoopMonitor(): void {
  if (histogram) return;
  histogram = monitorEventLoopDelay({ resolution: SAMPLE_RESOLUTION_MS });
  histogram.enable();

  reportTimer = setInterval(() => {
    if (!histogram) return;
    const p50 = nsToMs(histogram.percentile(50));
    const p90 = nsToMs(histogram.percentile(90));
    const p99 = nsToMs(histogram.percentile(99));
    const max = nsToMs(histogram.max);
    const mean = nsToMs(histogram.mean);
    histogram.reset();

    const tag = p99 >= SEVERE_STALL_MS ? 'WARN' : p99 >= STALL_THRESHOLD_MS ? 'NOTE' : 'OK';
    const line = `[EventLoop] ${tag} mean=${mean}ms p50=${p50}ms p90=${p90}ms p99=${p99}ms max=${max}ms (window=${REPORT_INTERVAL_MS / 1000}s)`;
    if (tag === 'WARN') console.warn(line);
    else console.log(line);
  }, REPORT_INTERVAL_MS);
  reportTimer.unref();

  console.log(
    `[EventLoop] monitor started (resolution=${SAMPLE_RESOLUTION_MS}ms, report=${REPORT_INTERVAL_MS / 1000}s)`,
  );
}

export function stopEventLoopMonitor(): void {
  if (reportTimer) {
    clearInterval(reportTimer);
    reportTimer = null;
  }
  if (histogram) {
    histogram.disable();
    histogram = null;
  }
}

function nsToMs(ns: number): number {
  return Math.round(ns / 1e6);
}
