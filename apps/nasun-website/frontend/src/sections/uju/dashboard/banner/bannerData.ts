export type BannerAccent =
  | "teal"
  | "gold"
  | "mint"
  | "cyan"
  | "scarlet"
  | "amber";

export interface BannerItem {
  id: string;
  tag: string;
  title: string;
  description: string;
  ctaLabel?: string;
  ctaUrl?: string;
  isExternal?: boolean;
  accent: BannerAccent;
  bg?: string;
  light?: boolean;
}

export const BANNER_ITEMS: BannerItem[] = [
  {
    id: "repost-bonus",
    tag: "Announcement",
    title: "Repost @nasun_io for +3 Points",
    description:
      "Repost any official @nasun_io post on X to earn +3 bonus points. Points are granted in bulk 3 days.",
    ctaLabel: "Follow @nasun_io",
    ctaUrl: "https://x.com/nasun_io",
    isExternal: true,
    accent: "amber",
  },
  {
    id: "nsn-staking",
    tag: "Network",
    title: "NSN Staking is Live",
    description:
      "Stake your NSN tokens to earn rewards and strengthen the Nasun network.",
    accent: "mint",
    bg: "bg-emerald-50",
    light: true,
  },
  {
    id: "pado-dex",
    tag: "App",
    title: "Trade on Pado DEX",
    description:
      "Swap, predict, and participate in liquidity on Nasun's native DEX.",
    ctaLabel: "Open Pado",
    ctaUrl: "https://pado.finance",
    isExternal: true,
    accent: "cyan",
    bg: "bg-slate-900",
  },
  {
    id: "pado-defi-leaderboard",
    tag: "Launch",
    title: "Pado DeFi Leaderboard is Live",
    description:
      "Climb the weekly DeFi leaderboard by trading and providing liquidity on Pado.",
    ctaLabel: "View Leaderboard",
    ctaUrl: "/leaderboards/pado-leaderboard",
    isExternal: false,
    accent: "cyan",
    bg: "bg-sky-100",
    light: true,
  },
  {
    id: "nasun-ecosystem-leaderboard",
    tag: "Launch",
    title: "Nasun Ecosystem Leaderboard is Live",
    description:
      "See where you rank across the entire Nasun ecosystem by weekly ecosystem points.",
    ctaLabel: "View Leaderboard",
    ctaUrl: "/leaderboards/nasun-ecosystem-leaderboard",
    isExternal: false,
    accent: "gold",
    bg: "bg-stone-900",
  },
  {
    id: "gostop-launch",
    tag: "Launch",
    title: "GoStop is Live",
    description:
      "Nasun's casino game hub. Crash, Plinko, Mines, and more — play and earn.",
    ctaLabel: "Open GoStop",
    ctaUrl: "https://gostop.app",
    isExternal: true,
    accent: "mint",
    bg: "bg-emerald-950",
  },
];

export const ACCENT_STYLES: Record<
  BannerAccent,
  { bar: string; tag: string; cta: string; bg: string; light?: boolean }
> = {
  teal: {
    bar: "bg-nasun-c3",
    tag: "text-nasun-c3 bg-nasun-c3/25 ",
    cta: "text-nasun-c3 border-nasun-c3/30 hover:bg-nasun-c3/10",
    bg: "",
  },
  gold: {
    bar: "bg-nasun-c1",
    tag: "text-nasun-c1 bg-nasun-c1/25 ",
    cta: "text-nasun-c1 border-nasun-c1/30 hover:bg-nasun-c1/10",
    bg: "",
  },
  mint: {
    bar: "bg-pado-4",
    tag: "text-pado-4 bg-pado-4/25 ",
    cta: "text-pado-4 border-pado-4/30 hover:bg-pado-4/10",
    bg: "",
  },
  cyan: {
    bar: "bg-pado-3",
    tag: "text-pado-3 bg-pado-3/25 ",
    cta: "text-pado-3 border-pado-3/30 hover:bg-pado-3/10",
    bg: "",
  },
  scarlet: {
    bar: "bg-nasun-scarlet",
    tag: "text-nasun-scarlet bg-nasun-scarlet/25 ",
    cta: "text-nasun-scarlet border-nasun-scarlet/30 hover:bg-nasun-scarlet/10",
    bg: "",
  },
  amber: {
    bar: "bg-amber-500",
    tag: "text-black/85 bg-black/15 font-medium",
    cta: "text-black border-black/30 hover:bg-black/10 font-medium",
    bg: "bg-amber-300",
    light: true,
  },
};
