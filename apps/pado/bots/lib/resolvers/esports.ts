/**
 * Esports (LoL) resolver via lolesports unofficial getSchedule API.
 *
 * Single market shape, binary, series-level:
 *
 *   Field: home_win
 *     YES iff teams[HomeTeamCode].result.outcome === 'win' at series end.
 *     NO  iff teams[AwayTeamCode].result.outcome === 'win'.
 *     PENDING for unstarted/inProgress, non-empty match.flags (forfeit/walkover
 *     etc.), gameWins-majority mismatch, or anomaly -- let cancel_expired_market
 *     handle refunds when resolve_deadline elapses.
 *
 * Data source: getSchedule on persisted/gw with a public x-api-key constant.
 * Observed live (2026-05-25): event.state in {unstarted, inProgress, completed},
 * teams[i].result is null pre-completion and { gameWins, outcome:'win'|'loss' }
 * post-completion, match.flags is string[] (empty in normal flow), match.strategy
 * carries { type:'bestOf', count } with count in {1,3,5}. getEventDetails is
 * game-level only and not needed for series resolution.
 *
 * Lifecycle:
 *   state in {unstarted, inProgress} -> pending
 *   state === completed && flags non-empty -> pending (cancel_expired_market refunds)
 *   state === completed && flags empty && results populated && gameWins
 *     majority matches winner outcome && stability window elapsed -> resolved
 *   anything else -> pending or hard error (rebrand/lookup miss)
 *
 * Required env: none. Public unofficial endpoint.
 *   LOLESPORTS_API_KEY  optional override for the public x-api-key constant
 *   LOLESPORTS_LEAGUE_ID  optional override for the LCK leagueId
 *   LOLESPORTS_BASE  optional override for the API base (tests)
 *   ESPORTS_RESOLVER_DISABLED  kill switch
 *
 * Caching: the schedule response is cached per (leagueId) for 60s. A completed
 * event is promoted to a per-matchId finalCache only after it has been
 * observed in the completed state for StabilityWindowMin minutes AND the
 * gameWins majority cross-check passes. This mirrors the sports.ts pattern
 * that prevented the 2026-05-20 Freiburg in-play freeze: never promote on
 * the first sight of a terminal flag.
 */

import type { ResolveResult } from './types.js';

const MATCH_ID_RE = /^\d{17,19}$/;

// lolesports stamps benign post-game metadata on completed matches. Live LCK
// data 2026-05-25 confirms `hasVod` is present on every normal completion, so
// "flags non-empty -> refund" would unconditionally void every market. We
// allowlist known-benign markers and treat anything else (typical forfeit /
// walkover / postponed indicators when they surface) as abnormal -> pending
// -> cancel_expired_market refund.
//
// Stored lower-case; comparison is case-insensitive against the live string.
// As new flags are observed in production they should be classified here and
// in apps/pado/docs/bots.md "lolesports observed flags".
const BENIGN_FLAGS = new Set<string>(['hasvod', 'hashighlights']);
const TEAM_CODE_RE = /^[A-Z0-9]{2,5}$/;
const ISO_UTC_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}) UTC$/;
const BEST_OF_ALLOWED = new Set([1, 3, 5]);

const DEFAULT_LEAGUE_ID = '98767991310872058'; // LCK
const DEFAULT_API_KEY = '__REDACTED_LOL_API_KEY__';
const DEFAULT_BASE = 'https://esports-api.lolesports.com/persisted/gw';

const FETCH_TIMEOUT_MS = 8000;
const FAILURE_BACKOFF_MS = 5 * 60_000;
const RECENT_TTL_MS = 60_000;

export interface EsportsCriteria {
  provider: 'lolesports';
  league: 'LCK';
  matchId: string;
  homeTeamCode: string;
  awayTeamCode: string;
  homeTeamName: string;
  awayTeamName: string;
  bestOf: 1 | 3 | 5;
  resolveAfter: number;
  field: 'home_win';
  stabilityWindowMin: number;
}

export class EsportsParseError extends Error {}

function readLine(text: string, key: string): string | null {
  const re = new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'im');
  const m = re.exec(text);
  return m ? m[1] : null;
}

function parseUtcDateLine(value: string): number {
  const m = ISO_UTC_RE.exec(value);
  if (!m) throw new EsportsParseError(`bad UTC timestamp: ${value}`);
  const [, y, mo, d, h, mi, s] = m;
  const ms = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);
  if (!Number.isFinite(ms)) throw new EsportsParseError(`unparseable UTC: ${value}`);
  return ms;
}

