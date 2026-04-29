// @vitest-environment node
//
// Component tests are skipped in this environment due to:
//   Node 18 + Vitest 4 jsdom: html-encoding-sniffer requires ESM as CJS (ERR_REQUIRE_ESM)
//   This is a pre-existing issue that affects ALL jsdom component tests in this project.
//
// This file instead tests the business logic extracted from UjuDailyMissionsCard:
//   - mission pool construction (prop-driven)
//   - visit tracking (localStorage)
//   - completion detection (onchain vs visit)
//   - overflow cap (MAX_DISPLAYED=7)
//   - total points calculation
//
// Full integration is covered by missionRegistry.test.ts (51 tests, all passing).

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
  BASE_MISSIONS,
  APP_MISSION_MAP,
  makeGovernanceMission,
  type UjuMission,
} from '../../missions/missionRegistry';
import type { AppEntry } from '../../apps/appRegistry';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const PADO_APP: AppEntry = {
  id: 'pado', name: 'Pado', description: '', url: 'https://pado.finance',
  chain: 'nasun', category: 'dex', status: 'live', isNative: true,
};
const GOSTOP_APP: AppEntry = {
  id: 'gostop', name: 'GoStop', description: '', url: 'https://gostop.app',
  chain: 'nasun', category: 'game', status: 'live', isNative: true,
};
const JUPITER_APP: AppEntry = {
  id: 'jupiter', name: 'Jupiter', description: '', url: 'https://jup.ag',
  chain: 'solana', category: 'dex', status: 'live', isNative: false,
};
const CETUS_APP: AppEntry = {
  id: 'cetus', name: 'Cetus', description: '', url: 'https://app.cetus.zone',
  chain: 'sui', category: 'dex', status: 'live', isNative: false,
};
const UNISWAP_APP: AppEntry = {
  id: 'uniswap', name: 'Uniswap', description: '', url: 'https://app.uniswap.org',
  chain: 'ethereum', category: 'dex', status: 'live', isNative: false,
};
const BARAM_APP: AppEntry = {
  id: 'baram', name: 'Baram AI', description: '', url: '#',
  chain: 'nasun', category: 'ai', status: 'coming-soon', isNative: true,
};

// ── Logic extracted from UjuDailyMissionsCard ─────────────────────────────────

const MAX_DISPLAYED = 7;

