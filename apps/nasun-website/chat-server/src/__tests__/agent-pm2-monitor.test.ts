/**
 * 2026-05-26 — computeDriftReport coverage.
 *
 * The monitor's actions (telegram POST, SQL read, pm2 jlist) are exercised
 * end-to-end on staging; the pure diff function is the safety boundary —
 * a regression here would either spam operator alerts or silently miss
 * orphans. Both branches must stay tight.
 */

import { describe, it, expect } from 'vitest';
import { computeDriftReport, filterDesiredRunning } from '../agent-pm2-monitor.js';
import type { AgentState } from '../agent-orchestrator.js';

const A = 'nasun-ai-agent-aaaaaaaa';
const B = 'nasun-ai-agent-bbbbbbbb';
const C = 'nasun-ai-agent-cccccccc';
// Sibling pm2 process from a different bot — must never be treated as
// an orphan even though SQL has no row for it.
const UNRELATED = 'price-updater';

describe('computeDriftReport', () => {
  it('empty when SQL and PM2 agree', () => {
    const r = computeDriftReport(new Set([A, B]), new Set([A, B, UNRELATED]));
    expect(r.orphans).toEqual([]);
    expect(r.missing).toEqual([]);
  });

  it('flags PM2-only nasun-ai-agent as orphan', () => {
    const r = computeDriftReport(new Set([A]), new Set([A, B]));
    expect(r.orphans).toEqual([B]);
    expect(r.missing).toEqual([]);
  });

  it('flags SQL-only as missing', () => {
    const r = computeDriftReport(new Set([A, B]), new Set([A]));
    expect(r.orphans).toEqual([]);
    expect(r.missing).toEqual([B]);
  });

  it('flags both orphan and missing in one report', () => {
    const r = computeDriftReport(new Set([A, B]), new Set([A, C]));
    expect(r.orphans).toEqual([C]);
    expect(r.missing).toEqual([B]);
  });

  it('ignores non-agent PM2 processes (no false orphan)', () => {
    // 2026-05-26 incident lesson: chat-server EC2 hosts ~14 unrelated PM2
    // processes (pado-bots, gostop-lottery-keeper, lp-bot-*, etc.). The
    // prefix filter is the only thing keeping them out of the alert.
    const r = computeDriftReport(
      new Set([A]),
      new Set([A, 'pado-bots', 'gostop-lottery-keeper', 'nasun-chat-server']),
    );
    expect(r.orphans).toEqual([]);
    expect(r.missing).toEqual([]);
  });

  it('sorts both lists deterministically (alert dedupe key stability)', () => {
    const r = computeDriftReport(new Set(), new Set([C, A, B]));
    expect(r.orphans).toEqual([A, B, C]);
  });
});

/**
 * 2026-06-23 — filterDesiredRunning coverage.
 *
 * SQL-active (deleted_at/paused_at NULL) is necessary but not sufficient for
 * "should be running". Without this filter a dogfood agent (slot_exempt=1,
 * never paused) whose on-chain profile was deactivated or pruned alerts every
 * cycle forever — the nasun-ai-agent-e4abc071 incident. Only 'activated'
 * (is_active && enabled && vault) is genuine drift when pm2 is gone.
 */
describe('filterDesiredRunning', () => {
  const addrs = new Map([[A, '0xa'], [B, '0xb'], [C, '0xc']]);
  const withStates = (m: Record<string, AgentState>) =>
    (addr: string) => Promise.resolve({ state: m[addr] });

  it('keeps only agents the orchestrator wants running (activated)', async () => {
    const out = await filterDesiredRunning(
      [A, B, C],
      addrs,
      withStates({ '0xa': 'activated', '0xb': 'killed', '0xc': 'paused' }),
    );
    expect(out).toEqual([A]);
  });

  it('drops unknown — profile missing/notExists or RPC null (the dogfood FP)', async () => {
    const out = await filterDesiredRunning([B], addrs, withStates({ '0xb': 'unknown' }));
    expect(out).toEqual([]);
  });

  it('keeps candidates with no resolvable agent_address (broken lookup)', async () => {
    const orphanName = 'nasun-ai-agent-zzzzzzzz';
    const out = await filterDesiredRunning(
      [orphanName],
      addrs,
      async () => { throw new Error('getState must not run for unresolved addr'); },
    );
    expect(out).toEqual([orphanName]);
  });

  it('keeps candidates whose state lookup throws (worth investigating)', async () => {
    const out = await filterDesiredRunning(
      [A],
      addrs,
      async () => { throw new Error('rpc boom'); },
    );
    expect(out).toEqual([A]);
  });
});
