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

// Per-LaunchId caches to stay under LL2's unauthenticated 15 req/hr limit.
//
//   terminalCache  — once a launch reaches a terminal status (Success/
//                    Failure/Partial Failure), the response is frozen and
//                    cached for the process lifetime. No further network
//                    calls for that launch.
//   recentCache    — non-terminal statuses (Go/TBD/Hold/In Flight/TBC) are
//                    cached for RECENT_TTL_MS so a tick that touches the
//                    same launch twice (e.g. mission_success + on_schedule
//                    markets for the same NET) costs one HTTP call.
//
// Exported for tests; production code only uses the resolver entry point.
const TERMINAL_STATUS_IDS = new Set<number>([3, 4, 7]);
const RECENT_TTL_MS = 60_000;
const FAILURE_BACKOFF_MS = 5 * 60_000;
const terminalCache = new Map<string, LL2Launch>();
const recentCache = new Map<string, { value: LL2Launch; ts: number }>();
// Backoff per (launchId) after a 429/5xx so a burst of ticks does not
// hammer the unauthenticated 15 req/hr limit further.
const failureBackoff = new Map<string, { until: number; reason: string }>();

export function _clearSpaceCaches(): void {
  terminalCache.clear();
  recentCache.clear();
  failureBackoff.clear();
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

  const base = process.env.LL2_BASE || 'https://ll.thespacedevs.com/2.2.0';
  const url = `${base}/launch/${encodeURIComponent(launchId)}/`;
  const headers: Record<string, string> = { Accept: 'application/json' };
  const apiKey = process.env.LL2_API_KEY;
  if (apiKey) headers.Authorization = `Token ${apiKey}`;

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
