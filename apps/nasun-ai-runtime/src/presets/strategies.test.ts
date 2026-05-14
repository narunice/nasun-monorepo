import { describe, it, expect } from 'vitest';

import {
  listStrategyPresets,
  resolveStrategyPreset,
} from './strategies.js';

describe('strategy presets', () => {
  it('lists all canonical preset ids', () => {
    const ids = listStrategyPresets().map((p) => p.id).sort();
    expect(ids).toEqual([
      'aggressive_scalper',
      'conservative_dca',
      'hold_only',
      'mean_reversion',
      'trend_follower',
    ]);
  });

  it('every preset systemPrompt is byte-stable (no Date.now / random / per-cycle data)', () => {
    // Hash twice; identical hashes confirm the prompt is deterministic.
    // We don't import sha256 here — string equality is sufficient and cheaper.
    for (const p of listStrategyPresets()) {
      const a = p.systemPrompt;
      const b = p.systemPrompt;
      expect(a).toBe(b);
      // No timestamps, ISO strings, or "now" tokens leak in.
      expect(a).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(a.toLowerCase()).not.toContain('date.now');
    }
  });

  it('resolves canonical id', () => {
    expect(resolveStrategyPreset('mean_reversion').id).toBe('mean_reversion');
    expect(resolveStrategyPreset('  HOLD_ONLY  ').id).toBe('hold_only');
  });

  it('aliases C1 placeholder names to canonical presets', () => {
    expect(resolveStrategyPreset('momentum').id).toBe('trend_follower');
    expect(resolveStrategyPreset('mean_revert').id).toBe('mean_reversion');
    expect(resolveStrategyPreset('range_bound').id).toBe('mean_reversion');
  });

  it('falls back to conservative_dca on missing/unknown', () => {
    expect(resolveStrategyPreset(undefined).id).toBe('conservative_dca');
    expect(resolveStrategyPreset('').id).toBe('conservative_dca');
    expect(resolveStrategyPreset('definitely_not_a_preset').id).toBe(
      'conservative_dca',
    );
  });
});
