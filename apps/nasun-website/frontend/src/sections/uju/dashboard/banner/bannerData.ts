export type BannerAccent = 'teal' | 'gold' | 'mint' | 'cyan' | 'scarlet';

export interface BannerItem {
  id: string;
  tag: string;
  title: string;
  description: string;
  ctaLabel?: string;
  ctaUrl?: string;
  isExternal?: boolean;
  accent: BannerAccent;
}

export const BANNER_ITEMS: BannerItem[] = [
  {
    id: 'repost-bonus',
    tag: 'Announcement',
    title: 'Repost @nasun_io for +3 Points',
    description:
      'Repost any official @nasun_io post on X to earn +3 bonus points. Points are granted in bulk 3 days after each post based on the repost list.',
    ctaLabel: 'Follow @nasun_io',
    ctaUrl: 'https://x.com/nasun_io',
    isExternal: true,
    accent: 'scarlet',
  },
  {
    id: 'nsn-staking',
    tag: 'Network',
    title: 'NSN Staking is Live',
    description: 'Stake your NSN tokens to earn rewards and strengthen the Nasun network.',
    accent: 'mint',
  },
  {
    id: 'pado-dex',
    tag: 'App',
    title: 'Trade on Pado DEX',
    description: "Swap, predict, and participate in liquidity on Nasun's native DEX.",
    ctaLabel: 'Open Pado',
    ctaUrl: 'https://pado.finance',
    isExternal: true,
    accent: 'cyan',
  },
  {
    id: 'pado-defi-leaderboard',
    tag: 'Launch',
    title: 'Pado DeFi Leaderboard is Live',
    description: 'Climb the weekly DeFi leaderboard by trading and providing liquidity on Pado.',
    ctaLabel: 'View Leaderboard',
    ctaUrl: '/community/pado-leaderboard',
    isExternal: false,
    accent: 'cyan',
  },
  {
    id: 'nasun-ecosystem-leaderboard',
    tag: 'Launch',
    title: 'Nasun Ecosystem Leaderboard is Live',
    description: 'See where you rank across the entire Nasun ecosystem by weekly ecosystem points.',
    ctaLabel: 'View Leaderboard',
    ctaUrl: '/community/nasun-ecosystem-leaderboard',
    isExternal: false,
    accent: 'gold',
  },
  {
    id: 'gostop-launch',
    tag: 'Launch',
    title: 'GoStop is Live',
    description: 'Nasun\'s casino game hub. Crash, Plinko, Mines, and more — play and earn.',
    ctaLabel: 'Open GoStop',
    ctaUrl: 'https://gostop.app',
    isExternal: true,
    accent: 'mint',
  },
];

export const ACCENT_STYLES: Record<BannerAccent, { bar: string; tag: string; cta: string }> = {
  teal:    { bar: 'bg-nasun-c3',      tag: 'text-nasun-c3 bg-nasun-c3/10',                     cta: 'text-nasun-c3 border-nasun-c3/30 hover:bg-nasun-c3/10' },
  gold:    { bar: 'bg-nasun-c1',      tag: 'text-nasun-c1 bg-nasun-c1/10',                     cta: 'text-nasun-c1 border-nasun-c1/30 hover:bg-nasun-c1/10' },
  mint:    { bar: 'bg-pado-4',        tag: 'text-pado-4 bg-pado-4/10',                         cta: 'text-pado-4 border-pado-4/30 hover:bg-pado-4/10' },
  cyan:    { bar: 'bg-pado-3',        tag: 'text-pado-3 bg-pado-3/10',                         cta: 'text-pado-3 border-pado-3/30 hover:bg-pado-3/10' },
  scarlet: { bar: 'bg-nasun-scarlet', tag: 'text-nasun-scarlet bg-nasun-scarlet/10',            cta: 'text-nasun-scarlet border-nasun-scarlet/30 hover:bg-nasun-scarlet/10' },
};
