/**
 * SpaceX / launch resolver via Launch Library 2 (TheSpaceDevs).
 *
 * Two market shapes supported:
 *
 *   Field: mission_success
 *     SuccessStatusIds: 3
 *     YES iff response.status.id in SuccessStatusIds.
 *     NO if status in {4 Failure, 7 Partial Failure}.
 *     pending for {1 Go, 2 TBD, 5 Hold, 6 In Flight, 8 TBC}.
 *
 *   Field: on_schedule_24h
 *     ScheduledNet: 2026-06-10 02:00:00 UTC
 *     ToleranceSec: 86400
 *     YES iff status terminal (Success/Failure/Partial) AND
 *         |response.net - ScheduledNet| <= ToleranceSec.
 *     pending while not yet lifted off.
 *
 * Required env:
 *   LL2_BASE        default https://ll.thespacedevs.com/2.2.0
 *   LL2_API_KEY     optional; raises rate limit from 15 -> 35 req/hr
 *
 * Caching: a `Success`/`Failure`/`Partial Failure` response for a given
 * LaunchId is terminal; callers should memoize per LaunchId to avoid burning
 * the small free-tier quota.
 */

import type { ResolveResult } from './types.js';

// Apple Music IDs / LaunchIds may exceed Number.MAX_SAFE_INTEGER -- keep strings.
type StatusId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
const TERMINAL_STATUS: ReadonlySet<StatusId> = new Set<StatusId>([3, 4, 7]);
const SUCCESS_DEFAULT: ReadonlySet<StatusId> = new Set<StatusId>([3]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_UTC_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) UTC$/;

export interface SpaceCriteria {
  provider: 'll2';
  launchId: string;
  resolveAfter: number;       // epoch ms
  field: 'mission_success' | 'on_schedule_24h';
  successStatusIds?: ReadonlySet<StatusId>;
  scheduledNetMs?: number;
  toleranceSec?: number;
  tieBreak: boolean;          // NO->false, YES->true
}

export class SpaceParseError extends Error {}

function parseUtcDateLine(value: string): number {
  const m = ISO_UTC_RE.exec(value);
  if (!m) throw new SpaceParseError(`bad UTC timestamp: ${value}`);
  const [, y, mo, d, h, mi, s] = m;
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) throw new SpaceParseError(`unparseable UTC: ${value}`);
  return ms;
}

function readLine(text: string, key: string): string | null {
  const re = new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'im');
  const m = re.exec(text);
  return m ? m[1] : null;
}

export function parseSpaceCriteria(text: string): SpaceCriteria {
  const provider = readLine(text, 'Provider');
  if (provider !== 'll2') throw new SpaceParseError(`unsupported Provider: ${provider}`);

  const launchId = readLine(text, 'LaunchId');
  if (!launchId || !UUID_RE.test(launchId)) throw new SpaceParseError(`bad LaunchId: ${launchId}`);

  const resolveAfterRaw = readLine(text, 'ResolveAfter');
  if (!resolveAfterRaw) throw new SpaceParseError('missing ResolveAfter');
  const resolveAfter = parseUtcDateLine(resolveAfterRaw);

  const field = readLine(text, 'Field');
  if (field !== 'mission_success' && field !== 'on_schedule_24h') {
    throw new SpaceParseError(`unsupported Field: ${field}`);
  }

  const tieBreakRaw = readLine(text, 'TieBreak') ?? 'NO';
  if (tieBreakRaw !== 'YES' && tieBreakRaw !== 'NO') {
    throw new SpaceParseError(`bad TieBreak: ${tieBreakRaw}`);
  }
  const tieBreak = tieBreakRaw === 'YES';

  const out: SpaceCriteria = {
    provider: 'll2',
    launchId: launchId.toLowerCase(),
    resolveAfter,
    field,
    tieBreak,
  };

  if (field === 'mission_success') {
    const ids = readLine(text, 'SuccessStatusIds');
    if (ids) {
      const set = new Set<StatusId>();
      for (const piece of ids.split(',').map((s) => s.trim())) {
        const n = Number(piece);
        if (!Number.isInteger(n) || n < 1 || n > 8) throw new SpaceParseError(`bad SuccessStatusId: ${piece}`);
        set.add(n as StatusId);
      }
      out.successStatusIds = set;
    } else {
      out.successStatusIds = SUCCESS_DEFAULT;
    }
  } else {
    const sched = readLine(text, 'ScheduledNet');
    if (!sched) throw new SpaceParseError('on_schedule_24h requires ScheduledNet');
    out.scheduledNetMs = parseUtcDateLine(sched);
    const tol = readLine(text, 'ToleranceSec');
    if (!tol) throw new SpaceParseError('on_schedule_24h requires ToleranceSec');
    const tolN = Number(tol);
    if (!Number.isInteger(tolN) || tolN <= 0 || tolN > 30 * 86400) {
      throw new SpaceParseError(`bad ToleranceSec: ${tol}`);
    }
    out.toleranceSec = tolN;
  }

  return out;
}