export function parseEsportsCriteria(text: string): EsportsCriteria {
  const provider = readLine(text, 'Provider');
  if (provider !== 'lolesports') {
    throw new EsportsParseError(`unsupported Provider: ${provider}`);
  }

  const league = readLine(text, 'League');
  if (league !== 'LCK') {
    throw new EsportsParseError(`unsupported League: ${league}`);
  }

  const matchId = readLine(text, 'MatchId');
  if (!matchId || !MATCH_ID_RE.test(matchId)) {
    throw new EsportsParseError(`bad MatchId: ${matchId}`);
  }

  const homeTeamCode = (readLine(text, 'HomeTeamCode') ?? '').toUpperCase();
  const awayTeamCode = (readLine(text, 'AwayTeamCode') ?? '').toUpperCase();
  if (!TEAM_CODE_RE.test(homeTeamCode)) {
    throw new EsportsParseError(`bad HomeTeamCode: ${homeTeamCode}`);
  }
  if (!TEAM_CODE_RE.test(awayTeamCode)) {
    throw new EsportsParseError(`bad AwayTeamCode: ${awayTeamCode}`);
  }
  if (homeTeamCode === 'TBD' || awayTeamCode === 'TBD') {
    throw new EsportsParseError('teams must be revealed (TBD not allowed)');
  }
  if (homeTeamCode === awayTeamCode) {
    throw new EsportsParseError(`HomeTeamCode equals AwayTeamCode: ${homeTeamCode}`);
  }

  const homeTeamName = readLine(text, 'HomeTeamName');
  const awayTeamName = readLine(text, 'AwayTeamName');
  if (!homeTeamName || homeTeamName.length > 64) {
    throw new EsportsParseError(`bad HomeTeamName: ${homeTeamName}`);
  }
  if (!awayTeamName || awayTeamName.length > 64) {
    throw new EsportsParseError(`bad AwayTeamName: ${awayTeamName}`);
  }

  const bestOfRaw = readLine(text, 'BestOf');
  const bestOf = Number(bestOfRaw);
  if (!Number.isInteger(bestOf) || !BEST_OF_ALLOWED.has(bestOf)) {
    throw new EsportsParseError(`bad BestOf: ${bestOfRaw}`);
  }

  const resolveAfterRaw = readLine(text, 'ResolveAfter');
  if (!resolveAfterRaw) throw new EsportsParseError('missing ResolveAfter');
  const resolveAfter = parseUtcDateLine(resolveAfterRaw);

  const field = readLine(text, 'Field');
  if (field !== 'home_win') {
    throw new EsportsParseError(`unsupported Field: ${field}`);
  }

  const stabilityRaw = readLine(text, 'StabilityWindowMin');
  let stabilityWindowMin = 10;
  if (stabilityRaw !== null) {
    const parsed = Number(stabilityRaw);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 60) {
      throw new EsportsParseError(`bad StabilityWindowMin: ${stabilityRaw}`);
    }
    stabilityWindowMin = parsed;
  }

  return {
    provider: 'lolesports',
    league: 'LCK',
    matchId,
    homeTeamCode,
    awayTeamCode,
    homeTeamName,
    awayTeamName,
    bestOf: bestOf as 1 | 3 | 5,
    resolveAfter,
    field: 'home_win',
    stabilityWindowMin,
  };
}

// ===== Live response shape (subset we depend on) =====
interface ScheduleTeamResult {
  gameWins: number;
  outcome: 'win' | 'loss' | string | null;
}
interface ScheduleTeam {
  code: string | null;
  name: string | null;
  result: ScheduleTeamResult | null;
}
interface ScheduleMatch {
  id: string;
  flags: string[];
  teams: ScheduleTeam[];
  strategy?: { type?: string; count?: number };
}
interface ScheduleEvent {
  type?: string;
  state: 'unstarted' | 'inProgress' | 'completed' | string;
  startTime?: string;
  match?: ScheduleMatch;
}
interface ScheduleResponse {
  data?: { schedule?: { events?: ScheduleEvent[] } };
}

interface EsportsEventView {
  matchId: string;
  state: string;
  flags: string[];
  bestOf: number | null;
  teams: { code: string; name: string; gameWins: number; outcome: string | null }[];
}

const scheduleCache = new Map<string, { value: ScheduleResponse; ts: number }>();
const failureBackoff = new Map<string, { until: number; reason: string }>();
const firstCompletedAt = new Map<string, number>();
const finalCache = new Map<string, EsportsEventView>();

