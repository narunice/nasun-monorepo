// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  computeFilteredTodayBase,
  getActiveMissionCategories,
} from '../todayScoring';

describe('getActiveMissionCategories', () => {
  it('seeds curated defaults when missionsByApp is fully empty', () => {
    // Empty Record means "no record / fresh state" — must match the backend
    // /score endpoint which falls back to DEFAULT_MISSION_IDS in that case.
    expect(getActiveMissionCategories({})).toEqual(
      new Set([
        'faucet',
        'wallet-transfer',
        'pado-dex',
        'gostop-lottery',
        'gostop-scratchcard',
        'gostop-numbermatch',
      ]),
    );
  });

  it('returns the user-selected mission ids', () => {
    const result = getActiveMissionCategories({
      'nasun-devnet': ['faucet', 'wallet-transfer'],
      pado: ['pado-dex'],
      gostop: ['gostop-lottery', 'gostop-numbermatch'],
    });
    expect(result).toEqual(
      new Set(['faucet', 'wallet-transfer', 'pado-dex', 'gostop-lottery', 'gostop-numbermatch']),
    );
  });

  it('ignores apps not in APP_MISSION_MAP', () => {
    const result = getActiveMissionCategories({
      'unknown-app': ['ghost-mission'],
      pado: ['pado-dex'],
    });
    expect(result).toEqual(new Set(['pado-dex']));
  });

  it('falls back to per-app curated defaults when missions[appId] is undefined', () => {
    const result = getActiveMissionCategories({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pado: undefined as any,
    });
    // Default for pado is just pado-dex (curated subset, not "all missions").
    expect(result).toEqual(new Set(['pado-dex']));
  });

  it('respects empty array as explicit zero for that app', () => {
    // pado is the only key; defaults are NOT seeded for non-mentioned apps
    // because the Record is non-empty (user has an explicit per-app entry).
    const result = getActiveMissionCategories({
      pado: [],
    });
    expect(result).toEqual(new Set());
  });
});

describe('computeFilteredTodayBase', () => {
  const ACTIVE_FAUCET_ONLY = new Set(['faucet']);
  const ACTIVE_FULL = new Set([
    'faucet',
    'wallet-transfer',
    'pado-dex',
    'gostop-lottery',
    'gostop-scratchcard',
    'gostop-numbermatch',
  ]);

  it('returns 0 when both inputs are empty', () => {
    expect(computeFilteredTodayBase([], new Set())).toBe(0);
  });

  it('returns 0 when no active missions match todayCategories', () => {
    expect(computeFilteredTodayBase(['faucet'], new Set())).toBe(0);
  });

  it('credits +1 for non-pado-dex active categories', () => {
    expect(computeFilteredTodayBase(['faucet'], ACTIVE_FAUCET_ONLY)).toBe(1);
  });

  it('credits +2 for pado-dex (matview weight)', () => {
    expect(
      computeFilteredTodayBase(['pado-dex'], new Set(['pado-dex'])),
    ).toBe(2);
  });

  it('skips categories not in active set (creator-posts, pado-leaderboard, etc.)', () => {
    const today = ['faucet', 'creator-posts', 'pado-leaderboard'];
    expect(computeFilteredTodayBase(today, ACTIVE_FAUCET_ONLY)).toBe(1);
  });

  it('aggregates multiple categories with correct weights', () => {
    const today = ['faucet', 'pado-dex', 'gostop-lottery', 'gostop-numbermatch'];
    // 1 + 2 + 1 + 1 = 5
    expect(computeFilteredTodayBase(today, ACTIVE_FULL)).toBe(5);
  });

  it('user reported scenario: faucet + lottery checked but other categories silently filtered', () => {
    const today = [
      'faucet',
      'gostop-lottery',
      'creator-posts', // not a mission
      'pado-leaderboard', // not a mission
    ];
    const active = new Set([
      'faucet',
      'wallet-transfer',
      'pado-dex',
      'gostop-lottery',
      'gostop-scratchcard',
      'gostop-numbermatch',
    ]);
    // 1 (faucet) + 1 (lottery) = 2
    expect(computeFilteredTodayBase(today, active)).toBe(2);
  });

  it('mid-day deactivate drops the score immediately', () => {
    const today = ['faucet', 'gostop-lottery'];
    const before = new Set(['faucet', 'gostop-lottery']);
    const after = new Set(['faucet']); // user deactivated gostop
    expect(computeFilteredTodayBase(today, before)).toBe(2);
    expect(computeFilteredTodayBase(today, after)).toBe(1);
  });

  it('reactivate restores the score', () => {
    const today = ['faucet', 'gostop-lottery'];
    const reactivated = new Set(['faucet', 'gostop-lottery']);
    expect(computeFilteredTodayBase(today, reactivated)).toBe(2);
  });

  it('duplicate categories in todayCategories double-count (matview already dedupes upstream)', () => {
    // todayCategoryRows is dedup'd by the matview; if upstream is correct,
    // this case shouldn't occur. Documented to flag if backend ever changes.
    expect(
      computeFilteredTodayBase(['faucet', 'faucet'], ACTIVE_FAUCET_ONLY),
    ).toBe(2);
  });
});
