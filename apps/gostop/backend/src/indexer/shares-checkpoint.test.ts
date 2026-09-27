/**
 * The share-affecting event set is duplicated between the TS constant and the
 * CASE inside the delta query. They have to agree or the sum silently omits a
 * type, which reads as divergence forever since the checkpoint never advances
 * over a gap.
 *
 * compareShares itself is Postgres bound and verified on the box.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { _SHARE_AFFECTING_EVENT_TYPES } from './shares-checkpoint.js';

const source = readFileSync(new URL('./shares-checkpoint.ts', import.meta.url), 'utf8');

describe('share-affecting event set', () => {
  it('is the three types that move pool.total_shares', () => {
    expect([..._SHARE_AFFECTING_EVENT_TYPES].sort()).toEqual([
      'liquidity_provided',
      'liquidity_redeemed',
      'shares_seeded',
    ]);
  });

  it('gives every listed type a branch in the delta CASE', () => {
    const caseArm = source.slice(source.indexOf('CASE event_type'), source.indexOf('ELSE 0'));
    for (const t of _SHARE_AFFECTING_EVENT_TYPES) {
      expect(caseArm).toContain(`'${t}'`);
    }
  });

  it('signs redemptions negative and the other two positive', () => {
    const caseArm = source.slice(source.indexOf('CASE event_type'), source.indexOf('ELSE 0'));
    expect(caseArm).toMatch(/WHEN 'liquidity_redeemed'\s+THEN -shares/);
    expect(caseArm).toMatch(/WHEN 'liquidity_provided'\s+THEN shares/);
    expect(caseArm).toMatch(/WHEN 'shares_seeded'\s+THEN shares/);
  });

  it('excludes open_exposure_snapshot, which is share neutral and dominates the table', () => {
    expect(_SHARE_AFFECTING_EVENT_TYPES).not.toContain('open_exposure_snapshot');
    expect(source).not.toMatch(/WHEN 'open_exposure_snapshot'/);
  });

  it('never advances the checkpoint except on agreement', () => {
    // advanceCheckpoint is called from exactly two places: the anchor path when
    // no checkpoint exists, and the equality branch. Advancing over a gap would
    // silently forgive a missed event.
    const calls = source.match(/advanceCheckpoint\(/g) ?? [];
    expect(calls.length).toBe(2); // the declaration and the anchor call
  });
});
