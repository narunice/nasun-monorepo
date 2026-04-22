// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  BASE_MISSIONS,
  APP_MISSION_MAP,
  makeGovernanceMission,
  getMissionBadge,
} from '../missionRegistry';

// ── BASE_MISSIONS ─────────────────────────────────────────────────────────────

describe('BASE_MISSIONS', () => {
  it('contains exactly faucet, wallet-transfer, chat', () => {
    const ids = BASE_MISSIONS.map((m) => m.id);
    expect(ids).toContain('faucet');
    expect(ids).toContain('wallet-transfer');
    expect(ids).toContain('chat');
    expect(ids).toHaveLength(3);
  });

  it('faucet mission has showFaucet=true and points=1', () => {
    const m = BASE_MISSIONS.find((m) => m.id === 'faucet')!;
    expect(m.showFaucet).toBe(true);
    expect(m.points).toBe(1);
    expect(m.completionType).toBe('onchain');
    expect(m.appId).toBeNull();
  });

  it('wallet-transfer mission has onchain completionType', () => {
    const m = BASE_MISSIONS.find((m) => m.id === 'wallet-transfer')!;
    expect(m.completionType).toBe('onchain');
    expect(m.appId).toBeNull();
  });

  it('chat mission has onchain completionType', () => {
    const m = BASE_MISSIONS.find((m) => m.id === 'chat')!;
    expect(m.completionType).toBe('onchain');
    expect(m.appId).toBeNull();
  });

  it('all BASE_MISSIONS have required fields', () => {
    for (const m of BASE_MISSIONS) {
      expect(m.id).toBeTruthy();
      expect(m.label).toBeTruthy();
      expect(m.description).toBeTruthy();
      expect(m.completionType).toMatch(/^(onchain|visit)$/);
    }
  });
});

// ── APP_MISSION_MAP: pado ─────────────────────────────────────────────────────

describe('APP_MISSION_MAP - pado', () => {
  const padoMissions = APP_MISSION_MAP['pado'];

  it('has exactly 4 pado missions', () => {
    expect(padoMissions).toHaveLength(4);
  });

  it('contains pado-dex, pado-lottery, pado-scratchcard, pado-games', () => {
    const ids = padoMissions.map((m) => m.id);
    expect(ids).toContain('pado-dex');
    expect(ids).toContain('pado-lottery');
    expect(ids).toContain('pado-scratchcard');
    expect(ids).toContain('pado-games');
  });

  it('all pado missions are onchain completionType', () => {
    for (const m of padoMissions) {
      expect(m.completionType).toBe('onchain');
    }
  });

  it('pado-dex has points=2', () => {
    const m = padoMissions.find((m) => m.id === 'pado-dex')!;
    expect(m.points).toBe(2);
  });

  it('all pado missions have pado.finance externalUrl', () => {
    for (const m of padoMissions) {
      expect(m.externalUrl).toMatch(/^https:\/\/pado\.finance/);
    }
  });

  it('all pado missions have appId="pado"', () => {
    for (const m of padoMissions) {
      expect(m.appId).toBe('pado');
    }
  });

  // Critical: IDs must match useDailyMissions MissionId type exactly
  it('pado mission IDs match useDailyMissions MissionId union (sync guard)', () => {
    const allowedIds = new Set([
      'pado-dex',
      'pado-lottery',
      'pado-scratchcard',
      'pado-games',
    ]);
    for (const m of padoMissions) {
      expect(allowedIds.has(m.id)).toBe(true);
    }
  });
});

// ── APP_MISSION_MAP: visit-type apps ─────────────────────────────────────────

describe.each([
  { appId: 'jupiter', expectedId: 'jupiter-swap', expectedUrl: 'https://jup.ag' },
  { appId: 'cetus',   expectedId: 'cetus-trade',   expectedUrl: 'https://app.cetus.zone' },
  { appId: 'uniswap', expectedId: 'uniswap-swap',  expectedUrl: 'https://app.uniswap.org' },
])('APP_MISSION_MAP - $appId', ({ appId, expectedId, expectedUrl }) => {
  const missions = APP_MISSION_MAP[appId];

  it('has exactly 1 mission', () => {
    expect(missions).toHaveLength(1);
  });

  it(`mission id is ${expectedId}`, () => {
    expect(missions[0].id).toBe(expectedId);
  });

  it('completionType is visit', () => {
    expect(missions[0].completionType).toBe('visit');
  });

  it(`externalUrl is ${expectedUrl}`, () => {
    expect(missions[0].externalUrl).toBe(expectedUrl);
  });

  it('appId matches parent key', () => {
    expect(missions[0].appId).toBe(appId);
  });

  it('points is undefined (visit missions award no ecosystem points)', () => {
    expect(missions[0].points).toBeUndefined();
  });
});

// ── Coming-soon apps: no missions ─────────────────────────────────────────────

describe('APP_MISSION_MAP - coming-soon apps', () => {
  it('baram has no missions (coming-soon)', () => {
    expect(APP_MISSION_MAP['baram']).toBeUndefined();
  });

  it('gostop has no missions (coming-soon)', () => {
    expect(APP_MISSION_MAP['gostop']).toBeUndefined();
  });

  it('spectra has no missions (coming-soon)', () => {
    expect(APP_MISSION_MAP['spectra']).toBeUndefined();
  });
});

