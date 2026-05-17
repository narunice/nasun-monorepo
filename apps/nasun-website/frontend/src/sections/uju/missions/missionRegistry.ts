// Mission IDs for 'onchain' type must match MissionId in useDailyMissions.ts exactly.
// SYNC WARNING: if useDailyMissions.ts changes MissionId, update here too.

type CompletionType = 'onchain' | 'visit';

/**
 * Cadence the user must perform the mission at to count.
 *   - 'daily':  resets every UTC midnight (current default for all missions)
 *   - 'weekly': planned — one completion per ISO week
 * Default behavior when omitted is 'daily' so legacy entries keep working.
 */
export type MissionCadence = 'daily' | 'weekly';

export interface UjuMission {
  id: string;
  appId: string | null;
  label: string;
  description: string;
  points?: number;
  completionType: CompletionType;
  externalUrl?: string;
  showFaucet?: boolean;
  cadence?: MissionCadence;
}

// Maximum number of active engagement a user can have selected at once.
export const MAX_DAILY_MISSIONS = 7;

// On Activate, seed only these missions (not the full APP_MISSION_MAP entry).
// Sized to 6 by default to mirror the legacy 7-mission my-account list minus
// chat (deprecated in PR3b). gostop ships 5 games but only 3 are seeded so the
// migrated user sees the same historic gostop missions; mines is
// available for manual opt-in within the 7-mission cap.
export const DEFAULT_MISSIONS_BY_APP: Record<string, readonly string[]> = {
  'nasun-devnet': ['faucet', 'wallet-transfer'],
  pado:           ['pado-dex'],
  gostop:         ['gostop-lottery', 'gostop-scratchcard', 'gostop-numbermatch'],
};

// Missions added when an app is pinned via App Directory.
//
// nasun-devnet missions: faucet/wallet-transfer were previously BASE_MISSIONS
// (always shown). They now require explicit nasun-devnet activation, with
// fresh users auto-seeded via DEFAULT_PINNED_APPS in appRegistry.
//
// GoStop missions: each game owns a separate mission id and a separate backend
// category, so the 1pt/day cap applies per game (a user playing all four games
// can earn 4pt/day from GoStop). Mission ids match the backend category names
// (gostop-{lottery,scratchcard,numbermatch,mines}); useDailyMissions.ts
// EVENT_MISSION_MAP must stay in sync.
export const APP_MISSION_MAP: Record<string, UjuMission[]> = {
  'nasun-devnet': [
    {
      id: 'faucet',
      appId: 'nasun-devnet',
      completionType: 'onchain',
      showFaucet: true,
      points: 1,
      label: 'Claim Tokens',
      description: 'Use the faucet to get free test tokens',
    },
    {
      id: 'wallet-transfer',
      appId: 'nasun-devnet',
      completionType: 'onchain',
      points: 1,
      label: 'Send Tokens',
      description: 'Transfer tokens to another wallet',
    },
  ],
  pado: [
    {
      id: 'pado-dex',
      appId: 'pado',
      completionType: 'onchain',
      points: 2,
      label: 'Spot Trade',
      description: 'Place a trade on the DEX orderbook',
      externalUrl: 'https://pado.finance',
    },
    {
      id: 'pado-prediction',
      appId: 'pado',
      completionType: 'onchain',
      points: 2,
      label: 'Predict',
      description: 'Place an order on a prediction market',
      externalUrl: 'https://pado.finance/',
    },
  ],
  gostop: [
    {
      id: 'gostop-lottery',
      appId: 'gostop',
      completionType: 'onchain',
      points: 1,
      label: 'Buy Lottery Ticket',
      description: 'Pick 5 numbers and try your luck',
      externalUrl: 'https://gostop.app/floor',
    },
    {
      id: 'gostop-scratchcard',
      appId: 'gostop',
      completionType: 'onchain',
      points: 1,
      label: 'Play Scratch Card',
      description: 'Scratch and win instant prizes',
      externalUrl: 'https://gostop.app/floor',
    },
    {
      id: 'gostop-numbermatch',
      appId: 'gostop',
      completionType: 'onchain',
      points: 1,
      label: 'Play Number Match',
      description: 'Pick numbers for a quick game',
      externalUrl: 'https://gostop.app/floor',
    },
    {
      id: 'gostop-mines',
      appId: 'gostop',
      completionType: 'onchain',
      points: 1,
      label: 'Play Mines',
      description: 'Reveal cells, dodge mines, cash out before you bust',
      externalUrl: 'https://gostop.app/floor',
    },
    {
      id: 'gostop-wheel',
      appId: 'gostop',
      completionType: 'onchain',
      points: 1,
      label: 'Spin the Wheel',
      description: 'Spin the 20-segment wheel for payouts up to 5x',
      externalUrl: 'https://gostop.app/floor',
    },
  ],
};

// App chain badge styling per appId (for mission row left badge)
// Full Tailwind literals required for JIT scan.
export const APP_BADGE_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  'nasun-devnet': { bg: 'bg-uju-border',     text: 'text-uju-secondary', label: 'Devnet' },
  pado:           { bg: 'bg-pado-3/15',      text: 'text-pado-3',        label: 'Pado' },
  gostop:         { bg: 'bg-pado-5/15',      text: 'text-pado-5',        label: 'GoStop' },
  __base__:       { bg: 'bg-uju-border',     text: 'text-uju-secondary', label: 'Devnet' },
};

export function getMissionBadge(mission: UjuMission) {
  if (mission.appId && APP_BADGE_STYLE[mission.appId]) {
    return APP_BADGE_STYLE[mission.appId];
  }
  return APP_BADGE_STYLE['__base__'];
}
