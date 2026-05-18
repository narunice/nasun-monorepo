import { describe, expect, it } from 'vitest';
import { isWhalePayload, type FeedNotifyPayload } from './notify-feed.js';

function payload(overrides: Partial<FeedNotifyPayload> = {}): FeedNotifyPayload {
  return {
    kind: 'round',
    game_id: 1,
    player: '0xabc',
    bet_amount: '0',
    payout: '0',
    multiplier_bps: '0',
    tx_digest: 'tx',
    event_seq: 0,
    ts: Date.now(),
    ...overrides,
  };
}

describe('isWhalePayload', () => {
  it('always returns false for ticket_bought regardless of bet size', () => {
    // Lottery ticket purchases are unresolved at emit time and must never
    // surface in the whales topic. Guard at the classifier so a stray call
    // site (or future emit path) cannot leak ticket_bought into whales.
    expect(
      isWhalePayload(
        payload({
          kind: 'ticket_bought',
          bet_amount: '999999999999',
          payout: null,
        }),
      ),
    ).toBe(false);
  });

  it('flags whale when bet meets the default threshold', () => {
    // Default WHALE_BET_THRESHOLD_RAW = 100_000_000 (see env.ts).
    expect(isWhalePayload(payload({ bet_amount: '100000000' }))).toBe(true);
    expect(isWhalePayload(payload({ bet_amount: '999999999' }))).toBe(true);
  });

  it('flags whale by payout threshold even when bet is small', () => {
    // Default WHALE_PAYOUT_THRESHOLD_RAW = 500_000_000.
    expect(
      isWhalePayload(
        payload({
          bet_amount: '1',
          payout: '500000000',
        }),
      ),
    ).toBe(true);
  });

  it('returns false when both bet and payout are below threshold', () => {
    expect(
      isWhalePayload(
        payload({
          bet_amount: '99999999',
          payout: '499999999',
        }),
      ),
    ).toBe(false);
  });

  it('returns false for malformed bet_amount instead of throwing', () => {
    expect(isWhalePayload(payload({ bet_amount: 'not-a-number' }))).toBe(false);
  });

  it('treats payout=null as zero so a small-bet round is not classified whale', () => {
    expect(
      isWhalePayload(
        payload({
          kind: 'round',
          bet_amount: '1',
          payout: null,
        }),
      ),
    ).toBe(false);
  });
});