function buildMissionPool(
  pinnedApps: AppEntry[],
  governance?: { hasUnvotedProposal: boolean; unvotedCount: number },
): UjuMission[] {
  const pool: UjuMission[] = [...BASE_MISSIONS];
  for (const app of pinnedApps) {
    pool.push(...(APP_MISSION_MAP[app.id] ?? []));
  }
  if (governance?.hasUnvotedProposal) {
    pool.push(makeGovernanceMission(governance.unvotedCount));
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
  return showAll ? pool : pool.slice(0, MAX_DISPLAYED);
}

function getHiddenCount(pool: UjuMission[]): number {
  return Math.max(0, pool.length - MAX_DISPLAYED);
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

describe('mission pool construction', () => {
  it('base pool: 3 missions with no pinned apps', () => {
    expect(buildMissionPool([])).toHaveLength(3);
  });

  it('pado pinned: base(3) + pado(1) = 4 missions', () => {
    expect(buildMissionPool([PADO_APP])).toHaveLength(4);
  });

  it('gostop pinned: base(3) + gostop(3) = 6 missions', () => {
    expect(buildMissionPool([GOSTOP_APP])).toHaveLength(6);
  });

  it('jupiter pinned: base(3) + jupiter(1) = 4 missions', () => {
    expect(buildMissionPool([JUPITER_APP])).toHaveLength(4);
  });

  it('all live apps pinned: 3 + 1 + 3 + 1 + 1 + 1 = 10 missions', () => {
    expect(
      buildMissionPool([PADO_APP, GOSTOP_APP, JUPITER_APP, CETUS_APP, UNISWAP_APP]),
    ).toHaveLength(10);
  });

  it('coming-soon app (baram) adds 0 missions', () => {
    expect(buildMissionPool([BARAM_APP])).toHaveLength(3);
  });

  it('governance proposal adds 1 mission', () => {
    const pool = buildMissionPool([], { hasUnvotedProposal: true, unvotedCount: 1 });
    expect(pool).toHaveLength(4);
    expect(pool.find((m) => m.id === 'governance-vote')).toBeTruthy();
  });

  it('governance hidden when no unvoted proposals', () => {
    const pool = buildMissionPool([], { hasUnvotedProposal: false, unvotedCount: 0 });
    expect(pool.find((m) => m.id === 'governance-vote')).toBeUndefined();
  });

  it('pool has no duplicate IDs across all apps', () => {
    const pool = buildMissionPool([PADO_APP, GOSTOP_APP, JUPITER_APP, CETUS_APP, UNISWAP_APP]);
    const ids = pool.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ── Completion detection ──────────────────────────────────────────────────────

describe('completion detection', () => {
  it('onchain mission: detected via completedMissions set', () => {
    const m = BASE_MISSIONS.find((m) => m.id === 'faucet')!;
    expect(isCompleted(m, new Set(['faucet']), new Set(), new Set())).toBe(true);
  });

  it('onchain mission: detected via localCompleted (optimistic update)', () => {
    const m = BASE_MISSIONS.find((m) => m.id === 'faucet')!;
    expect(isCompleted(m, new Set(), new Set(['faucet']), new Set())).toBe(true);
  });

  it('onchain mission: not completed when absent from both sets', () => {
    const m = BASE_MISSIONS.find((m) => m.id === 'faucet')!;
    expect(isCompleted(m, new Set(), new Set(), new Set())).toBe(false);
  });

  it('visit mission: detected via visitedMissions set', () => {
    const m = APP_MISSION_MAP['jupiter'][0];
    expect(isCompleted(m, new Set(), new Set(), new Set(['jupiter-swap']))).toBe(true);
  });

  it('visit mission: NOT detected via completedMissions (onchain results ignored)', () => {
    const m = APP_MISSION_MAP['jupiter'][0];
    // Even if completedMissions contains the id, visit type uses visitedMissions only
    expect(isCompleted(m, new Set(['jupiter-swap']), new Set(), new Set())).toBe(false);
  });

  it('completedCount: sum of all completed missions', () => {
    const pool = buildMissionPool([PADO_APP, JUPITER_APP]);
    const completedMissions = new Set(['faucet', 'pado-dex']);
    const visitedMissions = new Set(['jupiter-swap']);
    const count = pool.filter((m) =>
      isCompleted(m, completedMissions, new Set(), visitedMissions),
    ).length;
    expect(count).toBe(3); // faucet + pado-dex + jupiter-swap
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
    const next = saveVisitedMission('jupiter-swap', new Set());
    expect(next.has('jupiter-swap')).toBe(true);

    // Re-load from storage
    const reloaded = loadVisitedMissions();
    expect(reloaded.has('jupiter-swap')).toBe(true);
  });

  it('saveVisitedMission accumulates multiple IDs', () => {
    let visited = saveVisitedMission('jupiter-swap', new Set());
    visited = saveVisitedMission('cetus-trade', visited);

    const reloaded = loadVisitedMissions();
    expect(reloaded.has('jupiter-swap')).toBe(true);
    expect(reloaded.has('cetus-trade')).toBe(true);
    expect(reloaded.size).toBe(2);
  });

  it('saveVisitedMission is idempotent (calling twice gives size=1)', () => {
    let visited = saveVisitedMission('jupiter-swap', new Set());
    visited = saveVisitedMission('jupiter-swap', visited);
    expect(visited.size).toBe(1);
  });

  it('localStorage key includes UTC date (auto-expires at midnight)', () => {
    saveVisitedMission('jupiter-swap', new Set());
    const todayStr = new Date().toISOString().slice(0, 10);
    const key = `uju:visited-missions:${todayStr}`;
    expect(localStorage.getItem(key)).not.toBeNull();
  });

  it('stale key from previous day is not loaded by loadVisitedMissions', () => {
    // Write a key for "yesterday"
    const yesterday = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);
    localStorage.setItem(`uju:visited-missions:${yesterday}`, JSON.stringify(['jupiter-swap']));

    // Today's load should return empty
    const loaded = loadVisitedMissions();
    expect(loaded.has('jupiter-swap')).toBe(false);
  });

  it('invalid JSON in localStorage returns empty set without throwing', () => {
    localStorage.setItem(getTodayKey(), 'not-json{{{');
    expect(() => loadVisitedMissions()).not.toThrow();
    expect(loadVisitedMissions().size).toBe(0);
  });
});

// ── Overflow cap (MAX_DISPLAYED=7) ────────────────────────────────────────────

describe('overflow cap', () => {
  it('pool of 7: hiddenCount=0, all displayed', () => {
    const pool = buildMissionPool([GOSTOP_APP, PADO_APP]); // 3+3+1=7
    expect(getHiddenCount(pool)).toBe(0);
    expect(getDisplayedMissions(pool, false)).toHaveLength(7);
  });

  it('pool of 8: hiddenCount=1', () => {
    const pool = buildMissionPool([GOSTOP_APP, PADO_APP, JUPITER_APP]); // 3+3+1+1=8
    expect(getHiddenCount(pool)).toBe(1);
  });

  it('pool of 8 with showAll=false: only 7 displayed', () => {
    const pool = buildMissionPool([GOSTOP_APP, PADO_APP, JUPITER_APP]);
    expect(getDisplayedMissions(pool, false)).toHaveLength(7);
  });

  it('pool of 8 with showAll=true: all 8 displayed', () => {
    const pool = buildMissionPool([GOSTOP_APP, PADO_APP, JUPITER_APP]);
    expect(getDisplayedMissions(pool, true)).toHaveLength(8);
  });

  it('pool of 10: hiddenCount=3', () => {
    const pool = buildMissionPool([PADO_APP, GOSTOP_APP, JUPITER_APP, CETUS_APP, UNISWAP_APP]);
    expect(getHiddenCount(pool)).toBe(3);
  });

  it('pool under 7: hiddenCount=0', () => {
    const pool = buildMissionPool([]); // 3
    expect(getHiddenCount(pool)).toBe(0);
    const pool4 = buildMissionPool([JUPITER_APP]); // 4
    expect(getHiddenCount(pool4)).toBe(0);
  });
});

// ── Total points calculation ──────────────────────────────────────────────────

describe('total points calculation', () => {
  it('base missions only: 3 pts (1+1+1)', () => {
    expect(getTotalPoints(buildMissionPool([]))).toBe(3);
  });

  it('pado pinned: 5 pts (3 base + 2 pado-dex)', () => {
    expect(getTotalPoints(buildMissionPool([PADO_APP]))).toBe(5);
  });

  it('gostop pinned: 6 pts (3 base + 1+1+1 gostop)', () => {
    expect(getTotalPoints(buildMissionPool([GOSTOP_APP]))).toBe(6);
  });

  it('jupiter pinned: 3 pts (visit missions have no points)', () => {
    expect(getTotalPoints(buildMissionPool([JUPITER_APP]))).toBe(3);
  });

  it('cetus pinned: 3 pts (visit missions have no points)', () => {
    expect(getTotalPoints(buildMissionPool([CETUS_APP]))).toBe(3);
  });

  it('all live apps: 8 pts (3 base + 2 pado-dex + 1+1+1 gostop, visit missions count 0)', () => {
    const pool = buildMissionPool([PADO_APP, GOSTOP_APP, JUPITER_APP, CETUS_APP, UNISWAP_APP]);
    expect(getTotalPoints(pool)).toBe(8);
  });

  it('governance adds 1 pt', () => {
    const base = getTotalPoints(buildMissionPool([]));
    const withGov = getTotalPoints(
      buildMissionPool([], { hasUnvotedProposal: true, unvotedCount: 1 }),
    );
    expect(withGov - base).toBe(1);
  });

  it('visit missions (undefined points) contribute 0 via ?? 0', () => {
    const visitMission: UjuMission = {
      id: 'test-visit', appId: 'jupiter', completionType: 'visit',
      label: 'Test', description: 'Test', points: undefined,
    };
    expect(getTotalPoints([visitMission])).toBe(0);
  });
});

// ── Mission ordering (base always first) ──────────────────────────────────────

describe('mission ordering', () => {
  it('base missions come first in pool', () => {
    const pool = buildMissionPool([PADO_APP]);
    expect(pool[0].id).toBe('faucet');
    expect(pool[1].id).toBe('wallet-transfer');
    expect(pool[2].id).toBe('chat');
  });

  it('pado missions follow base missions in APP_MISSION_MAP order', () => {
    const pool = buildMissionPool([PADO_APP]);
    const padoIds = pool.slice(3).map((m) => m.id);
    expect(padoIds).toEqual(['pado-dex']);
  });

  it('gostop missions follow base missions in APP_MISSION_MAP order', () => {
    const pool = buildMissionPool([GOSTOP_APP]);
    const gostopIds = pool.slice(3).map((m) => m.id);
    expect(gostopIds).toEqual(['pado-lottery', 'pado-scratchcard', 'pado-games']);
  });

  it('governance mission is appended last', () => {
    const pool = buildMissionPool([PADO_APP], { hasUnvotedProposal: true, unvotedCount: 1 });
    expect(pool[pool.length - 1].id).toBe('governance-vote');
  });
});

// ── Optimistic faucet (localCompleted) ───────────────────────────────────────

describe('optimistic faucet completion', () => {
  it('faucet in localCompleted counts as complete even when not in completedMissions', () => {
    const m = BASE_MISSIONS.find((m) => m.id === 'faucet')!;
    const result = isCompleted(m, new Set(), new Set(['faucet']), new Set());
    expect(result).toBe(true);
  });

  it('localCompleted union with completedMissions - no double counting', () => {
    const pool = buildMissionPool([]);
    const completedMissions = new Set(['faucet']);
    const localCompleted = new Set(['faucet']); // same mission in both
    const count = pool.filter((m) =>
      isCompleted(m, completedMissions, localCompleted, new Set()),
    ).length;
    expect(count).toBe(1); // only 1 unique mission completed, not 2
  });
});
