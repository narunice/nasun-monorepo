export type AppChain = 'nasun' | 'solana' | 'sui' | 'ethereum';
export type AppCategory = 'dex' | 'staking' | 'nft' | 'game' | 'ai' | 'analytics';
export type AppStatus = 'live' | 'coming-soon';

export interface AppEntry {
  id: string;
  name: string;
  description: string;
  url: string;
  chain: AppChain;
  category: AppCategory;
  status: AppStatus;
  isNative: boolean;
}

export const APP_REGISTRY: AppEntry[] = [
  // Nasun ecosystem
  {
    id: 'pado',
    name: 'Pado',
    description: 'DEX, prediction markets, and lottery on Nasun.',
    url: 'https://pado.finance',
    chain: 'nasun',
    category: 'dex',
    status: 'live',
    isNative: true,
  },
  {
    id: 'baram',
    name: 'Baram AI',
    description: 'AI-powered compliance and settlement layer.',
    url: '#',
    chain: 'nasun',
    category: 'ai',
    status: 'coming-soon',
    isNative: true,
  },
  {
    id: 'gostop',
    name: 'GoStop',
    description: 'On-chain card game built on Nasun Network.',
    url: '#',
    chain: 'nasun',
    category: 'game',
    status: 'coming-soon',
    isNative: true,
  },
  {
    id: 'spectra',
    name: 'Spectra',
    description: 'Ecosystem analytics and portfolio dashboard.',
    url: '#',
    chain: 'nasun',
    category: 'analytics',
    status: 'coming-soon',
    isNative: true,
  },
  // Solana ecosystem
  {
    id: 'jupiter',
    name: 'Jupiter',
    description: 'Best-in-class liquidity aggregator on Solana.',
    url: 'https://jup.ag',
    chain: 'solana',
    category: 'dex',
    status: 'live',
    isNative: false,
  },
  // SUI ecosystem
  {
    id: 'cetus',
    name: 'Cetus',
    description: 'Native concentrated liquidity AMM on SUI.',
    url: 'https://app.cetus.zone',
    chain: 'sui',
    category: 'dex',
    status: 'live',
    isNative: false,
  },
  // Ethereum ecosystem
  {
    id: 'uniswap',
    name: 'Uniswap',
    description: 'Leading decentralized exchange on Ethereum.',
    url: 'https://app.uniswap.org',
    chain: 'ethereum',
    category: 'dex',
    status: 'live',
    isNative: false,
  },
];

export const VALID_APP_IDS = new Set(APP_REGISTRY.map((a) => a.id));

export const CHAIN_LABEL: Record<AppChain, string> = {
  nasun:    'Nasun',
  solana:   'Solana',
  sui:      'SUI',
  ethereum: 'Ethereum',
};

// Full Tailwind class literals for JIT scanning
export const CHAIN_BADGE_CLASS: Record<AppChain, string> = {
  nasun:    'text-pado-3 bg-pado-3/10',
  solana:   'text-nasun-c3 bg-nasun-c3/10',
  sui:      'text-pado-4 bg-pado-4/10',
  ethereum: 'text-nasun-c1 bg-nasun-c1/10',
};
