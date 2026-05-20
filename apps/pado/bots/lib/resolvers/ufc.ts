/**
 * UFC (MMA) resolver via ESPN core API (public, unauthenticated).
 *
 * Single market shape, binary:
 *
 *   Field: fighter_a_wins
 *     YES iff AthleteAId is the declared winner at final.
 *     NO  iff AthleteBId is the declared winner at final.
 *     PENDING for No Contest / Draw / non-final status -- let
 *     cancel_expired_market handle refunds if deadline elapses.
 *
 * ESPN exposes per-fight winner flags on the competition resource:
 *   GET /v2/sports/mma/leagues/ufc/events/{eventId}/competitions/{compId}
 *   -> competitors[].athlete.$ref + competitors[].winner: bool + status.$ref
 * The status sub-resource carries state ('pre' | 'in' | 'post') and
 * completed: bool. We resolve only when state='post' && completed=true.
 *
 * Lifecycle:
 *   - state in {pre, in} OR completed=false -> pending
 *   - state=post, completed=true, exactly one competitor with winner=true
 *     and athleteId matches AthleteAId or AthleteBId -> resolved
 *   - state=post, completed=true, both winner=false (No Contest / Draw)
 *     OR the winning athleteId is neither A nor B (data drift) -> pending
 *     (cancel_expired_market refunds at deadline)
 *
 * Required env: none. ESPN core API is public.
 *   ESPN_MMA_BASE  optional, overrides default base URL (for tests).
 *
 * Caching: a competition with state=post and completed=true is final and
 * cached for process lifetime. Non-terminal responses cached 60s.
 */

import type { ResolveResult } from './types.js';

const ESPN_ID_RE = /^[0-9]{6,12}$/;
const ATHLETE_ID_RE = /^[0-9]{4,10}$/;
const ISO_UTC_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) UTC$/;

export interface UfcCriteria {
  provider: 'espn';
  eventId: string;
  competitionId: string;
  athleteAId: string;
  athleteBId: string;
  fighterA: string;
  fighterB: string;
  resolveAfter: number;
  field: 'fighter_a_wins';
}

export class UfcParseError extends Error {}

function readLine(text: string, key: string): string | null {
  const re = new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'im');
  const m = re.exec(text);
  return m ? m[1] : null;
}

function parseUtcDateLine(value: string): number {
  const m = ISO_UTC_RE.exec(value);
  if (!m) throw new UfcParseError(`bad UTC timestamp: ${value}`);
  const [, y, mo, d, h, mi, s] = m;
  const ms = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);
  if (!Number.isFinite(ms)) throw new UfcParseError(`unparseable UTC: ${value}`);
  return ms;
}

export function parseUfcCriteria(text: string): UfcCriteria {
  const provider = readLine(text, 'Provider');
  if (provider !== 'espn') throw new UfcParseError(`unsupported Provider: ${provider}`);

  const eventId = readLine(text, 'EventId');
  if (!eventId || !ESPN_ID_RE.test(eventId)) throw new UfcParseError(`bad EventId: ${eventId}`);

  const competitionId = readLine(text, 'CompetitionId');
  if (!competitionId || !ESPN_ID_RE.test(competitionId)) {
    throw new UfcParseError(`bad CompetitionId: ${competitionId}`);
  }

  const athleteAId = readLine(text, 'AthleteAId');
  if (!athleteAId || !ATHLETE_ID_RE.test(athleteAId)) {
    throw new UfcParseError(`bad AthleteAId: ${athleteAId}`);
  }
  const athleteBId = readLine(text, 'AthleteBId');
  if (!athleteBId || !ATHLETE_ID_RE.test(athleteBId)) {
    throw new UfcParseError(`bad AthleteBId: ${athleteBId}`);
  }
  if (athleteAId === athleteBId) {
    throw new UfcParseError(`AthleteAId equals AthleteBId: ${athleteAId}`);
  }

  const fighterA = readLine(text, 'FighterA');
  const fighterB = readLine(text, 'FighterB');
  if (!fighterA || !fighterB) {
    throw new UfcParseError('missing FighterA or FighterB');
  }

  const resolveAfterRaw = readLine(text, 'ResolveAfter');
  if (!resolveAfterRaw) throw new UfcParseError('missing ResolveAfter');
  const resolveAfter = parseUtcDateLine(resolveAfterRaw);

  const field = readLine(text, 'Field');
  if (field !== 'fighter_a_wins') {
    throw new UfcParseError(`unsupported Field: ${field}`);
  }

  return {
    provider: 'espn',
    eventId,
    competitionId,
    athleteAId,
    athleteBId,
    fighterA,
    fighterB,
    resolveAfter,
    field: 'fighter_a_wins',
  };
}

interface CompetitionView {
  state: 'pre' | 'in' | 'post' | string;
  completed: boolean;
  competitors: { athleteId: string; winner: boolean }[];
}

const finalCache = new Map<string, CompetitionView>();
const recentCache = new Map<string, { value: CompetitionView | null; ts: number }>();
const failureBackoff = new Map<string, { until: number; reason: string }>();
const FAILURE_BACKOFF_MS = 5 * 60_000;
const RECENT_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 8000;

export function _clearUfcCaches(): void {
  finalCache.clear();
  recentCache.clear();
  failureBackoff.clear();
}