interface LL2Launch {
  id: string;
  status: { id: number; abbrev: string };
  net: string | null;
}

// Per-LaunchId caches, plus a global request budget, to stay under LL2's
// rate limit (15 req/hr unauthenticated, 35 req/hr with LL2_API_KEY, per
// this file's own header comment). requestBudgetOk() is the hard limit --
// it fails closed before any request that would cross the real ceiling, no
// matter how many launchIds are being tracked or how the caches below are
// tuned. terminalCache/recentCache exist only to avoid *needing* the budget
// check in the common case; they are an efficiency layer, not a safety net.
//
//   terminalCache — once a launch reaches a terminal status (Success/
//                   Failure/Partial Failure), cached for the process
//                   lifetime; no further calls for that launch, ever.
//   recentCache   — non-terminal statuses (Go/TBD/Hold/In Flight/TBC)
//                   cached for RECENT_TTL_MS, to cut demand from one launch
//                   before it ever reaches requestBudgetOk. 2026-09-19: a
//                   TTL equal to the keeper's own poll tick meant this cache
//                   never survived to the next tick, so a single tracked
//                   launch alone produced ~60 req/hr against the shared
//                   ceiling -- a week-long 429 loop. If this TTL is ever
//                   misconfigured again, requestBudgetOk below still holds
//                   the line; only resolution latency degrades, not quota.
//   requestWindowStart/requestCountInWindow — see requestBudgetOk. Sized
//                   for the launch count open today (one). If a second
//                   SpaceX market is ever created before the first one
//                   resolves, per-launch demand (RECENT_TTL_MS) leaves
//                   little headroom for a second launch, especially
//                   unauthenticated -- get a real LL2_API_KEY (35 req/hr)
//                   before batch-creating another one while one is open.
//
const TERMINAL_STATUS_IDS = new Set<number>([3, 4, 7]);
const RECENT_TTL_MS = 5 * 60_000;
const FAILURE_BACKOFF_MS = 5 * 60_000;
const REQUEST_WINDOW_MS = 60 * 60_000;
// Trimmed once here so a stray trailing newline/space from .env parsing
// (a recurring hazard in this repo) can't read as a non-empty key while
// LL2 itself rejects it -- the exact truthy-empty-string class of bug that
// left this resolver running unauthenticated for the 2026-09-19 incident.
const LL2_API_KEY = process.env.LL2_API_KEY?.trim() || undefined;
const HOURLY_CEILING = LL2_API_KEY ? 35 : 15;
// Headroom below HOURLY_CEILING. fetchLaunch is only ever reached
// sequentially per launchId from prediction-keeper's tick loop, and a
// terminal transition is cached before the next market in the same tick
// can miss it, so same-launch calls never double up. The margin exists for
// *other*, distinct launchIds warming their cache in the same tick.
const SAFETY_MARGIN = 1;
const terminalCache = new Map<string, LL2Launch>();
const recentCache = new Map<string, { value: LL2Launch; ts: number }>();
// Backoff per (launchId) after a 429/5xx so a burst of ticks does not
// hammer the rate limit further.
const failureBackoff = new Map<string, { until: number; reason: string }>();
// Fixed-window counter of requests actually sent in the current
// REQUEST_WINDOW_MS window, across all launchIds -- the shared-quota guard
// described above. A launch-agnostic count is sufficient: the goal is only
// to never exceed LL2's total ceiling, not to allocate it fairly.
let requestWindowStart = 0;
let requestCountInWindow = 0;

// Exported for tests; production code only uses the resolver entry point.
export function _clearSpaceCaches(): void {
  terminalCache.clear();
  recentCache.clear();
  failureBackoff.clear();
  requestWindowStart = 0;
  requestCountInWindow = 0;
}

