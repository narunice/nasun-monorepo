import type { BadgeDefinition, BadgeEvalContext } from './types';

export const BADGES: BadgeDefinition[] = [
  // Trading Category
  {
    id: 'first-trade',
    name: 'First Steps',
    description: 'Complete your first trade',
    tier: 'bronze',
    category: 'trading',
    icon: 'M13 10V3L4 14h7v7l9-11h-7z', // lightning bolt
  },
  {
    id: 'trades-10',
    name: 'Getting Started',
    description: 'Complete 10,000 trades',
    tier: 'bronze',
    category: 'trading',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  },
  {
    id: 'trades-100',
    name: 'Centurion',
    description: 'Complete 100,000 trades',
    tier: 'silver',
    category: 'trading',
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  },
  {
    id: 'trades-1000',
    name: 'Trading Machine',
    description: 'Complete 1,000,000 trades',
    tier: 'gold',
    category: 'trading',
    icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
  },
  {
    id: 'volume-1k',
    name: 'Small Fish',
    description: 'Trade $1M total volume',
    tier: 'bronze',
    category: 'trading',
    icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    id: 'volume-10k',
    name: 'Whale Watcher',
    description: 'Trade $10M total volume',
    tier: 'silver',
    category: 'trading',
    icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
  },
  {
    id: 'volume-100k',
    name: 'Market Mover',
    description: 'Trade $100M total volume',
    tier: 'gold',
    category: 'trading',
    icon: 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z',
  },

  // Ranking Category
  {
    id: 'top-50',
    name: 'Rising Star',
    description: 'Reach Top 50 on the leaderboard',
    tier: 'bronze',
    category: 'ranking',
    icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
  },
  {
    id: 'top-10',
    name: 'Elite Trader',
    description: 'Reach Top 10 on the leaderboard',
    tier: 'silver',
    category: 'ranking',
    icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
  },
  {
    id: 'top-3',
    name: 'Podium Finisher',
    description: 'Reach Top 3 on the leaderboard',
    tier: 'gold',
    category: 'ranking',
    icon: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z',
  },
  {
    id: 'number-one',
    name: 'Champion',
    description: 'Reach #1 on the leaderboard',
    tier: 'platinum',
    category: 'ranking',
    icon: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z',
  },

  // Features Category
  {
    id: 'risk-manager',
    name: 'Risk Manager',
    description: 'Use Take Profit or Stop Loss',
    tier: 'bronze',
    category: 'features',
    icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
  },
  {
    id: 'trailing-pro',
    name: 'Trailing Pro',
    description: 'Use Trailing Stop orders',
    tier: 'silver',
    category: 'features',
    icon: 'M13 17h8m0 0V9m0 8l-8-8-4 4-6-6',
  },
  {
    id: 'multi-market',
    name: 'Diversifier',
    description: 'Trade on 3 or more markets',
    tier: 'silver',
    category: 'features',
    icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z',
  },

  // Social Category
  {
    id: 'chat-active',
    name: 'Social Butterfly',
    description: 'Send 50 chat messages',
    tier: 'bronze',
    category: 'social',
    icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  },
  {
    id: 'early-adopter',
    name: 'Early Adopter',
    description: 'Join Pado during beta phase',
    tier: 'gold',
    category: 'social',
    icon: 'M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7',
  },
];

// Badge condition evaluators
type BadgeEvaluator = (ctx: BadgeEvalContext) => boolean;

export const BADGE_CONDITIONS: Record<string, BadgeEvaluator> = {
  'first-trade': (ctx) => ctx.totalTrades >= 1,
  'trades-10': (ctx) => ctx.totalTrades >= 10_000,
  'trades-100': (ctx) => ctx.totalTrades >= 100_000,
  'trades-1000': (ctx) => ctx.totalTrades >= 1_000_000,
  'volume-1k': (ctx) => ctx.totalVolume >= 1_000_000,
  'volume-10k': (ctx) => ctx.totalVolume >= 10_000_000,
  'volume-100k': (ctx) => ctx.totalVolume >= 100_000_000,
  'top-50': (ctx) => ctx.bestRank > 0 && ctx.bestRank <= 50,
  'top-10': (ctx) => ctx.bestRank > 0 && ctx.bestRank <= 10,
  'top-3': (ctx) => ctx.bestRank > 0 && ctx.bestRank <= 3,
  'number-one': (ctx) => ctx.bestRank === 1,
  'risk-manager': (ctx) => ctx.usedTpsl,
  'trailing-pro': (ctx) => ctx.usedTrailingStop,
  'multi-market': (ctx) => ctx.uniquePools >= 3,
  'chat-active': (ctx) => ctx.chatMessageCount >= 50,
  'early-adopter': () => true, // Everyone during beta gets this
};