export function _clearEsportsCaches(): void {
  scheduleCache.clear();
  failureBackoff.clear();
  firstCompletedAt.clear();
  finalCache.clear();
}

/**
 * Drops the per-leagueId schedule snapshot without touching stability-window or
 * final-cache state. Tests use this to force a re-fetch after advancing fake
 * timers past the stability window but while still holding their armed
 * `firstCompletedAt` entry.
 */
export function _clearEsportsScheduleCache(): void {
  scheduleCache.clear();
}

function leagueId(): string {
  return process.env.LOLESPORTS_LEAGUE_ID || DEFAULT_LEAGUE_ID;
}
function apiKey(): string {
  return process.env.LOLESPORTS_API_KEY || DEFAULT_API_KEY;
}
function apiBase(): string {
  return process.env.LOLESPORTS_BASE || DEFAULT_BASE;
}

async function fetchSchedule(): Promise<ScheduleResponse> {
  const lid = leagueId();
  const now = Date.now();

  const recent = scheduleCache.get(lid);
  if (recent && now - recent.ts < RECENT_TTL_MS) return recent.value;

  const backoff = failureBackoff.get(lid);
  if (backoff && now < backoff.until) {
    throw new Error(`lolesports backoff: ${backoff.reason} (resumes in ${Math.ceil((backoff.until - now) / 1000)}s)`);
  }

  const url = `${apiBase()}/getSchedule?hl=en-US&leagueId=${encodeURIComponent(lid)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'x-api-key': apiKey() },
    });
  } catch (err) {
    failureBackoff.set(lid, { until: now + FAILURE_BACKOFF_MS, reason: 'network error' });
    throw err;
  }
  if (!res.ok) {
    if (res.status === 429 || res.status >= 500) {
      failureBackoff.set(lid, { until: now + FAILURE_BACKOFF_MS, reason: `HTTP ${res.status}` });
    }
    throw new Error(`lolesports HTTP ${res.status}`);
  }
  failureBackoff.delete(lid);
  const body = (await res.json()) as ScheduleResponse;
  scheduleCache.set(lid, { value: body, ts: now });
  return body;
}

function findEvent(schedule: ScheduleResponse, matchId: string): ScheduleEvent | null {
  const events = schedule.data?.schedule?.events ?? [];
  for (const ev of events) {
    if (ev.match?.id === matchId) return ev;
  }
  return null;
}

function buildView(ev: ScheduleEvent): EsportsEventView | null {
  const m = ev.match;
  if (!m) return null;
  const teams: EsportsEventView['teams'] = [];
  for (const t of m.teams ?? []) {
    // `-1` is a sentinel for missing/null gameWins; decideFromView treats any
    // value `< required` as a majority-mismatch -> pending. We never accept a
    // resolve from a partially populated payload.
    const rawWins = t.result?.gameWins;
    teams.push({
      code: (t.code ?? '').toUpperCase().trim(),
      name: (t.name ?? '').trim(),
      gameWins: typeof rawWins === 'number' && Number.isInteger(rawWins) && rawWins >= 0 ? rawWins : -1,
      outcome: t.result?.outcome ?? null,
    });
  }
  return {
    matchId: m.id,
    state: ev.state,
    flags: Array.isArray(m.flags) ? m.flags : [],
    bestOf: m.strategy?.count ?? null,
    teams,
  };
}

export async function resolveEsports(criteria: EsportsCriteria, _now: number): Promise<ResolveResult> {
  if (process.env.ESPORTS_RESOLVER_DISABLED === 'true') {
    return { state: 'pending', reason: 'ESPORTS_RESOLVER_DISABLED' };
  }

  // finalCache short-circuit: once an event has cleared the stability window
  // and the cross-check, the answer is immutable for this process.
  const cached = finalCache.get(criteria.matchId);
  if (cached) {
    return decideFromView(criteria, cached);
  }

  let schedule: ScheduleResponse;
  try {
    schedule = await fetchSchedule();
  } catch (err) {
    return {
      state: 'pending',
      reason: `lolesports fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const ev = findEvent(schedule, criteria.matchId);
  if (!ev) return { state: 'pending', reason: 'match not in schedule' };
  if (ev.type && ev.type !== 'match') {
    return { state: 'pending', reason: `non-match event type: ${ev.type}` };
  }

  const view = buildView(ev);
  if (!view) return { state: 'pending', reason: 'event missing match payload' };

  if (view.state === 'unstarted' || view.state === 'inProgress') {
    return { state: 'pending', reason: `state=${view.state}` };
  }
  if (view.state !== 'completed') {
    return { state: 'pending', reason: `unknown state: ${view.state}` };
  }

  // Forfeit / walkover / postponed signal. lolesports flags carries both
  // benign metadata (hasVod, hasHighlights) and abnormal markers. We only
  // resolve when every observed flag is on the benign allowlist; an unknown
  // entry blocks resolution so cancel_expired_market refunds at deadline.
  const unknownFlags = view.flags.filter((f) => !BENIGN_FLAGS.has(f.toLowerCase()));
  if (unknownFlags.length > 0) {
    return { state: 'pending', reason: `unknown flags=${unknownFlags.join(',')} (all=${view.flags.join(',')})` };
  }

  if (view.teams.length !== 2) {
    throw new EsportsParseError(`teams.length=${view.teams.length} (expected 2)`);
  }
  if (view.teams.some((t) => t.code === 'TBD')) {
    return { state: 'pending', reason: 'teams not yet revealed (TBD)' };
  }
  if (view.teams.every((t) => t.outcome === null)) {
    return { state: 'pending', reason: 'results not populated despite state=completed' };
  }

  const home = view.teams.find((t) => t.code === criteria.homeTeamCode);
  const away = view.teams.find((t) => t.code === criteria.awayTeamCode);
  if (!home || !away) {
    throw new EsportsParseError(
      `team codes not found in schedule (criteria home=${criteria.homeTeamCode} away=${criteria.awayTeamCode}; schedule=${view.teams.map((t) => t.code).join(',')})`,
    );
  }
  if (home.code === away.code) {
    throw new EsportsParseError(`schedule has duplicate code ${home.code}`);
  }

  // Stability window: keep the very first observation timestamp, only resolve
  // after stabilityWindowMin minutes. This absorbs late Riot corrections.
  const now = Date.now();
  const firstSeen = firstCompletedAt.get(criteria.matchId);
  if (firstSeen === undefined) {
    firstCompletedAt.set(criteria.matchId, now);
    return {
      state: 'pending',
      reason: `stabilizing (${criteria.stabilityWindowMin * 60}s remaining)`,
    };
  }
  const elapsed = now - firstSeen;
  const required = criteria.stabilityWindowMin * 60_000;
  if (elapsed < required) {
    const remaining = Math.ceil((required - elapsed) / 1000);
    return { state: 'pending', reason: `stabilizing (${remaining}s remaining)` };
  }

  // Cross-check outcome and gameWins consistency before promotion.
  const decision = decideFromView(criteria, view);
  if (decision.state === 'resolved') {
    finalCache.set(criteria.matchId, view);
  }
  return decision;
}