function requestBudgetOk(now: number): boolean {
  if (now - requestWindowStart >= REQUEST_WINDOW_MS) {
    requestWindowStart = now;
    requestCountInWindow = 0;
  }
  return requestCountInWindow < HOURLY_CEILING - SAFETY_MARGIN;
}

async function fetchLaunch(launchId: string): Promise<LL2Launch> {
  const cachedTerminal = terminalCache.get(launchId);
  if (cachedTerminal) return cachedTerminal;
  const now = Date.now();
  const cachedRecent = recentCache.get(launchId);
  if (cachedRecent && now - cachedRecent.ts < RECENT_TTL_MS) {
    return cachedRecent.value;
  }
  const backoff = failureBackoff.get(launchId);
  if (backoff && now < backoff.until) {
    throw new Error(`LL2 backoff in effect: ${backoff.reason} (resumes in ${Math.ceil((backoff.until - now) / 1000)}s)`);
  }
  if (!requestBudgetOk(now)) {
    throw new Error(
      `LL2 client-side hourly budget exhausted (${requestCountInWindow}/${HOURLY_CEILING} shared across all tracked launches)`,
    );
  }

  const base = process.env.LL2_BASE || 'https://ll.thespacedevs.com/2.2.0';
  const url = `${base}/launch/${encodeURIComponent(launchId)}/`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (LL2_API_KEY) headers.Authorization = `Token ${LL2_API_KEY}`;

  // Count the attempt against the shared budget regardless of outcome --
  // a failed or 429'd request still spent one of LL2's quota slots.
  requestCountInWindow += 1;

  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  } catch (err) {
    failureBackoff.set(launchId, { until: now + FAILURE_BACKOFF_MS, reason: 'network error' });
    throw err;
  }
  if (!res.ok) {
    if (res.status === 429 || res.status >= 500) {
      failureBackoff.set(launchId, { until: now + FAILURE_BACKOFF_MS, reason: `HTTP ${res.status}` });
    }
    throw new Error(`LL2 HTTP ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as LL2Launch;
  failureBackoff.delete(launchId);

  const statusId = body.status?.id;
  if (typeof statusId === 'number' && TERMINAL_STATUS_IDS.has(statusId)) {
    terminalCache.set(launchId, body);
    recentCache.delete(launchId);
  } else {
    recentCache.set(launchId, { value: body, ts: now });
  }
  return body;
}

export async function resolveSpace(criteria: SpaceCriteria, _now: number): Promise<ResolveResult> {
  if (process.env.SPACE_RESOLVER_DISABLED === 'true') {
    return { state: 'pending', reason: 'SPACE_RESOLVER_DISABLED' };
  }

  let launch: LL2Launch;
  try {
    launch = await fetchLaunch(criteria.launchId);
  } catch (err) {
    return { state: 'pending', reason: `ll2 fetch failed: ${err instanceof Error ? err.message : String(err)}` };
  }

  const statusId = launch.status?.id as StatusId | undefined;
  if (statusId === undefined) return { state: 'pending', reason: 'no status.id' };

  if (criteria.field === 'mission_success') {
    const success = criteria.successStatusIds ?? SUCCESS_DEFAULT;
    if (success.has(statusId)) {
      return { state: 'resolved', outcome: true, evidence: `status.id=${statusId} ${launch.status.abbrev}` };
    }
    if (statusId === 4 || statusId === 7) {
      return { state: 'resolved', outcome: false, evidence: `status.id=${statusId} ${launch.status.abbrev}` };
    }
    return { state: 'pending', reason: `status.id=${statusId} ${launch.status.abbrev}` };
  }

  // on_schedule_24h
  if (!TERMINAL_STATUS.has(statusId)) {
    return { state: 'pending', reason: `status.id=${statusId} not terminal` };
  }
  if (!launch.net) return { state: 'pending', reason: 'net missing despite terminal status' };
  const actual = Date.parse(launch.net);
  if (!Number.isFinite(actual)) return { state: 'pending', reason: `unparseable net: ${launch.net}` };

  const delta = Math.abs(actual - (criteria.scheduledNetMs ?? 0));
  const tol = (criteria.toleranceSec ?? 0) * 1000;
  const outcome = delta <= tol;
  return {
    state: 'resolved',
    outcome,
    evidence: `actual_net=${launch.net} scheduled=${new Date(criteria.scheduledNetMs ?? 0).toISOString()} delta_sec=${Math.round(delta / 1000)} tol_sec=${criteria.toleranceSec}`,
  };
}
