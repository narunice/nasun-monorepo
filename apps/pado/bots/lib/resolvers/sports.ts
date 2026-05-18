/**
 * Sports resolver via TheSportsDB (free tier, key=3).
 *
 * Two market shapes supported, all binary:
 *
 *   Field: home_win
 *     YES iff intHomeScore > intAwayScore at final.
 *     NO  for away_win OR draw.
 *
 *   Field: total_score_over
 *     Threshold: <decimal, e.g. 2.5>
 *     YES iff intHomeScore + intAwayScore > Threshold (after final).
 *
 * Lifecycle:
 *   - intHomeScore / intAwayScore null  -> pending (game not finalized)
 *   - strStatus in {Postponed, Cancelled, Abandoned} -> pending (let
 *     cancel_expired_market handle if deadline elapses)
 *   - status final (Match Finished, FT, AET, etc.) -> resolved
 *
 * Required env: none (free tier uses public key=3 hardcoded by TheSportsDB).
 *   THESPORTSDB_API_KEY  optional, overrides the public free-tier key.
 *
 * Caching: lookupevent for a given eventId is final once score is non-null;
 * cached for the process lifetime. Recent (non-final) responses cached 60s.
 */

import type { ResolveResult } from './types.js';

const EVENT_ID_RE = /^[0-9]{5,12}$/;
const ISO_UTC_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) UTC$/;
// Empty strStatus is treated as final when both scores are present (TheSportsDB
// returns "" for historic events). In-play statuses below are explicit.
const NON_FINAL_STATUSES = new Set([
  'Not Started', 'Scheduled', 'NS', '1H', '2H', 'HT', 'ET', 'P', 'BT',
  'In Play', 'Live',
]);
const VOID_STATUSES = new Set([
  'Postponed', 'Cancelled', 'Canceled', 'Abandoned', 'Suspended', 'Walkover',
]);

export interface SportsCriteria {
  provider: 'thesportsdb';
  eventId: string;
  resolveAfter: number;
  field: 'home_win' | 'total_score_over';
  threshold?: number;
  tieBreak: boolean;
}

export class SportsParseError extends Error {}

function readLine(text: string, key: string): string | null {
  const re = new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'im');
  const m = re.exec(text);
  return m ? m[1] : null;
}

function parseUtcDateLine(value: string): number {
  const m = ISO_UTC_RE.exec(value);
  if (!m) throw new SportsParseError(`bad UTC timestamp: ${value}`);
  const [, y, mo, d, h, mi, s] = m;
  const ms = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);
  if (!Number.isFinite(ms)) throw new SportsParseError(`unparseable UTC: ${value}`);
  return ms;
}

export function parseSportsCriteria(text: string): SportsCriteria {
  const provider = readLine(text, 'Provider');
  if (provider !== 'thesportsdb') throw new SportsParseError(`unsupported Provider: ${provider}`);

  const eventId = readLine(text, 'EventId');
  if (!eventId || !EVENT_ID_RE.test(eventId)) throw new SportsParseError(`bad EventId: ${eventId}`);

  const resolveAfterRaw = readLine(text, 'ResolveAfter');
  if (!resolveAfterRaw) throw new SportsParseError('missing ResolveAfter');
  const resolveAfter = parseUtcDateLine(resolveAfterRaw);

  const field = readLine(text, 'Field');
  if (field !== 'home_win' && field !== 'total_score_over') {
    throw new SportsParseError(`unsupported Field: ${field}`);
  }

  const tieBreakRaw = readLine(text, 'TieBreak') ?? 'NO';
  if (tieBreakRaw !== 'YES' && tieBreakRaw !== 'NO') {
    throw new SportsParseError(`bad TieBreak: ${tieBreakRaw}`);
  }

  const out: SportsCriteria = {
    provider: 'thesportsdb',
    eventId,
    resolveAfter,
    field,
    tieBreak: tieBreakRaw === 'YES',
  };

  if (field === 'total_score_over') {
    const thr = readLine(text, 'Threshold');
    const n = Number(thr);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      throw new SportsParseError(`bad Threshold: ${thr}`);
    }
    out.threshold = n;
  }
  return out;
}

