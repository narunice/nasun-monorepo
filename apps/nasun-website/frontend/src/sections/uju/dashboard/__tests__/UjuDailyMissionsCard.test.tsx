// @vitest-environment node
//
// Component tests are skipped in this environment due to:
//   Node 18 + Vitest 4 jsdom: html-encoding-sniffer requires ESM as CJS (ERR_REQUIRE_ESM)
//   This is a pre-existing issue that affects ALL jsdom component tests in this project.
//
// This file instead tests the business logic extracted from UjuDailyMissionsCard:
//   - mission pool construction (PR3b: no BASE_MISSIONS, no governance)
//   - visit tracking (localStorage)
//   - completion detection (onchain vs visit)
//   - overflow cap (MAX_DAILY_MISSIONS=7)
//   - total points calculation

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// In-memory localStorage mock for node environment
const localStorageStore: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => localStorageStore[key] ?? null,
  setItem: (key: string, val: string) => { localStorageStore[key] = val; },
  removeItem: (key: string) => { delete localStorageStore[key]; },
  clear: () => { Object.keys(localStorageStore).forEach((k) => delete localStorageStore[k]); },
  key: (i: number) => Object.keys(localStorageStore)[i] ?? null,
  get length() { return Object.keys(localStorageStore).length; },
};
vi.stubGlobal('localStorage', localStorageMock);

import {
  APP_MISSION_MAP,
  MAX_DAILY_MISSIONS,
  type UjuMission,
} from '../../missions/missionRegistry';
import type { AppEntry } from '../../apps/appRegistry';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const NASUN_DEVNET_APP: AppEntry = {
  id: 'nasun-devnet', name: 'Nasun Devnet', description: '', url: '',
  chain: 'nasun', category: 'utility', status: 'live', isNative: true,
};
const PADO_APP: AppEntry = {
  id: 'pado', name: 'Pado', description: '', url: 'https://pado.finance',
  chain: 'nasun', category: 'dex', status: 'live', isNative: true,
};
const GOSTOP_APP: AppEntry = {
  id: 'gostop', name: 'GoStop', description: '', url: 'https://gostop.app',
  chain: 'nasun', category: 'game', status: 'live', isNative: true,
};
const BARAM_APP: AppEntry = {
  id: 'baram', name: 'Baram AI', description: '', url: '#',
  chain: 'nasun', category: 'ai', status: 'coming-soon', isNative: true,
};

// ── Logic extracted from UjuDailyMissionsCard (PR3b shape) ────────────────────

function buildMissionPool(pinnedApps: AppEntry[]): UjuMission[] {
  const pool: UjuMission[] = [];
  for (const app of pinnedApps) {
    pool.push(...(APP_MISSION_MAP[app.id] ?? []));
  }
  return pool;
}

function isCompleted(
  mission: UjuMission,
  completedMissions: Set<string>,
  localCompleted: Set<string>,
  visitedMissions: Set<string>,
): boolean {
  if (mission.completionType === 'visit') return visitedMissions.has(mission.id);
  return completedMissions.has(mission.id) || localCompleted.has(mission.id);
}

function getTotalPoints(pool: UjuMission[]): number {
  return pool.reduce((acc, m) => acc + (m.points ?? 0), 0);
}

function getDisplayedMissions(pool: UjuMission[], showAll: boolean): UjuMission[] {
  return showAll ? pool : pool.slice(0, MAX_DAILY_MISSIONS);
}

function getHiddenCount(pool: UjuMission[]): number {
  return Math.max(0, pool.length - MAX_DAILY_MISSIONS);
}

// ── localStorage helpers mirroring card implementation ────────────────────────

function getTodayKey(): string {
  return `uju:visited-missions:${new Date().toISOString().slice(0, 10)}`;
}

function loadVisitedMissions(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(getTodayKey()) ?? '[]') as string[]);
  } catch { return new Set(); }
}

function saveVisitedMission(id: string, current: Set<string>): Set<string> {
  const next = new Set(current).add(id);
  try {
    localStorage.setItem(getTodayKey(), JSON.stringify([...next]));
  } catch { /* quota */ }
  return next;
}

// ── Mission pool construction ─────────────────────────────────────────────────

