/**
 * Phase 6 (2026-05-23) — reconcile decision function coverage.
 *
 * `decideReconcileAction` is the pure brain of the orchestrator-side
 * enabled-gate. Given a snapshot of {vault, enabled, pm2 list}, it
 * decides whether to spawn, stop, or no-op. Side-effecting parts
 * (pm2 exec, SQLite reads) are exercised end-to-end on staging.
 */

import { describe, it, expect } from 'vitest';
import { decideReconcileAction } from '../agent-orchestrator.js';

const NAME = 'nasun-ai-agent-deadbeef';

describe('decideReconcileAction', () => {
  it('no_vault when vault row is missing', () => {
    const r = decideReconcileAction({
      hasVaultRow: false,
      enabled: true,
      pm2NameKnown: null,
      pm2NamesInList: new Set(),
    });
    expect(r.action).toBe('no_vault');
  });

  it('no_vault when pm2NameKnown is null even if hasVaultRow flag set', () => {
    // Defensive: both null + true would be a programming error from caller
    // (vault row exists but name not derived), but we should still no-op.
    const r = decideReconcileAction({
      hasVaultRow: true,
      enabled: true,
      pm2NameKnown: null,
      pm2NamesInList: new Set(),
    });
    expect(r.action).toBe('no_vault');
  });

  it('spawn when enabled=true and pm2 absent', () => {
    const r = decideReconcileAction({
      hasVaultRow: true,
      enabled: true,
      pm2NameKnown: NAME,
      pm2NamesInList: new Set(['some-other-process']),
    });
    expect(r.action).toBe('spawn');
    expect(r.reason).toContain('enabled_true_pm2_absent');
  });

  it('noop when enabled=true and pm2 already running', () => {
    const r = decideReconcileAction({
      hasVaultRow: true,
      enabled: true,
      pm2NameKnown: NAME,
      pm2NamesInList: new Set([NAME, 'other']),
    });
    expect(r.action).toBe('noop');
    expect(r.reason).toContain('enabled_true_pm2_running');
  });

  it('stop when enabled=false and pm2 running', () => {
    const r = decideReconcileAction({
      hasVaultRow: true,
      enabled: false,
      pm2NameKnown: NAME,
      pm2NamesInList: new Set([NAME]),
    });
    expect(r.action).toBe('stop');
    expect(r.reason).toContain('enabled_false_pm2_running');
  });

  it('noop when enabled=false and pm2 already absent', () => {
    const r = decideReconcileAction({
      hasVaultRow: true,
      enabled: false,
      pm2NameKnown: NAME,
      pm2NamesInList: new Set(['other']),
    });
    expect(r.action).toBe('noop');
    expect(r.reason).toContain('enabled_false_pm2_absent');
  });

  it('exact name match required (no prefix collisions)', () => {
    // pm2 list contains a NAME-like-but-different process; we must NOT
    // assume it is "our" agent.
    const r = decideReconcileAction({
      hasVaultRow: true,
      enabled: true,
      pm2NameKnown: NAME,
      pm2NamesInList: new Set([NAME + '-suffix']),
    });
    expect(r.action).toBe('spawn');
  });
});