// Extract a numeric ESPN id from an athlete $ref URL.
// Example: "http://sports.core.api.espn.com/v2/sports/mma/athletes/5290957?lang=en&region=us"
const ATHLETE_REF_RE = /\/athletes\/(\d+)(?:\?|$)/;
function athleteIdFromRef(ref: string): string | null {
  const m = ATHLETE_REF_RE.exec(ref);
  return m ? m[1] : null;
}

interface EspnCompetitionRaw {
  status?: { $ref?: string } | null;
  competitors?: Array<{
    winner?: boolean;
    athlete?: { $ref?: string } | null;
  }> | null;
}

interface EspnStatusRaw {
  type?: { state?: string; completed?: boolean } | null;
}

async function fetchJson<T>(url: string, cacheKey: string): Promise<T> {
  const now = Date.now();
  const backoff = failureBackoff.get(cacheKey);
  if (backoff && now < backoff.until) {
    throw new Error(`espn backoff: ${backoff.reason} (resumes in ${Math.ceil((backoff.until - now) / 1000)}s)`);
  }
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (err) {
    failureBackoff.set(cacheKey, { until: now + FAILURE_BACKOFF_MS, reason: 'network error' });
    throw err;
  }
  if (!res.ok) {
    if (res.status === 429 || res.status >= 500) {
      failureBackoff.set(cacheKey, { until: now + FAILURE_BACKOFF_MS, reason: `HTTP ${res.status}` });
    }
    throw new Error(`espn HTTP ${res.status}`);
  }
  failureBackoff.delete(cacheKey);
  return (await res.json()) as T;
}

async function fetchCompetition(eventId: string, competitionId: string): Promise<CompetitionView | null> {
  const cacheKey = `${eventId}/${competitionId}`;
  const cached = finalCache.get(cacheKey);
  if (cached) return cached;
  const now = Date.now();
  const recent = recentCache.get(cacheKey);
  if (recent && now - recent.ts < RECENT_TTL_MS) return recent.value;

  const base = process.env.ESPN_MMA_BASE || 'https://sports.core.api.espn.com/v2/sports/mma/leagues/ufc';
  const compUrl = `${base}/events/${encodeURIComponent(eventId)}/competitions/${encodeURIComponent(competitionId)}`;
  const raw = await fetchJson<EspnCompetitionRaw>(compUrl, cacheKey);

  const competitors = (raw.competitors ?? [])
    .map((c) => {
      const ref = c.athlete?.$ref ?? '';
      const id = athleteIdFromRef(ref);
      return id ? { athleteId: id, winner: c.winner === true } : null;
    })
    .filter((x): x is { athleteId: string; winner: boolean } => x !== null);

  let state = 'pre';
  let completed = false;
  const statusRef = raw.status?.$ref;
  if (statusRef) {
    const status = await fetchJson<EspnStatusRaw>(statusRef, `${cacheKey}:status`);
    state = status.type?.state ?? 'pre';
    completed = status.type?.completed === true;
  }

  const view: CompetitionView = { state, completed, competitors };

  if (state === 'post' && completed) {
    finalCache.set(cacheKey, view);
    recentCache.delete(cacheKey);
  } else {
    recentCache.set(cacheKey, { value: view, ts: now });
  }
  return view;
}

export async function resolveUfc(criteria: UfcCriteria, _now: number): Promise<ResolveResult> {
  if (process.env.UFC_RESOLVER_DISABLED === 'true') {
    return { state: 'pending', reason: 'UFC_RESOLVER_DISABLED' };
  }
  let comp: CompetitionView | null;
  try {
    comp = await fetchCompetition(criteria.eventId, criteria.competitionId);
  } catch (err) {
    return { state: 'pending', reason: `espn fetch failed: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!comp) return { state: 'pending', reason: 'competition not in ESPN' };

  if (comp.state !== 'post' || !comp.completed) {
    return { state: 'pending', reason: `not final (state=${comp.state} completed=${comp.completed})` };
  }

  // Verify the two declared athletes are present on the competition.
  const a = comp.competitors.find((c) => c.athleteId === criteria.athleteAId);
  const b = comp.competitors.find((c) => c.athleteId === criteria.athleteBId);
  if (!a || !b) {
    return {
      state: 'pending',
      reason: `competitors mismatch (expected A=${criteria.athleteAId} B=${criteria.athleteBId}, got ${comp.competitors.map((c) => c.athleteId).join(',')})`,
    };
  }

  const winners = comp.competitors.filter((c) => c.winner);
  if (winners.length !== 1) {
    // No Contest, Draw, or data not yet populated despite state=post.
    return {
      state: 'pending',
      reason: `no single winner (winners=${winners.length}, state=post completed=true) -- likely NC/Draw`,
    };
  }
  const winnerId = winners[0].athleteId;
  if (winnerId !== criteria.athleteAId && winnerId !== criteria.athleteBId) {
    return {
      state: 'pending',
      reason: `winner athleteId=${winnerId} matches neither declared fighter`,
    };
  }

  const outcome = winnerId === criteria.athleteAId;
  return {
    state: 'resolved',
    outcome,
    evidence: `winner=${winnerId} (${outcome ? criteria.fighterA : criteria.fighterB}) state=post`,
  };
}
