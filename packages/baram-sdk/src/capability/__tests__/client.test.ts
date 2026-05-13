import { describe, expect, it, vi } from 'vitest';

import { CapabilityBcs } from '../codec';
import { checkActionAllowed, checkPaymentAllowed, fetchCapability, preflight } from '../client';
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
    escrowId: null,
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

  it('fetchCapability returns cap body + initialSharedVersion from Shared owner', async () => {
    const capBytes = CapabilityBcs.serialize({
      id: '0x0000000000000000000000000000000000000000000000000000000000000001',
      owner: '0x0000000000000000000000000000000000000000000000000000000000000abc',
      version: 7n,
      pause_mode: 0,
      revoked: false,
      allowed_actions: ['trade.swap.v1'],
      allowed_assets: [{ name: 'pkg::nusdc::NUSDC' }],
      allowed_targets: ['0x0000000000000000000000000000000000000000000000000000000000000def'],
      risk_limits: {
        max_notional_per_action: 100n,
        max_daily_loss: 1000n,
        max_slippage_bps: 100,
        stop_loss_bps: 200,
        take_profit_bps: 500,
      },
      escrow_id: null,
    }).toBase64();
    const getObject = vi.fn().mockResolvedValue({
      data: {
        type: '0xdeadbeef::capability::Capability',
        bcs: { dataType: 'moveObject', bcsBytes: capBytes },
        owner: { Shared: { initial_shared_version: 42 } },
      },
    });
    const client = { getObject } as unknown as Parameters<typeof fetchCapability>[0];
    const ref = await fetchCapability(client, '0x01');
    expect(ref.objectId).toBe('0x01');
    expect(ref.initialSharedVersion).toBe(42n);
    expect(ref.cap.version).toBe(7n);
    expect(ref.cap.owner).toBe('0x0000000000000000000000000000000000000000000000000000000000000abc');
  });

  it('fetchCapability rejects non-Shared owners', async () => {
    const getObject = vi.fn().mockResolvedValue({
      data: {
        type: '0xdeadbeef::capability::Capability',
        bcs: { dataType: 'moveObject', bcsBytes: 'AA==' },
        owner: { AddressOwner: '0xabc' },
      },
    });
    const client = { getObject } as unknown as Parameters<typeof fetchCapability>[0];
    await expect(fetchCapability(client, '0x01')).rejects.toThrow(/not a Shared object/);
  });

  it('fetchCapability rejects an object whose Move type is not ::capability::Capability', async () => {
    const getObject = vi.fn().mockResolvedValue({
      data: {
        type: '0xdeadbeef::other_module::Imposter',
        bcs: { dataType: 'moveObject', bcsBytes: 'AA==' },
        owner: { Shared: { initial_shared_version: 1 } },
      },
    });
    const client = { getObject } as unknown as Parameters<typeof fetchCapability>[0];
    await expect(fetchCapability(client, '0x01')).rejects.toThrow(/unexpected type/);
  });

  it('fetchCapability rejects when expectedPackageId disagrees with on-chain type', async () => {
    const capBytes = CapabilityBcs.serialize({
      id: '0x0000000000000000000000000000000000000000000000000000000000000001',
      owner: '0x0000000000000000000000000000000000000000000000000000000000000abc',
      version: 1n,
      pause_mode: 0,
      revoked: false,
      allowed_actions: ['trade.swap.v1'],
      allowed_assets: [],
      allowed_targets: [],
      risk_limits: {
        max_notional_per_action: 1n,
        max_daily_loss: 1n,
        max_slippage_bps: 1,
        stop_loss_bps: 1,
        take_profit_bps: 1,
      },
      escrow_id: null,
    }).toBase64();
    const getObject = vi.fn().mockResolvedValue({
      data: {
        type: '0xrotated_pkg::capability::Capability',
        bcs: { dataType: 'moveObject', bcsBytes: capBytes },
        owner: { Shared: { initial_shared_version: 1 } },
      },
    });
    const client = { getObject } as unknown as Parameters<typeof fetchCapability>[0];
    await expect(
      fetchCapability(client, '0x01', { expectedPackageId: '0xexpected_pkg' }),
    ).rejects.toThrow(/does not match expected/);
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
