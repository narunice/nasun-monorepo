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
    id: 'baram-ai',
    tag: 'Feature',
    title: 'Baram AI Settlement',
    description: 'AI-powered compliance and settlement layer, now in prototype.',
    ctaLabel: 'Learn More',
    ctaUrl: 'https://baram.nasun.io',
    isExternal: true,
    accent: 'teal',
  },
  {
    id: 'leaderboard-s1',
    tag: 'Event',
    title: 'Season 1 Leaderboard',
    description: 'Earn ecosystem points through daily missions, governance, and community activity.',
    ctaLabel: 'View Leaderboard',
    ctaUrl: '/community/creators-leaderboard',
    isExternal: false,
    accent: 'gold',
  },
  {
    id: 'battalion-nft',
    tag: 'NFT',
    title: 'Battalion NFT Allowlist',
    description: 'Complete Wave 1 tasks to secure your spot on the Battalion NFT allowlist.',
    ctaLabel: 'Join Now',
    ctaUrl: '/wave1/battalion-nft',
    isExternal: false,
    accent: 'gold',
  },
];

export const ACCENT_STYLES: Record<BannerAccent, { bar: string; tag: string; cta: string }> = {
  teal:    { bar: 'bg-nasun-c3',      tag: 'text-nasun-c3 bg-nasun-c3/10',                     cta: 'text-nasun-c3 border-nasun-c3/30 hover:bg-nasun-c3/10' },
  gold:    { bar: 'bg-nasun-c1',      tag: 'text-nasun-c1 bg-nasun-c1/10',                     cta: 'text-nasun-c1 border-nasun-c1/30 hover:bg-nasun-c1/10' },
  mint:    { bar: 'bg-pado-4',        tag: 'text-pado-4 bg-pado-4/10',                         cta: 'text-pado-4 border-pado-4/30 hover:bg-pado-4/10' },
  cyan:    { bar: 'bg-pado-3',        tag: 'text-pado-3 bg-pado-3/10',                         cta: 'text-pado-3 border-pado-3/30 hover:bg-pado-3/10' },
  scarlet: { bar: 'bg-nasun-scarlet', tag: 'text-nasun-scarlet bg-nasun-scarlet/10',            cta: 'text-nasun-scarlet border-nasun-scarlet/30 hover:bg-nasun-scarlet/10' },
};
