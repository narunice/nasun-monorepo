/**
 * Tests for esports resolver (lolesports getSchedule).
 *
 * Regression focus mirrors sports.ts: finalCache must only be populated after
 * the stability window has elapsed AND the gameWins majority cross-check
 * passes, so a transient or partially-populated terminal response cannot
 * freeze a wrong answer for the rest of the process lifetime.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseEsportsCriteria,
  resolveEsports,
  _clearEsportsCaches,
  _clearEsportsScheduleCache,
  EsportsParseError,
  type EsportsCriteria,
} from './esports.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function schedulePayload(events: unknown[]): unknown {
  return { data: { schedule: { events } } };
}

function makeEvent(opts: {
  matchId?: string;
  state?: string;
  flags?: string[];
  bestOf?: number;
  teams?: Array<{ code: string; name?: string; gameWins?: number; outcome?: string | null }>;
  type?: string;
}): unknown {
  const teams = (opts.teams ?? []).map((t) => ({
    code: t.code,
    name: t.name ?? t.code,
    image: 'x',
    record: null,
    result: t.outcome === undefined && t.gameWins === undefined
      ? null
      : { gameWins: t.gameWins ?? 0, outcome: t.outcome ?? null },
  }));
  return {
    startTime: '2026-05-27T08:00:00Z',
    state: opts.state ?? 'unstarted',
    type: opts.type ?? 'match',
    blockName: 'Regular Season',
    league: { name: 'LCK', slug: 'lck' },
    match: {
      id: opts.matchId ?? '115548128962971863',
      flags: opts.flags ?? [],
      teams,
      strategy: { type: 'bestOf', count: opts.bestOf ?? 3 },
    },
  };
}

const MATCH_ID = '115548128962971863';

const VALID_CRITERIA_TEXT = [
  'Kind: esports',
  'Provider: lolesports',
  'League: LCK',
  `MatchId: ${MATCH_ID}`,
  'HomeTeamCode: GEN',
  'AwayTeamCode: HLE',
  'HomeTeamName: Gen.G',
  'AwayTeamName: Hanwha Life Esports',
  'BestOf: 3',
  'ResolveAfter: 2026-05-27 11:00:00 UTC',
  'Field: home_win',
  '',
].join('\n');

const BASE_CRITERIA: EsportsCriteria = {
  provider: 'lolesports',
  league: 'LCK',
  matchId: MATCH_ID,
  homeTeamCode: 'GEN',
  awayTeamCode: 'HLE',
  homeTeamName: 'Gen.G',
  awayTeamName: 'Hanwha Life Esports',
  bestOf: 3,
  resolveAfter: Date.parse('2026-05-27T11:00:00Z'),
  field: 'home_win',
  stabilityWindowMin: 10,
};

describe('parseEsportsCriteria', () => {
  it('parses a minimal valid criteria block', () => {
    const out = parseEsportsCriteria(VALID_CRITERIA_TEXT);
    expect(out.matchId).toBe(MATCH_ID);
    expect(out.homeTeamCode).toBe('GEN');
    expect(out.awayTeamCode).toBe('HLE');
    expect(out.bestOf).toBe(3);
    expect(out.stabilityWindowMin).toBe(10);
    expect(out.field).toBe('home_win');
  });

  it('uppercases team codes from the criteria text', () => {
    const text = VALID_CRITERIA_TEXT
      .replace('HomeTeamCode: GEN', 'HomeTeamCode: gen')
      .replace('AwayTeamCode: HLE', 'AwayTeamCode: hle');
    const out = parseEsportsCriteria(text);
    expect(out.homeTeamCode).toBe('GEN');
    expect(out.awayTeamCode).toBe('HLE');
  });

  it('honors StabilityWindowMin override', () => {
    const text = VALID_CRITERIA_TEXT + 'StabilityWindowMin: 30\n';
    const out = parseEsportsCriteria(text);
    expect(out.stabilityWindowMin).toBe(30);
  });

  it.each([
    ['MatchId too short', VALID_CRITERIA_TEXT.replace(MATCH_ID, '12345')],
    ['MatchId non-numeric', VALID_CRITERIA_TEXT.replace(MATCH_ID, '11554812896297186x')],
    ['TBD home code', VALID_CRITERIA_TEXT.replace('HomeTeamCode: GEN', 'HomeTeamCode: TBD')],
    ['same code twice', VALID_CRITERIA_TEXT.replace('AwayTeamCode: HLE', 'AwayTeamCode: GEN')],
    ['BestOf=2 invalid', VALID_CRITERIA_TEXT.replace('BestOf: 3', 'BestOf: 2')],
    ['unsupported field', VALID_CRITERIA_TEXT.replace('Field: home_win', 'Field: map_winner')],
    ['unsupported league', VALID_CRITERIA_TEXT.replace('League: LCK', 'League: LEC')],
    ['StabilityWindowMin out of range', VALID_CRITERIA_TEXT + 'StabilityWindowMin: 120\n'],
  ])('rejects %s', (_label, text) => {
    expect(() => parseEsportsCriteria(text)).toThrow(EsportsParseError);
  });
});

describe('resolveEsports', () => {
  beforeEach(() => {
    _clearEsportsCaches();
    vi.restoreAllMocks();
    vi.useRealTimers();
    delete process.env.ESPORTS_RESOLVER_DISABLED;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('honors ESPORTS_RESOLVER_DISABLED kill switch without touching network', async () => {
    process.env.ESPORTS_RESOLVER_DISABLED = 'true';
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const out = await resolveEsports(BASE_CRITERIA, Date.now());
    expect(out.state).toBe('pending');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('pending when state=unstarted', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(schedulePayload([makeEvent({ state: 'unstarted', teams: [
        { code: 'GEN' }, { code: 'HLE' },
      ] })])),
    );
    const out = await resolveEsports(BASE_CRITERIA, Date.now());
    expect(out.state).toBe('pending');
    if (out.state === 'pending') expect(out.reason).toMatch(/state=unstarted/);
  });

  it('pending when state=inProgress', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(schedulePayload([makeEvent({
        state: 'inProgress',
        teams: [
          { code: 'GEN', gameWins: 1, outcome: null },
          { code: 'HLE', gameWins: 0, outcome: null },
        ],
      })])),
    );
    const out = await resolveEsports(BASE_CRITERIA, Date.now());
    expect(out.state).toBe('pending');
    if (out.state === 'pending') expect(out.reason).toMatch(/state=inProgress/);
  });

  it('pending when match.flags carries an unknown (non-benign) marker', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(schedulePayload([makeEvent({
        state: 'completed',
        flags: ['forfeit'], // not on the BENIGN_FLAGS allowlist
        teams: [
          { code: 'GEN', gameWins: 2, outcome: 'win' },
          { code: 'HLE', gameWins: 0, outcome: 'loss' },
        ],
      })])),
    );
    const out = await resolveEsports(BASE_CRITERIA, Date.now());
    expect(out.state).toBe('pending');
    if (out.state === 'pending') expect(out.reason).toMatch(/unknown flags=forfeit/);
  });

  it('resolves through the benign hasVod flag (lolesports stamps every normal completion with it)', async () => {
    const payload = schedulePayload([makeEvent({
      state: 'completed',
      flags: ['hasVod'],
      teams: [
        { code: 'GEN', gameWins: 2, outcome: 'win' },
        { code: 'HLE', gameWins: 0, outcome: 'loss' },
      ],
    })]);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(payload));

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-27T10:00:00Z'));
    await resolveEsports(BASE_CRITERIA, Date.now()); // arms stability window
    vi.setSystemTime(new Date('2026-05-27T10:11:00Z'));
    _clearEsportsScheduleCache();

    const out = await resolveEsports(BASE_CRITERIA, Date.now());
    expect(out.state).toBe('resolved');
    if (out.state === 'resolved') expect(out.outcome).toBe(true);
  });

  it('pending when one flag is benign but another is unknown (mixed)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(schedulePayload([makeEvent({
        state: 'completed',
        flags: ['hasVod', 'forfeit'],
        teams: [
          { code: 'GEN', gameWins: 2, outcome: 'win' },
          { code: 'HLE', gameWins: 0, outcome: 'loss' },
        ],
      })])),
    );
    const out = await resolveEsports(BASE_CRITERIA, Date.now());
    expect(out.state).toBe('pending');
    if (out.state === 'pending') {
      expect(out.reason).toMatch(/unknown flags=forfeit/);
      expect(out.reason).toMatch(/all=hasVod,forfeit/);
    }
  });

  it('pending on the first completed observation (stability window), then resolves home_win after window elapses', async () => {
    const completed = schedulePayload([makeEvent({
      state: 'completed',
      teams: [
        { code: 'GEN', gameWins: 2, outcome: 'win' },
        { code: 'HLE', gameWins: 0, outcome: 'loss' },
      ],
    })]);

    // mockImplementation (not mockResolvedValue): each call must produce a
    // fresh Response, otherwise the second fetch reads an already-consumed body.
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(completed));

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-27T10:00:00Z'));

    const first = await resolveEsports(BASE_CRITERIA, Date.now());
    expect(first.state).toBe('pending');
    if (first.state === 'pending') expect(first.reason).toMatch(/stabilizing/);

    // Move past the 10-minute stability window. Also bypass the 60s schedule
    // recentCache so the second resolve re-fetches the same payload.
    vi.setSystemTime(new Date('2026-05-27T10:11:00Z'));
    _clearEsportsScheduleCache();

    const second = await resolveEsports(BASE_CRITERIA, Date.now());
    expect(second.state).toBe('resolved');
    if (second.state === 'resolved') {
      expect(second.outcome).toBe(true);
      expect(second.evidence).toMatch(/GEN 2-0 HLE/);
    }

    // finalCache hit: a follow-up call must not refetch.
    const before = fetchMock.mock.calls.length;
    const third = await resolveEsports(BASE_CRITERIA, Date.now());
    expect(third.state).toBe('resolved');
    expect(fetchMock.mock.calls.length).toBe(before);
  });

  it('resolves to outcome=false when away team wins', async () => {
    const payload = schedulePayload([makeEvent({
      state: 'completed',
      teams: [
        { code: 'GEN', gameWins: 1, outcome: 'loss' },
        { code: 'HLE', gameWins: 2, outcome: 'win' },
      ],
    })]);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(payload));

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-27T10:00:00Z'));
    await resolveEsports(BASE_CRITERIA, Date.now()); // arms stability window
    vi.setSystemTime(new Date('2026-05-27T10:11:00Z'));
    _clearEsportsScheduleCache();

    const out = await resolveEsports(BASE_CRITERIA, Date.now());
    expect(out.state).toBe('resolved');
    if (out.state === 'resolved') {
      expect(out.outcome).toBe(false);
      expect(out.evidence).toMatch(/GEN 1-2 HLE/);
    }
  });

  it('throws EsportsParseError (hard error) when criteria team code is missing from the schedule (rebrand/lookup miss)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(schedulePayload([makeEvent({
        state: 'completed',
        teams: [
          { code: 'DK', gameWins: 2, outcome: 'win' },
          { code: 'HLE', gameWins: 0, outcome: 'loss' },
        ],
      })])),
    );
    await expect(resolveEsports(BASE_CRITERIA, Date.now())).rejects.toBeInstanceOf(EsportsParseError);
  });

  it('pending when gameWins majority cross-check fails (anomaly)', async () => {
    const payload = schedulePayload([makeEvent({
      state: 'completed',
      teams: [
        { code: 'GEN', gameWins: 0, outcome: 'win' },
        { code: 'HLE', gameWins: 0, outcome: 'loss' },
      ],
    })]);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse(payload));

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-27T10:00:00Z'));
    await resolveEsports(BASE_CRITERIA, Date.now());
    vi.setSystemTime(new Date('2026-05-27T10:11:00Z'));
    _clearEsportsScheduleCache();

    const out = await resolveEsports(BASE_CRITERIA, Date.now());
    expect(out.state).toBe('pending');
    if (out.state === 'pending') expect(out.reason).toMatch(/majority mismatch/);
  });

  it('pending when match not in schedule', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(schedulePayload([makeEvent({
        matchId: '999999999999999999',
        state: 'completed',
        teams: [
          { code: 'GEN', gameWins: 2, outcome: 'win' },
          { code: 'HLE', gameWins: 0, outcome: 'loss' },
        ],
      })])),
    );
    const out = await resolveEsports(BASE_CRITERIA, Date.now());
    expect(out.state).toBe('pending');
    if (out.state === 'pending') expect(out.reason).toMatch(/not in schedule/);
  });

  it('pending with backoff message on HTTP 429', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, 429));
    const out = await resolveEsports(BASE_CRITERIA, Date.now());
    expect(out.state).toBe('pending');
    if (out.state === 'pending') expect(out.reason).toMatch(/HTTP 429/);
  });

  it('pending when teams still TBD', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(schedulePayload([makeEvent({
        state: 'completed',
        teams: [
          { code: 'TBD', gameWins: 0, outcome: null },
          { code: 'TBD', gameWins: 0, outcome: null },
        ],
      })])),
    );
    const out = await resolveEsports(BASE_CRITERIA, Date.now());
    expect(out.state).toBe('pending');
  });
});

