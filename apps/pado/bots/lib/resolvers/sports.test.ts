/**
 * Tests for sports resolver (TheSportsDB lookupevent).
 *
 * Regression focus: finalCache must only accept genuinely-terminal events.
 * Pre-fix, an in-play snapshot with scores populated but strStatus="2H" was
 * promoted to finalCache and froze pending forever (2026-05-20 Freiburg-Aston
 * Villa incident, ~8h stall on `pending (status not final: 2H)`).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  parseSportsCriteria,
  resolveSports,
  _clearSportsCaches,
  type SportsCriteria,
} from './sports.js';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function event(opts: {
  intHomeScore: string | null;
  intAwayScore: string | null;
  strStatus: string | null;
}): unknown {
  return {
    events: [
      {
        idEvent: '2470620',
        strEvent: 'Freiburg vs Aston Villa',
        ...opts,
      },
    ],
  };
}

const CRITERIA: SportsCriteria = {
  provider: 'thesportsdb',
  eventId: '2470620',
  resolveAfter: Date.parse('2026-05-20T22:00:00Z'),
  field: 'home_win',
  tieBreak: false,
};

describe('parseSportsCriteria', () => {
  it('parses home_win criteria', () => {
    const out = parseSportsCriteria(
      'Kind: sports\nProvider: thesportsdb\nEventId: 2470620\nResolveAfter: 2026-05-20 22:00:00 UTC\nField: home_win\nTieBreak: NO\n',
    );
    expect(out.eventId).toBe('2470620');
    expect(out.field).toBe('home_win');
    expect(out.tieBreak).toBe(false);
  });
});

describe('resolveSports finalCache invariant', () => {
  beforeEach(() => {
    _clearSportsCaches();
    vi.restoreAllMocks();
  });

  it('does not freeze in-play snapshot when strStatus="2H" but scores populated', async () => {
    // First call: in-play with scores already set (the bug trigger).
    const inPlay = event({ intHomeScore: '0', intAwayScore: '3', strStatus: '2H' });
    // Second call: final whistle.
    const final = event({ intHomeScore: '0', intAwayScore: '3', strStatus: 'Match Finished' });

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(inPlay))
      .mockResolvedValueOnce(jsonResponse(final));

    const first = await resolveSports(CRITERIA, Date.now());
    expect(first.state).toBe('pending');

    // Bypass the 60s recentCache TTL so the next call refetches.
    _clearSportsCaches();

    const second = await resolveSports(CRITERIA, Date.now());
    expect(second.state).toBe('resolved');
    if (second.state === 'resolved') {
      expect(second.outcome).toBe(false); // home(0) > away(3) is false
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caches a genuinely-final event and skips the second fetch', async () => {
    const final = event({ intHomeScore: '2', intAwayScore: '1', strStatus: 'Match Finished' });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(final));

    const first = await resolveSports(CRITERIA, Date.now());
    expect(first.state).toBe('resolved');
    const second = await resolveSports(CRITERIA, Date.now());
    expect(second.state).toBe('resolved');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['1H'], ['2H'], ['HT'], ['ET'], ['Live'], ['In Play'],
  ])('treats strStatus=%s with scores as pending, not terminal', async (status) => {
    const inPlay = event({ intHomeScore: '1', intAwayScore: '0', strStatus: status });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(inPlay));
    const out = await resolveSports(CRITERIA, Date.now());
    expect(out.state).toBe('pending');
  });

  it('keeps void statuses pending so cancel_expired_market can fire after deadline', async () => {
    const postponed = event({ intHomeScore: null, intAwayScore: null, strStatus: 'Postponed' });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(postponed));
    const out = await resolveSports(CRITERIA, Date.now());
    expect(out.state).toBe('pending');
  });
});