// ── makeGovernanceMission ─────────────────────────────────────────────────────

describe('makeGovernanceMission', () => {
  it('returns mission with id="governance-vote"', () => {
    const m = makeGovernanceMission(1);
    expect(m.id).toBe('governance-vote');
  });

  it('singular label for count=1', () => {
    const m = makeGovernanceMission(1);
    expect(m.label).toBe('Vote on Proposal');
    expect(m.description).toContain('1 active proposal ');
    expect(m.description).not.toContain('proposals');
  });

  it('plural label for count > 1', () => {
    const m = makeGovernanceMission(3);
    expect(m.label).toBe('Vote on Proposals');
    expect(m.description).toContain('3 active proposals');
  });

  it('has onchain completionType and points=1', () => {
    const m = makeGovernanceMission(2);
    expect(m.completionType).toBe('onchain');
    expect(m.points).toBe(1);
  });

  it('links to governance page', () => {
    const m = makeGovernanceMission(1);
    expect(m.externalUrl).toBe('/network/governance');
  });

  it('appId is null (base mission, not app-specific)', () => {
    const m = makeGovernanceMission(1);
    expect(m.appId).toBeNull();
  });
});

// ── getMissionBadge ───────────────────────────────────────────────────────────

describe('getMissionBadge', () => {
  it('returns pado badge for pado mission', () => {
    const m = APP_MISSION_MAP['pado'][0];
    const badge = getMissionBadge(m);
    expect(badge.label).toBe('Pado');
    expect(badge.text).toContain('pado-3');
  });

  it('returns jupiter badge for jupiter mission', () => {
    const m = APP_MISSION_MAP['jupiter'][0];
    const badge = getMissionBadge(m);
    expect(badge.label).toBe('Jupiter');
  });

  it('returns cetus badge for cetus mission', () => {
    const m = APP_MISSION_MAP['cetus'][0];
    const badge = getMissionBadge(m);
    expect(badge.label).toBe('Cetus');
  });

  it('returns uniswap badge for uniswap mission', () => {
    const m = APP_MISSION_MAP['uniswap'][0];
    const badge = getMissionBadge(m);
    expect(badge.label).toBe('Uniswap');
  });

  it('returns Devnet badge for base missions (appId=null)', () => {
    const m = BASE_MISSIONS[0]; // faucet
    const badge = getMissionBadge(m);
    expect(badge.label).toBe('Devnet');
  });

  it('returns Devnet badge for governance mission (appId=null)', () => {
    const m = makeGovernanceMission(1);
    const badge = getMissionBadge(m);
    expect(badge.label).toBe('Devnet');
  });

  it('each badge has non-empty bg, text, label fields', () => {
    const allMissions = [
      ...BASE_MISSIONS,
      ...Object.values(APP_MISSION_MAP).flat(),
      makeGovernanceMission(1),
    ];
    for (const m of allMissions) {
      const badge = getMissionBadge(m);
      expect(badge.bg).toBeTruthy();
      expect(badge.text).toBeTruthy();
      expect(badge.label).toBeTruthy();
    }
  });
});

// ── Mission pool construction (integration) ───────────────────────────────────

describe('mission pool construction', () => {
  it('base pool contains 3 missions with no pinned apps', () => {
    const pinnedAppIds: string[] = [];
    const pool = [
      ...BASE_MISSIONS,
      ...pinnedAppIds.flatMap((id) => APP_MISSION_MAP[id] ?? []),
    ];
    expect(pool).toHaveLength(3);
  });

  it('pinning pado adds 4 missions (total 7)', () => {
    const pinnedAppIds = ['pado'];
    const pool = [
      ...BASE_MISSIONS,
      ...pinnedAppIds.flatMap((id) => APP_MISSION_MAP[id] ?? []),
    ];
    expect(pool).toHaveLength(7);
  });

  it('pinning all live apps adds correct missions (3 + 4 + 3 = 10)', () => {
    const pinnedAppIds = ['pado', 'jupiter', 'cetus', 'uniswap'];
    const pool = [
      ...BASE_MISSIONS,
      ...pinnedAppIds.flatMap((id) => APP_MISSION_MAP[id] ?? []),
    ];
    // 3 base + 4 pado + 1 jupiter + 1 cetus + 1 uniswap = 10
    expect(pool).toHaveLength(10);
  });

  it('pinning coming-soon apps (baram/gostop) adds zero missions', () => {
    const pinnedAppIds = ['baram', 'gostop', 'spectra'];
    const pool = [
      ...BASE_MISSIONS,
      ...pinnedAppIds.flatMap((id) => APP_MISSION_MAP[id] ?? []),
    ];
    expect(pool).toHaveLength(3);
  });

  it('no duplicate mission IDs in pool with all apps pinned', () => {
    const pinnedAppIds = ['pado', 'jupiter', 'cetus', 'uniswap'];
    const pool = [
      ...BASE_MISSIONS,
      ...pinnedAppIds.flatMap((id) => APP_MISSION_MAP[id] ?? []),
      makeGovernanceMission(2),
    ];
    const ids = pool.map((m) => m.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
