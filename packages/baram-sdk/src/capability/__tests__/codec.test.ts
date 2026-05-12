import { describe, expect, it } from 'vitest';

import {
  CapabilityBcs,
  decodeCapability,
  mutationKindFromTag,
  mutationKindToTag,
  pauseModeFromTag,
  pauseModeToTag,
} from '../codec';
import type { Capability } from '../types';

function makeRaw(): Parameters<typeof CapabilityBcs.serialize>[0] {
  return {
    id: '0x0000000000000000000000000000000000000000000000000000000000000001',
    owner: '0x0000000000000000000000000000000000000000000000000000000000000abc',
    version: '1',
    pause_mode: 0,
    revoked: false,
    allowed_actions: ['trade.swap.v1', 'noop.v1'],
    allowed_assets: [
      { name: '0xabc::nusdc::NUSDC' },
      { name: '0xabc::nbtc::NBTC' },
    ],
    allowed_targets: [
      '0x0000000000000000000000000000000000000000000000000000000000000def',
    ],
    risk_limits: {
      max_notional_per_action: '100000000',
      max_daily_loss: '1000000000',
      max_slippage_bps: 100,
      stop_loss_bps: 200,
      take_profit_bps: 500,
    },
  };
}

describe('Capability codec', () => {
  it('round-trips a canonical Capability', () => {
    const raw = makeRaw();
    const bytes = CapabilityBcs.serialize(raw).toBytes();
    const decoded: Capability = decodeCapability(bytes);

    expect(decoded.id).toEqual(raw.id);
    expect(decoded.owner).toEqual(raw.owner);
    expect(decoded.version).toBe(1n);
    expect(decoded.pauseMode).toBe('active');
    expect(decoded.revoked).toBe(false);
    expect(decoded.allowedActions).toEqual(['trade.swap.v1', 'noop.v1']);
    expect(decoded.allowedAssets).toEqual(['0xabc::nusdc::NUSDC', '0xabc::nbtc::NBTC']);
    expect(decoded.allowedTargets.length).toBe(1);
    expect(decoded.riskLimits.maxNotionalPerAction).toBe(100_000_000n);
    expect(decoded.riskLimits.maxSlippageBps).toBe(100);
  });

  it('surfaces phase 2 pause modes (1, 3) faithfully when they appear on-chain', () => {
    // Phase 1 contract rejects setting modes 1 and 3 via E_PAUSE_MODE_NOT_SUPPORTED.
    // If a future protocol upgrade lands them on-chain, the SDK must surface
    // them rather than masking to 'unknown'. Test by serializing raw bytes.
    for (const tag of [1, 3] as const) {
      const raw = makeRaw();
      raw.pause_mode = tag;
      const bytes = CapabilityBcs.serialize(raw).toBytes();
      const decoded = decodeCapability(bytes);
      expect(decoded.pauseMode).toBe(tag === 1 ? 'execution_only' : 'full_suspend');
    }
  });

  it('surfaces unknown pause_mode integer as "unknown" (forward-compat)', () => {
    const raw = makeRaw();
    raw.pause_mode = 99;
    const bytes = CapabilityBcs.serialize(raw).toBytes();
    const decoded = decodeCapability(bytes);
    expect(decoded.pauseMode).toBe('unknown');
  });

  it('pauseModeToTag rejects "unknown"', () => {
    expect(() => pauseModeToTag('unknown')).toThrow(/Cannot encode "unknown" pause_mode/);
  });

  it('pauseModeFromTag matches PAUSE_MODE_TAG inverse', () => {
    expect(pauseModeFromTag(0)).toBe('active');
    expect(pauseModeFromTag(1)).toBe('execution_only');
    expect(pauseModeFromTag(2)).toBe('wake_blocked');
    expect(pauseModeFromTag(3)).toBe('full_suspend');
    expect(pauseModeFromTag(7)).toBe('unknown');
  });

  it('mutationKindFromTag / toTag round-trip the 5 kinds', () => {
    const kinds = ['pause', 'risk', 'actions', 'assets', 'targets'] as const;
    for (const k of kinds) {
      expect(mutationKindFromTag(mutationKindToTag(k))).toBe(k);
    }
    expect(mutationKindFromTag(99)).toBe('unknown');
    expect(() => mutationKindToTag('unknown')).toThrow(/Cannot encode "unknown" mutation_kind/);
  });
});
