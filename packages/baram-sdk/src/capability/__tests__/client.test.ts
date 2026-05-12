import { describe, expect, it } from 'vitest';

import { checkActionAllowed, checkPaymentAllowed, preflight } from '../client';
import type { Capability } from '../types';

function makeCap(overrides: Partial<Capability> = {}): Capability {
  return {
    id: '0x01',
    owner: '0xabc',
    version: 1n,
    pauseMode: 'active',
    revoked: false,
    allowedActions: ['trade.swap.v1', 'noop.v1'],
    allowedAssets: ['0xabc::nusdc::NUSDC'],
    allowedTargets: ['0xdef'],
    riskLimits: {
      maxNotionalPerAction: 100n,
      maxDailyLoss: 1000n,
      maxSlippageBps: 100,
      stopLossBps: 200,
      takeProfitBps: 500,
    },
    ...overrides,
  };
}

describe('Capability client preflight', () => {
  it('checkActionAllowed returns true for allowed, false for unknown', () => {
    const cap = makeCap();
    expect(checkActionAllowed(cap, 'trade.swap.v1')).toBe(true);
    expect(checkActionAllowed(cap, 'analysis.v1')).toBe(false);
  });

  it('checkPaymentAllowed at boundary and above', () => {
    const cap = makeCap();
    expect(checkPaymentAllowed(cap, 100n)).toBe(true);  // equal
    expect(checkPaymentAllowed(cap, 99n)).toBe(true);   // below
    expect(checkPaymentAllowed(cap, 101n)).toBe(false); // above
  });

  it('preflight returns ok on all-pass', () => {
    const cap = makeCap();
    const res = preflight(cap, {
      actionType: 'trade.swap.v1',
      paymentAmount: 50n,
      receiptRequester: '0xabc',
      expectedVersion: 1n,
    });
    expect(res.ok).toBe(true);
  });

  it('preflight short-circuits on revoked first', () => {
    const cap = makeCap({ revoked: true, pauseMode: 'wake_blocked' });
    const res = preflight(cap, {
      actionType: 'trade.swap.v1',
      paymentAmount: 50n,
      receiptRequester: '0xabc',
      expectedVersion: 1n,
    });
    expect(res).toEqual({ ok: false, reason: 'revoked' });
  });

  it('preflight catches pause, owner mismatch, version, action, payment in order', () => {
    const base = {
      actionType: 'trade.swap.v1',
      paymentAmount: 50n,
      receiptRequester: '0xabc',
      expectedVersion: 1n,
    };
    expect(preflight(makeCap({ pauseMode: 'wake_blocked' }), base)).toEqual({
      ok: false,
      reason: 'paused',
    });
    expect(preflight(makeCap(), { ...base, receiptRequester: '0xother' })).toEqual({
      ok: false,
      reason: 'owner_mismatch',
    });
    expect(preflight(makeCap(), { ...base, expectedVersion: 99n })).toEqual({
      ok: false,
      reason: 'version_mismatch',
    });
    expect(preflight(makeCap(), { ...base, actionType: 'unknown.v1' })).toEqual({
      ok: false,
      reason: 'action_not_allowed',
    });
    expect(preflight(makeCap(), { ...base, paymentAmount: 999n })).toEqual({
      ok: false,
      reason: 'payment_exceeds_notional_cap',
    });
  });
});
