// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  BASE_MISSIONS,
  APP_MISSION_MAP,
  makeGovernanceMission,
  getMissionBadge,
} from '../missionRegistry';
import type { MissionId } from '@/hooks/useDailyMissions';

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

  it('has exactly 1 pado mission (pado-dex; gostop games moved to gostop card)', () => {
    expect(padoMissions).toHaveLength(1);
  });

  it('contains pado-dex only', () => {
    const ids = padoMissions.map((m) => m.id);
    expect(ids).toEqual(['pado-dex']);
  });

  it('pado-dex is onchain completionType with points=2', () => {
    const m = padoMissions[0];
    expect(m.id).toBe('pado-dex');
    expect(m.completionType).toBe('onchain');
    expect(m.points).toBe(2);
    expect(m.appId).toBe('pado');
    expect(m.externalUrl).toBe('https://pado.finance/trade');
  });
});

// ── APP_MISSION_MAP: gostop ───────────────────────────────────────────────────

describe('APP_MISSION_MAP - gostop', () => {
  const gostopMissions = APP_MISSION_MAP['gostop'];

  it('has exactly 5 gostop missions (one per game)', () => {
    expect(gostopMissions).toHaveLength(5);
  });

  it('contains gostop-{lottery,scratchcard,numbermatch,mines,crash}', () => {
    const ids = gostopMissions.map((m) => m.id);
    expect(ids).toContain('gostop-lottery');
    expect(ids).toContain('gostop-scratchcard');
    expect(ids).toContain('gostop-numbermatch');
    expect(ids).toContain('gostop-mines');
    expect(ids).toContain('gostop-crash');
  });

  it('all gostop missions are onchain completionType with appId=gostop', () => {
    for (const m of gostopMissions) {
      expect(m.completionType).toBe('onchain');
      expect(m.appId).toBe('gostop');
    }
  });

  it('all gostop missions point to gostop.app', () => {
    for (const m of gostopMissions) {
      expect(m.externalUrl).toMatch(/^https:\/\/gostop\.app/);
    }
  });

  it('each gostop mission has its own distinct label', () => {
    const labels = gostopMissions.map((m) => m.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(gostopMissions.find((m) => m.id === 'gostop-mines')?.label).toBe('Play Mines');
    expect(gostopMissions.find((m) => m.id === 'gostop-crash')?.label).toBe('Play Crash');
  });

  // Critical: IDs must match useDailyMissions MissionId type exactly
  it('gostop mission IDs match useDailyMissions MissionId union (sync guard)', () => {
    const allowedIds = new Set([
      'gostop-lottery',
      'gostop-scratchcard',
      'gostop-numbermatch',
      'gostop-mines',
      'gostop-crash',
    ]);
    for (const m of gostopMissions) {
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

  it('returns gostop badge for gostop mission', () => {
    const m = APP_MISSION_MAP['gostop'][0];
    const badge = getMissionBadge(m);
    expect(badge.label).toBe('GoStop');
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

  it('pinning pado adds 1 mission (total 4)', () => {
    const pinnedAppIds = ['pado'];
    const pool = [
      ...BASE_MISSIONS,
      ...pinnedAppIds.flatMap((id) => APP_MISSION_MAP[id] ?? []),
    ];
    expect(pool).toHaveLength(4);
  });

  it('pinning gostop adds 5 missions (total 8)', () => {
    const pinnedAppIds = ['gostop'];
    const pool = [
      ...BASE_MISSIONS,
      ...pinnedAppIds.flatMap((id) => APP_MISSION_MAP[id] ?? []),
    ];
    expect(pool).toHaveLength(8);
  });

  it('pinning all live apps adds correct missions (3 + 1 + 5 + 1 + 1 + 1 = 12)', () => {
    const pinnedAppIds = ['pado', 'gostop', 'jupiter', 'cetus', 'uniswap'];
    const pool = [
      ...BASE_MISSIONS,
      ...pinnedAppIds.flatMap((id) => APP_MISSION_MAP[id] ?? []),
    ];
    // 3 base + 1 pado + 5 gostop + 1 jupiter + 1 cetus + 1 uniswap = 12
    expect(pool).toHaveLength(12);
  });

  it('pinning coming-soon apps (baram/spectra) adds zero missions', () => {
    const pinnedAppIds = ['baram', 'spectra'];
    const pool = [
      ...BASE_MISSIONS,
      ...pinnedAppIds.flatMap((id) => APP_MISSION_MAP[id] ?? []),
    ];
    expect(pool).toHaveLength(3);
  });

  it('no duplicate mission IDs in pool with all apps pinned', () => {
    const pinnedAppIds = ['pado', 'gostop', 'jupiter', 'cetus', 'uniswap'];
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

// ── Onchain MissionId sync guard ──────────────────────────────────────────────
// If useDailyMissions.ts adds/removes/renames a MissionId, this test must be
// updated in lockstep. The runtime array below is the single source of truth
// for ids accepted by the scanner; drift between this list and MissionId will
// fail TypeScript compilation via the `satisfies` assertion on ALLOWED, and the
// `_Exhaustive` type check catches the reverse direction (MissionId gaining an
// entry not present in ALLOWED).

describe('onchain mission ID sync', () => {
  // Runtime list mirroring the MissionId union in useDailyMissions.ts.
  // `satisfies readonly MissionId[]` ensures every entry is a valid MissionId
  // at compile time — if MissionId shrinks or renames, TS errors here.
  const ALLOWED_MISSION_IDS = [
    'faucet',
    'wallet-transfer',
    'pado-dex',
    'gostop-lottery',
    'gostop-scratchcard',
    'gostop-numbermatch',
    'gostop-mines',
    'gostop-crash',
    'chat',
  ] as const satisfies readonly MissionId[];

  // Reverse check: if MissionId grows, this type forces the developer to add
  // the new id to ALLOWED_MISSION_IDS above.
  type _Exhaustive = Exclude<MissionId, (typeof ALLOWED_MISSION_IDS)[number]> extends never
    ? true
    : 'ALLOWED_MISSION_IDS is missing a new MissionId — add it to the runtime array above';
  const _exhaustiveCheck: _Exhaustive = true;
  void _exhaustiveCheck; // silence unused-var lint

  const allowed = new Set<string>(ALLOWED_MISSION_IDS);

  it('every BASE_MISSIONS onchain id is a valid MissionId', () => {
    for (const m of BASE_MISSIONS) {
      if (m.completionType === 'onchain') {
        expect(allowed.has(m.id)).toBe(true);
      }
    }
  });

  it('every APP_MISSION_MAP onchain id is a valid MissionId', () => {
    for (const [appId, missions] of Object.entries(APP_MISSION_MAP)) {
      for (const m of missions) {
        if (m.completionType === 'onchain') {
          expect(
            allowed.has(m.id),
            `${appId}/${m.id} is not in MissionId union`,
          ).toBe(true);
        }
      }
    }
  });

  it('governance-vote is intentionally NOT in MissionId (tracked out-of-band)', () => {
    // Governance completion is detected via useGovernanceMission
    // (hasUnvotedProposal), not via the daily-mission scanner's Set<MissionId>.
    // The mission is removed from the pool once voted, so no MissionId entry
    // is needed.
    expect(allowed.has('governance-vote')).toBe(false);
  });
});