describe('mission pool construction (PR3b)', () => {
  it('empty pool: no pinned apps → 0 missions', () => {
    expect(buildMissionPool([])).toHaveLength(0);
  });

  it('nasun-devnet pinned: 2 missions (faucet + wallet-transfer)', () => {
    expect(buildMissionPool([NASUN_DEVNET_APP])).toHaveLength(2);
  });

  it('pado pinned: 1 mission (pado-dex)', () => {
    expect(buildMissionPool([PADO_APP])).toHaveLength(1);
  });

  it('gostop pinned: 5 missions', () => {
    expect(buildMissionPool([GOSTOP_APP])).toHaveLength(5);
  });

  it('all live apps: 2 + 1 + 5 = 8 missions', () => {
    expect(buildMissionPool([NASUN_DEVNET_APP, PADO_APP, GOSTOP_APP])).toHaveLength(8);
  });

  it('coming-soon app (baram) adds 0 missions', () => {
    expect(buildMissionPool([BARAM_APP])).toHaveLength(0);
  });

  it('pool has no duplicate IDs across all apps', () => {
    const pool = buildMissionPool([NASUN_DEVNET_APP, PADO_APP, GOSTOP_APP]);
    const ids = pool.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── Completion detection ──────────────────────────────────────────────────────

describe('completion detection', () => {
  it('onchain mission: detected via completedMissions set', () => {
    const m = APP_MISSION_MAP['nasun-devnet'].find((x) => x.id === 'faucet')!;
    expect(isCompleted(m, new Set(['faucet']), new Set(), new Set())).toBe(true);
  });

  it('onchain mission: detected via localCompleted (optimistic)', () => {
    const m = APP_MISSION_MAP['nasun-devnet'].find((x) => x.id === 'faucet')!;
    expect(isCompleted(m, new Set(), new Set(['faucet']), new Set())).toBe(true);
  });

  it('onchain mission: not completed when absent from both sets', () => {
    const m = APP_MISSION_MAP['nasun-devnet'].find((x) => x.id === 'faucet')!;
    expect(isCompleted(m, new Set(), new Set(), new Set())).toBe(false);
  });
});

// ── Visit mission localStorage tracking ───────────────────────────────────────

describe('visit mission localStorage tracking', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { localStorage.clear(); });

  it('loadVisitedMissions returns empty set initially', () => {
    expect(loadVisitedMissions().size).toBe(0);
  });

  it('saveVisitedMission persists to localStorage', () => {
    saveVisitedMission('test-visit', new Set());
    expect(loadVisitedMissions().has('test-visit')).toBe(true);
  });

  it('saveVisitedMission is idempotent', () => {
    let visited = saveVisitedMission('test-visit', new Set());
    visited = saveVisitedMission('test-visit', visited);
    expect(visited.size).toBe(1);
  });

  it('stale key from previous day is not loaded', () => {
    const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
    localStorage.setItem(`uju:visited-missions:${yesterday}`, JSON.stringify(['x']));
    expect(loadVisitedMissions().has('x')).toBe(false);
  });

  it('invalid JSON returns empty set without throwing', () => {
    localStorage.setItem(getTodayKey(), 'not-json{{{');
    expect(() => loadVisitedMissions()).not.toThrow();
    expect(loadVisitedMissions().size).toBe(0);
  });
});

// ── Overflow cap (MAX_DAILY_MISSIONS=7) ───────────────────────────────────────

describe('overflow cap', () => {
  it('MAX_DAILY_MISSIONS is 7', () => {
    expect(MAX_DAILY_MISSIONS).toBe(7);
  });

  it('pool of 8 (nasun-devnet+pado+gostop): hiddenCount=1', () => {
    const pool = buildMissionPool([NASUN_DEVNET_APP, PADO_APP, GOSTOP_APP]);
    expect(pool).toHaveLength(8);
    expect(getHiddenCount(pool)).toBe(1);
  });

  it('pool of 8 with showAll=false: only 7 displayed', () => {
    const pool = buildMissionPool([NASUN_DEVNET_APP, PADO_APP, GOSTOP_APP]);
    expect(getDisplayedMissions(pool, false)).toHaveLength(7);
  });

  it('pool of 8 with showAll=true: all 8 displayed', () => {
    const pool = buildMissionPool([NASUN_DEVNET_APP, PADO_APP, GOSTOP_APP]);
    expect(getDisplayedMissions(pool, true)).toHaveLength(8);
  });

  it('pool under 7: hiddenCount=0', () => {
    expect(getHiddenCount(buildMissionPool([NASUN_DEVNET_APP, PADO_APP]))).toBe(0);
  });
});

// ── Total points calculation ──────────────────────────────────────────────────

describe('total points calculation', () => {
  it('empty pool: 0 pts', () => {
    expect(getTotalPoints(buildMissionPool([]))).toBe(0);
  });

  it('nasun-devnet: 2 pts (faucet 1 + wallet-transfer 1)', () => {
    expect(getTotalPoints(buildMissionPool([NASUN_DEVNET_APP]))).toBe(2);
  });

  it('pado: 2 pts (pado-dex)', () => {
    expect(getTotalPoints(buildMissionPool([PADO_APP]))).toBe(2);
  });

  it('gostop: 5 pts (5 games × 1pt each)', () => {
    expect(getTotalPoints(buildMissionPool([GOSTOP_APP]))).toBe(5);
  });

  it('all live apps: 9 pts (2 + 2 + 5)', () => {
    expect(getTotalPoints(buildMissionPool([NASUN_DEVNET_APP, PADO_APP, GOSTOP_APP]))).toBe(9);
  });
});

// ── Mission ordering ──────────────────────────────────────────────────────────

describe('mission ordering', () => {
  it('faucet/wallet-transfer come from nasun-devnet (no BASE prefix)', () => {
    const pool = buildMissionPool([NASUN_DEVNET_APP]);
    expect(pool[0].id).toBe('faucet');
    expect(pool[1].id).toBe('wallet-transfer');
    expect(pool[0].appId).toBe('nasun-devnet');
  });

  it('gostop missions in registry order', () => {
    const pool = buildMissionPool([GOSTOP_APP]);
    expect(pool.map((m) => m.id)).toEqual([
      'gostop-lottery',
      'gostop-scratchcard',
      'gostop-numbermatch',
      'gostop-mines',
      'gostop-crash',
    ]);
  });

  it('governance mission is NOT in pool (PR3b: removed from uju surface)', () => {
    const pool = buildMissionPool([NASUN_DEVNET_APP, PADO_APP, GOSTOP_APP]);
    expect(pool.find((m) => m.id === 'governance-vote')).toBeUndefined();
  });
});
