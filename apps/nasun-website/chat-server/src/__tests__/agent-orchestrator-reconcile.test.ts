/**
 * Phase 8 (2026-05-24) — deriveAgentState coverage.
 *
 * `deriveAgentState` is the pure brain of the orchestrator's reconcile.
 * Given a snapshot of {is_active, enabled, vault, pm2 list}, it returns
 * the user-facing state + whether PM2 should be running. Side effects
 * (pm2 exec, SQLite, RPC) are exercised end-to-end on staging.
 *
 * State derivation invariants verified:
 *   is_active=true,  enabled=true,  vault=ok  → activated, desiredRunning=true
 *   is_active=true,  enabled=false, vault=ok  → paused,    desiredRunning=false
 *   is_active=true,  enabled=*,     vault=no  → paused,    desiredRunning=false
 *   is_active=false, *                        → killed,    desiredRunning=false
 *   is_active=null  (RPC failed)              → unknown,   desiredRunning=false
 */

import { describe, it, expect } from 'vitest';
import { deriveAgentState } from '../agent-orchestrator.js';

const NAME = 'nasun-ai-agent-deadbeef';

const base = {
  hasActiveVault: true,
  pm2NameKnown: NAME,
  pm2NamesInList: new Set<string>(),
};

describe('deriveAgentState', () => {
  it('activated when on-chain active, enabled, vault present', () => {
    const r = deriveAgentState({ ...base, isActive: true, enabled: true });
    expect(r.state).toBe('activated');
    expect(r.desiredRunning).toBe(true);
    expect(r.reason).toBe('enabled_true');
  });

  it('paused when on-chain active but enabled=false', () => {
    const r = deriveAgentState({ ...base, isActive: true, enabled: false });
    expect(r.state).toBe('paused');
    expect(r.desiredRunning).toBe(false);
    expect(r.reason).toBe('enabled_false');
  });

  it('paused when on-chain active but vault row missing (cannot spawn)', () => {
    const r = deriveAgentState({
      ...base, hasActiveVault: false, isActive: true, enabled: true,
    });
    expect(r.state).toBe('paused');
    expect(r.desiredRunning).toBe(false);
    expect(r.reason).toBe('no_active_vault_row');
  });

  it('killed when on-chain inactive (enabled=true)', () => {
    const r = deriveAgentState({ ...base, isActive: false, enabled: true });
    expect(r.state).toBe('killed');
    expect(r.desiredRunning).toBe(false);
    expect(r.reason).toBe('on_chain_inactive');
  });

  it('killed when on-chain inactive (enabled=false)', () => {
    const r = deriveAgentState({ ...base, isActive: false, enabled: false });
    expect(r.state).toBe('killed');
    expect(r.desiredRunning).toBe(false);
  });

  it('killed even when vault still present (kill is on-chain truth)', () => {
    const r = deriveAgentState({
      ...base, hasActiveVault: true, isActive: false, enabled: true,
    });
    expect(r.state).toBe('killed');
    expect(r.desiredRunning).toBe(false);
  });

  it('unknown when on-chain read returns null (RPC failure or legacy profile_id NULL)', () => {
    const r = deriveAgentState({ ...base, isActive: null, enabled: true });
    expect(r.state).toBe('unknown');
    expect(r.desiredRunning).toBe(false);
    expect(r.reason).toBe('on_chain_unknown');
  });

  it('unknown takes precedence over enabled=false (do not infer paused on RPC failure)', () => {
    const r = deriveAgentState({ ...base, isActive: null, enabled: false });
    expect(r.state).toBe('unknown');
    expect(r.desiredRunning).toBe(false);
  });
});
