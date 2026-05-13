import { describe, expect, it } from 'vitest';

import { summarizeMutation } from '../summarize';
import type { RiskLimits } from '../types';

function baseRisk(overrides: Partial<RiskLimits> = {}): RiskLimits {
  return {
    maxNotionalPerAction: 100n,
    maxDailyLoss: 1000n,
    maxSlippageBps: 100,
    stopLossBps: 200,
    takeProfitBps: 500,
    ...overrides,
  };
}

describe('Capability mutation summaries', () => {
  it('set_pause_mode w/ previous', () => {
    expect(
      summarizeMutation({
        kind: 'set_pause_mode',
        newMode: 'wake_blocked',
        previousMode: 'active',
      }),
    ).toBe('Set pause mode: WAKE_BLOCKED (was ACTIVE)');
  });

  it('set_pause_mode w/o previous', () => {
    expect(
      summarizeMutation({ kind: 'set_pause_mode', newMode: 'wake_blocked' }),
    ).toBe('Set pause mode: WAKE_BLOCKED');
  });

  it('update_risk_limits diff highlights changed fields only', () => {
    const prev = baseRisk();
    const next = baseRisk({ maxNotionalPerAction: 50n, maxSlippageBps: 50 });
    const summary = summarizeMutation({
      kind: 'update_risk_limits',
      newLimits: next,
      previousLimits: prev,
    });
    expect(summary).toContain('max_notional 100 -> 50');
    expect(summary).toContain('slippage 100 -> 50bps');
    expect(summary).not.toContain('stop_loss');
    expect(summary).not.toContain('take_profit');
  });

  it('update_risk_limits with identical values is a no-op', () => {
    const r = baseRisk();
    expect(
      summarizeMutation({ kind: 'update_risk_limits', newLimits: r, previousLimits: r }),
    ).toBe('Risk limits change: no-op (identical values)');
  });

  it('update_risk_limits w/o previous prints full', () => {
    const r = baseRisk();
    expect(summarizeMutation({ kind: 'update_risk_limits', newLimits: r })).toContain(
      'max_notional=100',
    );
  });

  it('replace_allowed_actions diff shows added/removed', () => {
    const summary = summarizeMutation({
      kind: 'replace_allowed_actions',
      newActions: ['trade.swap.v1', 'analysis.v1'],
      previousActions: ['trade.swap.v1', 'noop.v1'],
    });
    expect(summary).toContain('+1 (analysis.v1)');
    expect(summary).toContain('-1 (noop.v1)');
  });

  it('replace_allowed_actions identical set is a no-op', () => {
    expect(
      summarizeMutation({
        kind: 'replace_allowed_actions',
        newActions: ['a.v1', 'b.v1'],
        previousActions: ['b.v1', 'a.v1'],
      }),
    ).toBe('Allowed actions change: no-op (same set)');
  });

  it('replace_allowed_actions w/o previous trims long lists', () => {
    const summary = summarizeMutation({
      kind: 'replace_allowed_actions',
      newActions: ['a.v1', 'b.v1', 'c.v1', 'd.v1', 'e.v1'],
    });
    expect(summary).toBe('Set allowed actions to [a.v1, b.v1, c.v1 (+2 more)]');
  });

  it('revoke is deterministic and terminal-flagged', () => {
    expect(summarizeMutation({ kind: 'revoke' })).toBe(
      'Revoke capability (terminal). Agent execution will halt.',
    );
  });

  it('set_escrow link emits "Link escrow" with truncated id', () => {
    const summary = summarizeMutation({
      kind: 'set_escrow',
      newEscrowId: '0x00000000000000000000000000000000000000000000000000000000feedbeef',
    });
    expect(summary).toContain('Link escrow');
    expect(summary).toContain('...beef');
  });

  it('set_escrow unlink to null emits "Unlink escrow"', () => {
    expect(
      summarizeMutation({ kind: 'set_escrow', newEscrowId: null }),
    ).toContain('Unlink escrow');
  });

  it('set_escrow rebind shows old -> new', () => {
    const summary = summarizeMutation({
      kind: 'set_escrow',
      previousEscrowId: '0x00000000000000000000000000000000000000000000000000000000aaaaaaaa',
      newEscrowId: '0x00000000000000000000000000000000000000000000000000000000bbbbbbbb',
    });
    expect(summary).toContain('Rebind escrow');
    expect(summary).toMatch(/aaaaaaaa|...aaaa/);
    expect(summary).toMatch(/bbbbbbbb|...bbbb/);
  });

  it('set_escrow no-op when same id', () => {
    const id = '0x00000000000000000000000000000000000000000000000000000000aaaaaaaa';
    expect(
      summarizeMutation({ kind: 'set_escrow', newEscrowId: id, previousEscrowId: id }),
    ).toContain('no-op');
  });

  it('determinism: identical args -> identical output', () => {
    const args = {
      kind: 'update_risk_limits' as const,
      newLimits: baseRisk({ maxNotionalPerAction: 50n }),
      previousLimits: baseRisk(),
    };
    expect(summarizeMutation(args)).toBe(summarizeMutation(args));
  });
});
