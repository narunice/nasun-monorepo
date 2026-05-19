/**
 * Pure-function tests for the bankroll reconciler's shares math + ordering.
 * DB-bound paths (sql.begin, watermark gating, persistence) are exercised
 * by manual end-to-end verification per plan v3 §3.I.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import {
  applySharesDelta,
  eventTypePriority,
} from './bankroll-reconciler.js';
import {
  updateStreamWatermark,
  getBankrollWatermarkMs,
  PNL_STREAMS,
  _resetBankrollWatermarkForTests,
} from './bankroll-watermark.js';

describe('applySharesDelta', () => {
  it('credits liquidity_provided and shares_seeded; debits liquidity_redeemed', () => {
    expect(applySharesDelta(100n, 'liquidity_provided', 50n)).toBe(150n);
    expect(applySharesDelta(100n, 'shares_seeded', 25n)).toBe(125n);
    expect(applySharesDelta(100n, 'liquidity_redeemed', 30n)).toBe(70n);
  });

  it('carries forward shares for non-mutating event types', () => {
    // bet_refunded, treasury_deposited, withdraw_requested, cap_updated all
    // leave total_shares unchanged. The reconciler still snapshots the row
    // so historical queries land on a consistent total at every timestamp.
    expect(applySharesDelta(100n, 'bet_refunded', 50n)).toBe(100n);
    expect(applySharesDelta(100n, 'treasury_deposited', 1_000_000n)).toBe(100n);
    expect(applySharesDelta(100n, 'withdraw_requested', 50n)).toBe(100n);
    expect(applySharesDelta(100n, 'cap_updated', null)).toBe(100n);
  });

  it('accepts null shares as 0 delta', () => {
    expect(applySharesDelta(100n, 'liquidity_provided', null)).toBe(100n);
  });

  it('returns negative when a redeem exceeds current shares', () => {
    // Pure function does not clamp; reconciler caller logs warn and persists.
    expect(applySharesDelta(10n, 'liquidity_redeemed', 50n)).toBe(-40n);
  });

  it('handles unknown event_type by carrying forward', () => {
    expect(applySharesDelta(42n, 'mystery_event', 999n)).toBe(42n);
  });

  it('preserves u128 magnitude without precision loss', () => {
    // total_shares is NUMERIC(40,0); test that bigint math survives a value
    // beyond Number.MAX_SAFE_INTEGER (2^53 ≈ 9e15).
    const huge = 2_809_416_960_142n + 10n ** 18n;
    expect(applySharesDelta(huge, 'liquidity_provided', 1n)).toBe(huge + 1n);
  });
});

describe('eventTypePriority', () => {
  it('orders treasury_deposited before shares_seeded (bootstrap hazard fix)', () => {
    // Plan v3 §3.F: within the same timestamp_ms, treasury_deposited MUST
    // process before shares_seeded so the reconciler never persists a row
    // with `shares > 0` against a zero-balance pool state.
    expect(eventTypePriority('treasury_deposited')).toBeLessThan(
      eventTypePriority('shares_seeded'),
    );
  });

  it('assigns a unique priority to each known event type', () => {
    const known = [
      'treasury_deposited',
      'bet_refunded',
      'liquidity_provided',
      'liquidity_redeemed',
      'shares_seeded',
      'withdraw_requested',
      'cap_updated',
    ];
    const priorities = known.map(eventTypePriority);
    expect(new Set(priorities).size).toBe(known.length);
    for (const p of priorities) {
      expect(p).toBeLessThan(99);
    }
  });

  it('sinks unknown event_types to the bottom', () => {
    expect(eventTypePriority('totally_made_up')).toBe(99);
  });
});

describe('bankroll watermark (in-memory)', () => {
  beforeEach(() => {
    _resetBankrollWatermarkForTests();
  });

  it('returns 0n until every PnL stream has reported', () => {
    expect(getBankrollWatermarkMs()).toBe(0n);
    // Report all but one — still 0n.
    for (const s of PNL_STREAMS.slice(0, -1)) {
      updateStreamWatermark(s, 1_000n);
    }
    expect(getBankrollWatermarkMs()).toBe(0n);
  });

  it('returns the MIN across all PNL_STREAMS once each has reported', () => {
    let ts = 1_000n;
    for (const s of PNL_STREAMS) {
      updateStreamWatermark(s, ts);
      ts += 100n;
    }
    expect(getBankrollWatermarkMs()).toBe(1_000n);
  });

  it('ignores monotonic regressions', () => {
    for (const s of PNL_STREAMS) {
      updateStreamWatermark(s, 5_000n);
    }
    expect(getBankrollWatermarkMs()).toBe(5_000n);
    // Send an older timestamp to one stream.
    updateStreamWatermark(PNL_STREAMS[0]!, 100n);
    // Watermark unchanged — guard against regression.
    expect(getBankrollWatermarkMs()).toBe(5_000n);
  });

  it('a sparse stream heartbeat advances the watermark', () => {
    // Bootstrap state: every PnL stream emits at t=1000.
    for (const s of PNL_STREAMS) {
      updateStreamWatermark(s, 1_000n);
    }
    expect(getBankrollWatermarkMs()).toBe(1_000n);

    // Five streams advance to 2000 (real events). One sparse stream still
    // sits at 1000 (no events) but its empty-page heartbeat in _runner.ts
    // updates it to Date.now() each tick. Simulate the heartbeat:
    for (let i = 0; i < 5; i++) {
      updateStreamWatermark(PNL_STREAMS[i]!, 2_000n);
    }
    // Sparse stream still at 1000 — watermark is still 1000 (correct).
    expect(getBankrollWatermarkMs()).toBe(1_000n);

    // Sparse stream's heartbeat fires (simulated Date.now() = 2500).
    updateStreamWatermark(PNL_STREAMS[5]!, 2_500n);
    // Now watermark moves to MIN(2000, 2000, 2000, 2000, 2000, 2500) = 2000.
    expect(getBankrollWatermarkMs()).toBe(2_000n);
  });
});