interface SportsDbEvent {
  idEvent: string;
  strEvent: string;
  intHomeScore: string | null;
  intAwayScore: string | null;
  strStatus: string | null;
}

const finalCache = new Map<string, SportsDbEvent>();
const recentCache = new Map<string, { value: SportsDbEvent | null; ts: number }>();
const failureBackoff = new Map<string, { until: number; reason: string }>();
const FAILURE_BACKOFF_MS = 5 * 60_000;
const RECENT_TTL_MS = 60_000;

export function _clearSportsCaches(): void {
  finalCache.clear();
  recentCache.clear();
  failureBackoff.clear();
}

async function fetchEvent(eventId: string): Promise<SportsDbEvent | null> {
  const cached = finalCache.get(eventId);
  if (cached) return cached;
  const now = Date.now();
  const recent = recentCache.get(eventId);
  if (recent && now - recent.ts < RECENT_TTL_MS) return recent.value;
  const backoff = failureBackoff.get(eventId);
  if (backoff && now < backoff.until) {
    throw new Error(`sportsdb backoff: ${backoff.reason} (resumes in ${Math.ceil((backoff.until - now) / 1000)}s)`);
  }

  const key = process.env.THESPORTSDB_API_KEY || '3';
  const url = `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(key)}/lookupevent.php?id=${encodeURIComponent(eventId)}`;
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  } catch (err) {
    failureBackoff.set(eventId, { until: now + FAILURE_BACKOFF_MS, reason: 'network error' });
    throw err;
  }
  if (!res.ok) {
    if (res.status === 429 || res.status >= 500) {
      failureBackoff.set(eventId, { until: now + FAILURE_BACKOFF_MS, reason: `HTTP ${res.status}` });
    }
    throw new Error(`sportsdb HTTP ${res.status}`);
  }
  const body = (await res.json()) as { events: SportsDbEvent[] | null };
  failureBackoff.delete(eventId);
  const event = body.events?.[0] ?? null;

  if (event && event.intHomeScore !== null && event.intAwayScore !== null) {
    finalCache.set(eventId, event);
    recentCache.delete(eventId);
  } else {
    recentCache.set(eventId, { value: event, ts: now });
  }
  return event;
}

export async function resolveSports(criteria: SportsCriteria, _now: number): Promise<ResolveResult> {
  if (process.env.SPORTS_RESOLVER_DISABLED === 'true') {
    return { state: 'pending', reason: 'SPORTS_RESOLVER_DISABLED' };
  }
  let event: SportsDbEvent | null;
  try {
    event = await fetchEvent(criteria.eventId);
  } catch (err) {
    return { state: 'pending', reason: `sportsdb fetch failed: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!event) return { state: 'pending', reason: 'event not in DB' };

  const status = (event.strStatus ?? '').trim();
  if (VOID_STATUSES.has(status)) {
    return { state: 'pending', reason: `void status: ${status}` };
  }
  if (event.intHomeScore === null || event.intAwayScore === null) {
    return { state: 'pending', reason: `scores not finalized (status=${status})` };
  }
  if (NON_FINAL_STATUSES.has(status)) {
    return { state: 'pending', reason: `status not final: ${status}` };
  }

  const home = Number(event.intHomeScore);
  const away = Number(event.intAwayScore);
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0) {
    return { state: 'pending', reason: `bad scores: home=${event.intHomeScore} away=${event.intAwayScore}` };
  }

  if (criteria.field === 'home_win') {
    const outcome = home > away;
    return {
      state: 'resolved',
      outcome,
      evidence: `home=${home} away=${away} status=${status}`,
    };
  }

  // total_score_over
  const total = home + away;
  const outcome = total > (criteria.threshold ?? 0);
  return {
    state: 'resolved',
    outcome,
    evidence: `total=${total} threshold=${criteria.threshold} status=${status}`,
  };
}
