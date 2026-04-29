// Mission IDs for 'onchain' type must match MissionId in useDailyMissions.ts exactly.
// SYNC WARNING: if useDailyMissions.ts changes MissionId, update here too.

type CompletionType = 'onchain' | 'visit';

export interface UjuMission {
  id: string;
  appId: string | null;
  label: string;
  description: string;
  points?: number;
  completionType: CompletionType;
  externalUrl?: string;
  showFaucet?: boolean;
}

// Always shown regardless of pinned apps
export const BASE_MISSIONS: UjuMission[] = [
  {
    id: 'faucet',
    appId: null,
    completionType: 'onchain',
    showFaucet: true,
    points: 1,
    label: 'Claim Tokens',
    description: 'Use the faucet to get free test tokens',
  },
  {
    id: 'wallet-transfer',
    appId: null,
    completionType: 'onchain',
    points: 1,
    label: 'Send Tokens',
    description: 'Transfer tokens to another wallet',
  },
  {
    id: 'chat',
    appId: null,
    completionType: 'onchain',
    points: 1,
    label: 'Chat',
    description: 'Say something in the Nasun or Pado chat room',
  },
];

// Missions added when an app is pinned via App Directory.
//
// GoStop missions: each game owns a separate mission id and a separate backend
// category, so the 1pt/day cap applies per game (a user playing all five games
// can earn 5pt/day from GoStop). Mission ids match the backend category names
// (gostop-{lottery,scratchcard,numbermatch,mines,crash}); useDailyMissions.ts
// EVENT_MISSION_MAP must stay in sync.
export const APP_MISSION_MAP: Record<string, UjuMission[]> = {
  pado: [
    {
      id: 'pado-dex',
      appId: 'pado',
      completionType: 'onchain',
      points: 2,
      label: 'Spot Trade',
      description: 'Place a trade on the DEX orderbook',
      externalUrl: 'https://pado.finance/trade',
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
      externalUrl: 'https://gostop.app/lottery',
    },
    {
      id: 'gostop-scratchcard',
      appId: 'gostop',
      completionType: 'onchain',
      points: 1,
      label: 'Play Scratch Card',
      description: 'Scratch and win instant prizes',
      externalUrl: 'https://gostop.app/scratch',
    },
    {
      id: 'gostop-numbermatch',
      appId: 'gostop',
      completionType: 'onchain',
      points: 1,
      label: 'Play Number Match',
      description: 'Pick numbers for a quick game',
      externalUrl: 'https://gostop.app/numbermatch',
    },
    {
      id: 'gostop-mines',
      appId: 'gostop',
      completionType: 'onchain',
      points: 1,
      label: 'Play Mines',
      description: 'Reveal cells, dodge mines, cash out before you bust',
      externalUrl: 'https://gostop.app/mines',
    },
    {
      id: 'gostop-crash',
      appId: 'gostop',
      completionType: 'onchain',
      points: 1,
      label: 'Play Crash',
      description: 'Bet on the multiplier, cash out before the crash',
      externalUrl: 'https://gostop.app/crash',
    },
  ],
  jupiter: [
    {
      id: 'jupiter-swap',
      appId: 'jupiter',
      completionType: 'visit',
      label: 'Swap on Jupiter',
      description: 'Trade tokens on Jupiter DEX (Solana)',
      externalUrl: 'https://jup.ag',
    },
  ],
  cetus: [
    {
      id: 'cetus-trade',
      appId: 'cetus',
      completionType: 'visit',
      label: 'Trade on Cetus',
      description: 'Provide liquidity or trade on Cetus (SUI)',
      externalUrl: 'https://app.cetus.zone',
    },
  ],
  uniswap: [
    {
      id: 'uniswap-swap',
      appId: 'uniswap',
      completionType: 'visit',
      label: 'Swap on Uniswap',
      description: 'Trade tokens on Uniswap (Ethereum)',
      externalUrl: 'https://app.uniswap.org',
    },
  ],
};

export function makeGovernanceMission(unvotedCount: number): UjuMission {
  return {
    id: 'governance-vote',
    appId: null,
    completionType: 'onchain',
    points: 1,
    label: `Vote on Proposal${unvotedCount > 1 ? 's' : ''}`,
    description: `${unvotedCount} active proposal${unvotedCount > 1 ? 's' : ''} awaiting your vote`,
    externalUrl: '/network/governance',
  };
}

// App chain badge styling per appId (for mission row left badge)
// Full Tailwind literals required for JIT scan.
export const APP_BADGE_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  pado:     { bg: 'bg-pado-3/15',      text: 'text-pado-3',      label: 'Pado' },
  gostop:   { bg: 'bg-pado-5/15',      text: 'text-pado-5',      label: 'GoStop' },
  jupiter:  { bg: 'bg-nasun-c3/15',    text: 'text-nasun-c3',    label: 'Jupiter' },
  cetus:    { bg: 'bg-pado-4/15',      text: 'text-pado-4',      label: 'Cetus' },
  uniswap:  { bg: 'bg-nasun-c1/15',    text: 'text-nasun-c1',    label: 'Uniswap' },
  // base missions: Nasun Devnet badge
  __base__: { bg: 'bg-uju-border',     text: 'text-uju-secondary', label: 'Devnet' },
};

export function getMissionBadge(mission: UjuMission) {
  if (mission.appId && APP_BADGE_STYLE[mission.appId]) {
    return APP_BADGE_STYLE[mission.appId];
  }
  return APP_BADGE_STYLE['__base__'];
}