function decideFromView(criteria: EsportsCriteria, view: EsportsEventView): ResolveResult {
  const home = view.teams.find((t) => t.code === criteria.homeTeamCode);
  const away = view.teams.find((t) => t.code === criteria.awayTeamCode);
  if (!home || !away) {
    // Should be unreachable because resolveEsports has already guarded this
    // path, but keep a defensive pending so a re-fetched (drifted) schedule
    // does not crash the keeper tick.
    return { state: 'pending', reason: 'team codes missing on cached view' };
  }

  const homeOutcome = home.outcome;
  const awayOutcome = away.outcome;
  let outcome: boolean;
  if (homeOutcome === 'win' && awayOutcome === 'loss') outcome = true;
  else if (homeOutcome === 'loss' && awayOutcome === 'win') outcome = false;
  else {
    return {
      state: 'pending',
      reason: `outcome anomaly (home=${homeOutcome} away=${awayOutcome})`,
    };
  }

  // gameWins majority cross-check defends against partially populated results.
  const required = Math.floor(criteria.bestOf / 2) + 1;
  const winner = outcome ? home : away;
  const loser = outcome ? away : home;
  if (winner.gameWins < required || winner.gameWins <= loser.gameWins) {
    return {
      state: 'pending',
      reason: `gameWins majority mismatch (${home.code} ${home.gameWins}-${away.gameWins} ${away.code} bestOf=${criteria.bestOf})`,
    };
  }

  return {
    state: 'resolved',
    outcome,
    evidence: `state=completed ${home.code} ${home.gameWins}-${away.gameWins} ${away.code} bestOf=${criteria.bestOf} matchId=${criteria.matchId}`,
  };
}
