// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  APP_MISSION_MAP,
  APP_BADGE_STYLE,
  MAX_DAILY_MISSIONS,
  getMissionBadge,
} from '../missionRegistry';
import type { MissionId } from '@/hooks/useDailyMissions';

// ── Constants ────────────────────────────────────────────────────────────────

describe('MAX_DAILY_MISSIONS', () => {
  it('is 7', () => {
    expect(MAX_DAILY_MISSIONS).toBe(7);
  });
});

// ── APP_MISSION_MAP: nasun-devnet ────────────────────────────────────────────

describe('APP_MISSION_MAP - nasun-devnet', () => {
  const missions = APP_MISSION_MAP['nasun-devnet'];

  it('has exactly 2 missions (faucet + wallet-transfer)', () => {
    expect(missions).toHaveLength(2);
    const ids = missions.map((m) => m.id);
    expect(ids).toContain('faucet');
    expect(ids).toContain('wallet-transfer');
  });

  it('faucet has showFaucet=true and points=1', () => {
    const m = missions.find((x) => x.id === 'faucet')!;
    expect(m.showFaucet).toBe(true);
    expect(m.points).toBe(1);
    expect(m.completionType).toBe('onchain');
    expect(m.appId).toBe('nasun-devnet');
  });

  it('wallet-transfer is onchain with appId=nasun-devnet', () => {
    const m = missions.find((x) => x.id === 'wallet-transfer')!;
    expect(m.completionType).toBe('onchain');
    expect(m.appId).toBe('nasun-devnet');
    expect(m.points).toBe(1);
  });
});

// ── APP_MISSION_MAP: pado ────────────────────────────────────────────────────

describe('APP_MISSION_MAP - pado', () => {
  const padoMissions = APP_MISSION_MAP['pado'];

  it('has exactly 1 pado mission (pado-dex)', () => {
    expect(padoMissions).toHaveLength(1);
    expect(padoMissions[0].id).toBe('pado-dex');
  });

  it('pado-dex is onchain with points=2', () => {
    const m = padoMissions[0];
    expect(m.completionType).toBe('onchain');
    expect(m.points).toBe(2);
    expect(m.appId).toBe('pado');
    expect(m.externalUrl).toBe('https://pado.finance');
  });
});

// ── APP_MISSION_MAP: gostop ──────────────────────────────────────────────────

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

  it('all gostop missions are onchain with appId=gostop', () => {
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
});

// ── Removed apps ─────────────────────────────────────────────────────────────

describe('APP_MISSION_MAP - removed apps (PR3b)', () => {
  it.each(['jupiter', 'cetus', 'uniswap'])('does not contain %s entry', (appId) => {
    expect(APP_MISSION_MAP[appId]).toBeUndefined();
  });
});

// ── Coming-soon apps: no missions ────────────────────────────────────────────

describe('APP_MISSION_MAP - coming-soon apps', () => {
  it('baram has no missions (coming-soon)', () => {
    expect(APP_MISSION_MAP['baram']).toBeUndefined();
  });

  it('spectra has no missions (coming-soon)', () => {
    expect(APP_MISSION_MAP['spectra']).toBeUndefined();
  });
});

// ── APP_BADGE_STYLE ──────────────────────────────────────────────────────────

describe('APP_BADGE_STYLE', () => {
  it('contains nasun-devnet badge', () => {
    expect(APP_BADGE_STYLE['nasun-devnet']).toBeDefined();
    expect(APP_BADGE_STYLE['nasun-devnet'].label).toBe('Devnet');
  });

  it.each(['jupiter', 'cetus', 'uniswap'])('does not contain %s badge', (appId) => {
    expect(APP_BADGE_STYLE[appId]).toBeUndefined();
  });
});

// ── getMissionBadge ──────────────────────────────────────────────────────────

describe('getMissionBadge', () => {
  it('returns nasun-devnet badge for faucet mission', () => {
    const m = APP_MISSION_MAP['nasun-devnet'][0];
    const badge = getMissionBadge(m);
    expect(badge.label).toBe('Devnet');
  });

  it('returns pado badge for pado mission', () => {
    const m = APP_MISSION_MAP['pado'][0];
    const badge = getMissionBadge(m);
    expect(badge.label).toBe('Pado');
  });

  it('returns gostop badge for gostop mission', () => {
    const m = APP_MISSION_MAP['gostop'][0];
    const badge = getMissionBadge(m);
    expect(badge.label).toBe('GoStop');
  });

  it('every mission has non-empty badge fields', () => {
    for (const missions of Object.values(APP_MISSION_MAP)) {
      for (const m of missions) {
        const badge = getMissionBadge(m);
        expect(badge.bg).toBeTruthy();
        expect(badge.text).toBeTruthy();
        expect(badge.label).toBeTruthy();
      }
    }
  });
});

// ── Onchain MissionId sync guard ─────────────────────────────────────────────

describe('onchain mission ID sync', () => {
  const ALLOWED_MISSION_IDS = [
    'faucet',
    'wallet-transfer',
    'pado-dex',
    'gostop-lottery',
    'gostop-scratchcard',
    'gostop-numbermatch',
    'gostop-mines',
    'gostop-crash',
  ] as const satisfies readonly MissionId[];

  type _Exhaustive = Exclude<MissionId, (typeof ALLOWED_MISSION_IDS)[number]> extends never
    ? true
    : 'ALLOWED_MISSION_IDS is missing a new MissionId — add it to the runtime array above';
  const _exhaustiveCheck: _Exhaustive = true;
  void _exhaustiveCheck;

  const allowed = new Set<string>(ALLOWED_MISSION_IDS);

  it('chat is no longer in MissionId (PR3b)', () => {
    expect(allowed.has('chat')).toBe(false);
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

  it('governance-vote is not in MissionId (governance preserved only in myAccount surface)', () => {
    expect(allowed.has('governance-vote')).toBe(false);
  });
});
