/**
 * 2026-05-26 — computeDriftReport coverage.
 *
 * The monitor's actions (telegram POST, SQL read, pm2 jlist) are exercised
 * end-to-end on staging; the pure diff function is the safety boundary —
 * a regression here would either spam operator alerts or silently miss
 * orphans. Both branches must stay tight.
 */

import { describe, it, expect } from 'vitest';
import { computeDriftReport } from '../agent-pm2-monitor.js';

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
