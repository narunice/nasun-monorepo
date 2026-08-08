/**
 * The persisted query cache lives for 24h, so a snapshot restored after a UTC
 * midnight describes yesterday. Both the mission checklist and the pts-today
 * breakdown read `todayCategories`, so the staleness rule has to be one shared
 * function: if they disagree, the user sees an empty checklist next to a points
 * card listing missions it claims are done.
 */

import { describe, it, expect } from 'vitest';
import { todayCategoriesAsOf } from '../todayScoring';

const NOON = Date.parse('2026-08-08T12:00:00.000Z');

describe('todayCategoriesAsOf', () => {
  it('keeps categories fetched earlier on the same UTC day', () => {
    const fetched = Date.parse('2026-08-08T00:30:00.000Z');
    expect(todayCategoriesAsOf(['pado-dex'], fetched, NOON)).toEqual(['pado-dex']);
  });

  it('drops categories fetched on the previous UTC day', () => {
    const fetched = Date.parse('2026-08-07T23:55:00.000Z');
    expect(todayCategoriesAsOf(['pado-dex'], fetched, NOON)).toEqual([]);
  });

  // Ten minutes apart, but across the boundary that scopes the data.
  it('drops across a midnight boundary even when barely stale', () => {
    const now = Date.parse('2026-08-08T00:05:00.000Z');
    const fetched = Date.parse('2026-08-07T23:55:00.000Z');
    expect(todayCategoriesAsOf(['gostop-lottery'], fetched, now)).toEqual([]);
  });

  // Local time must not decide this: the backend scopes todayCategories by UTC
  // day, so a viewer in KST is on "tomorrow" for most of their evening.
  it('uses UTC days, not the local calendar', () => {
    const fetched = Date.parse('2026-08-08T20:00:00.000Z'); // 2026-08-09 05:00 KST
    const now = Date.parse('2026-08-08T22:00:00.000Z'); // 2026-08-09 07:00 KST
    expect(todayCategoriesAsOf(['faucet'], fetched, now)).toEqual(['faucet']);
  });

  // A caller with no handle on the query should degrade to the old behaviour
  // rather than blanking every surface that cannot supply a timestamp.
  it('passes through when no fetch time is recorded', () => {
    expect(todayCategoriesAsOf(['faucet'], null, NOON)).toEqual(['faucet']);
    expect(todayCategoriesAsOf(['faucet'], undefined, NOON)).toEqual(['faucet']);
  });

  it('returns an empty list for missing or empty input', () => {
    expect(todayCategoriesAsOf(undefined, NOON, NOON)).toEqual([]);
    expect(todayCategoriesAsOf([], null, NOON)).toEqual([]);
  });
});
