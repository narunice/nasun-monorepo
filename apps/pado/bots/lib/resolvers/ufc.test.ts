/**
 * Tests for UFC resolver (ESPN core API).
 *
 * Mocks global fetch. Two-call shape: competition resource then status $ref.
 * Covers: criteria parser, terminal resolve, NC/Draw, mismatched athletes,
 * non-final lifecycle, and basic caching.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  parseUfcCriteria,
  resolveUfc,
  _clearUfcCaches,
  UfcParseError,
  type UfcCriteria,
} from './ufc.js';

const STATUS_REF = 'http://sports.core.api.espn.com/v2/sports/mma/leagues/ufc/events/600057024/competitions/401848704/status?lang=en&region=us';
const ATHLETE_A_REF = 'http://sports.core.api.espn.com/v2/sports/mma/athletes/4408375?lang=en&region=us';
const ATHLETE_B_REF = 'http://sports.core.api.espn.com/v2/sports/mma/athletes/5290957?lang=en&region=us';

function jsonResponse(body: unknown, init: ResponseInit = { status: 200 }): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json' },
  });
}

function competitionBody(opts: { winnerA: boolean; winnerB: boolean }): unknown {
  return {
    status: { $ref: STATUS_REF },
    competitors: [
      { order: 1, winner: opts.winnerA, athlete: { $ref: ATHLETE_A_REF } },
      { order: 2, winner: opts.winnerB, athlete: { $ref: ATHLETE_B_REF } },
    ],
  };
}

function statusBody(state: 'pre' | 'in' | 'post', completed: boolean): unknown {
  return { type: { state, completed, description: completed ? 'Final' : 'Scheduled' } };
}

function makeCriteria(overrides: Partial<UfcCriteria> = {}): UfcCriteria {
  return {
    provider: 'espn',
    eventId: '600057024',
    competitionId: '401848704',
    athleteAId: '4408375',
    athleteBId: '5290957',
    fighterA: 'Adam Fugitt',
    fighterB: 'Ty Miller',
    resolveAfter: Date.UTC(2026, 0, 24, 23, 30, 0),
    field: 'fighter_a_wins',
    ...overrides,
  };
}

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  _clearUfcCaches();
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchSpy.mockRestore();
});

describe('parseUfcCriteria', () => {
  const VALID = `Kind: ufc
Provider: espn
EventId: 600057024
CompetitionId: 401848704
FighterA: Adam Fugitt
FighterB: Ty Miller
AthleteAId: 4408375
AthleteBId: 5290957
Field: fighter_a_wins
ResolveAfter: 2026-01-24 23:30:00 UTC`;

  it('parses a valid criteria block', () => {
    const c = parseUfcCriteria(VALID);
    expect(c.provider).toBe('espn');
    expect(c.eventId).toBe('600057024');
    expect(c.competitionId).toBe('401848704');
    expect(c.athleteAId).toBe('4408375');
    expect(c.athleteBId).toBe('5290957');
    expect(c.fighterA).toBe('Adam Fugitt');
    expect(c.fighterB).toBe('Ty Miller');
    expect(c.field).toBe('fighter_a_wins');
    expect(c.resolveAfter).toBe(Date.UTC(2026, 0, 24, 23, 30, 0));
  });

  it('rejects non-espn Provider', () => {
    expect(() => parseUfcCriteria(VALID.replace('Provider: espn', 'Provider: tapology')))
      .toThrow(UfcParseError);
  });

  it('rejects bad EventId', () => {
    expect(() => parseUfcCriteria(VALID.replace('EventId: 600057024', 'EventId: abc')))
      .toThrow(UfcParseError);
  });

  it('rejects equal AthleteAId and AthleteBId', () => {
    expect(() => parseUfcCriteria(VALID.replace('AthleteBId: 5290957', 'AthleteBId: 4408375')))
      .toThrow(UfcParseError);
  });

  it('rejects unsupported Field', () => {
    expect(() => parseUfcCriteria(VALID.replace('Field: fighter_a_wins', 'Field: ko_round_1')))
      .toThrow(UfcParseError);
  });

  it('rejects malformed ResolveAfter', () => {
    expect(() => parseUfcCriteria(VALID.replace('2026-01-24 23:30:00 UTC', '2026-01-24T23:30:00Z')))
      .toThrow(UfcParseError);
  });
});

describe('resolveUfc', () => {
  it('resolves YES when AthleteA wins', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(competitionBody({ winnerA: true, winnerB: false })))
      .mockResolvedValueOnce(jsonResponse(statusBody('post', true)));
    const result = await resolveUfc(makeCriteria(), Date.now());
    expect(result.state).toBe('resolved');
    if (result.state === 'resolved') {
      expect(result.outcome).toBe(true);
      expect(result.evidence).toContain('winner=4408375');
      expect(result.evidence).toContain('Adam Fugitt');
    }
  });

  it('resolves NO when AthleteB wins', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(competitionBody({ winnerA: false, winnerB: true })))
      .mockResolvedValueOnce(jsonResponse(statusBody('post', true)));
    const result = await resolveUfc(makeCriteria(), Date.now());
    expect(result.state).toBe('resolved');
    if (result.state === 'resolved') {
      expect(result.outcome).toBe(false);
      expect(result.evidence).toContain('winner=5290957');
      expect(result.evidence).toContain('Ty Miller');
    }
  });

  it('returns pending for scheduled fight (state=pre)', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(competitionBody({ winnerA: false, winnerB: false })))
      .mockResolvedValueOnce(jsonResponse(statusBody('pre', false)));
    const result = await resolveUfc(makeCriteria(), Date.now());
    expect(result.state).toBe('pending');
    if (result.state === 'pending') {
      expect(result.reason).toContain('state=pre');
    }
  });

  it('returns pending for in-progress fight (state=in)', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(competitionBody({ winnerA: false, winnerB: false })))
      .mockResolvedValueOnce(jsonResponse(statusBody('in', false)));
    const result = await resolveUfc(makeCriteria(), Date.now());
    expect(result.state).toBe('pending');
    if (result.state === 'pending') {
      expect(result.reason).toContain('state=in');
    }
  });

  it('returns pending for No Contest / Draw (both winner=false at state=post)', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(competitionBody({ winnerA: false, winnerB: false })))
      .mockResolvedValueOnce(jsonResponse(statusBody('post', true)));
    const result = await resolveUfc(makeCriteria(), Date.now());
    expect(result.state).toBe('pending');
    if (result.state === 'pending') {
      expect(result.reason).toContain('NC/Draw');
    }
  });

  it('returns pending when declared athletes are absent', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(competitionBody({ winnerA: true, winnerB: false })))
      .mockResolvedValueOnce(jsonResponse(statusBody('post', true)));
    const result = await resolveUfc(
      makeCriteria({ athleteAId: '9999999', athleteBId: '8888888' }),
      Date.now(),
    );
    expect(result.state).toBe('pending');
    if (result.state === 'pending') {
      expect(result.reason).toContain('competitors mismatch');
    }
  });

  it('returns pending when ESPN returns HTTP error', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({}, { status: 503 }));
    const result = await resolveUfc(makeCriteria(), Date.now());
    expect(result.state).toBe('pending');
    if (result.state === 'pending') {
      expect(result.reason).toContain('HTTP 503');
    }
  });

  it('caches a final result so repeated resolves do not refetch', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse(competitionBody({ winnerA: true, winnerB: false })))
      .mockResolvedValueOnce(jsonResponse(statusBody('post', true)));
    const c = makeCriteria();
    const first = await resolveUfc(c, Date.now());
    const second = await resolveUfc(c, Date.now());
    expect(first.state).toBe('resolved');
    expect(second.state).toBe('resolved');
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('honours UFC_RESOLVER_DISABLED kill-switch', async () => {
    process.env.UFC_RESOLVER_DISABLED = 'true';
    try {
      const result = await resolveUfc(makeCriteria(), Date.now());
      expect(result.state).toBe('pending');
      if (result.state === 'pending') {
        expect(result.reason).toBe('UFC_RESOLVER_DISABLED');
      }
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      delete process.env.UFC_RESOLVER_DISABLED;
    }
  });
});
