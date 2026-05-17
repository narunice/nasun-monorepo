import { UJU_EXTERNAL_CHAIN_APPS_ENABLED } from "../../../config/featureFlags";

export type AppChain = "nasun" | "solana" | "sui" | "ethereum" | "hyperliquid";
export type AppCategory =
  | "dex"
  | "lending"
  | "staking"
  | "nft"
  | "game"
  | "ai"
  | "analytics"
  | "utility";
export type AppStatus = "live" | "coming-soon";

// External-chain dApps are not yet user-facing in prod. When the feature flag
// is off they render as "coming-soon" in the directory and cannot be activated.
const externalChainStatus: AppStatus = UJU_EXTERNAL_CHAIN_APPS_ENABLED
  ? "live"
  : "coming-soon";

export interface AppEntry {
  id: string;
  name: string;
  description: string;
  url: string;
  chain: AppChain;
  category: AppCategory;
  status: AppStatus;
  isNative: boolean;
  // Optional explicit favicon URL. Use when Google's s2/favicons service
  // cannot resolve a domain (e.g. site hosts its favicon under a subpath
  // like /devnet/favicon.svg with no root fallback).
  iconUrl?: string;
}

export const APP_REGISTRY: AppEntry[] = [
  // Nasun ecosystem
  {
    id: "nasun-devnet",
    name: "Nasun Devnet",
    description: "Faucet and on-chain transfers on the Nasun devnet.",
    url: "https://explorer.nasun.io/devnet/",
    chain: "nasun",
    category: "utility",
    status: "live",
    isNative: true,
    // Explorer hosts its favicon under /devnet/favicon.svg (Vite base); the
    // root /favicon.ico is 404, so Google's s2/favicons service returns its
    // default globe. Point at the actual deployed icon directly.
    iconUrl: "https://explorer.nasun.io/devnet/favicon.svg",
  },
  {
    id: "pado",
    name: "Pado",
    description: "Spot DEX and perp markets on Nasun.",
    url: "https://pado.finance",
    chain: "nasun",
    category: "dex",
    status: "live",
    isNative: true,
  },
  {
    id: "gostop",
    name: "GoStop",
    description:
      "On-chain casino: lottery, scratch cards, mines, crash, and more.",
    url: "https://gostop.app",
    chain: "nasun",
    category: "game",
    status: "live",
    isNative: true,
  },
  {
    id: "baram",
    name: "Nasun AI",
    description: "AI-powered compliance and settlement layer.",
    url: "#",
    chain: "nasun",
    category: "ai",
    status: "coming-soon",
    isNative: true,
  },
  {
    id: "spectra",
    name: "Spectra",
    description: "Ecosystem analytics and portfolio dashboard.",
    url: "#",
    chain: "nasun",
    category: "analytics",
    status: "coming-soon",
    isNative: true,
  },
  // External dApps. The dashboard renders a positions card per pinned dApp
  // once the user has a verified EVM wallet linked (useValidEvmAddress).
  {
    id: "uniswap",
    name: "Uniswap",
    description: "Largest DEX on Ethereum.",
    url: "https://app.uniswap.org",
    chain: "ethereum",
    category: "dex",
    status: externalChainStatus,
    isNative: false,
  },
  {
    id: "hyperliquid",
    name: "Hyperliquid",
    description: "On-chain perpetuals and spot trading.",
    url: "https://app.hyperliquid.xyz",
    chain: "hyperliquid",
    category: "dex",
    status: externalChainStatus,
    isNative: false,
  },
  {
    id: "aave",
    name: "Aave",
    description: "Multi-chain lending and borrowing.",
    url: "https://app.aave.com",
    chain: "ethereum",
    category: "lending",
    status: externalChainStatus,
    isNative: false,
  },
  {
    id: "drift",
    name: "Drift",
    description: "Solana perps, spot, and lending.",
    url: "https://app.drift.trade",
    chain: "solana",
    category: "dex",
    status: externalChainStatus,
    isNative: false,
  },
];

export const VALID_APP_IDS = new Set(APP_REGISTRY.map((a) => a.id));

// Apps auto-pinned for fresh users (no localStorage record). Mirrors the
// legacy 7-mission my-account list minus chat: nasun-devnet (faucet +
// wallet-transfer), pado (pado-dex), gostop (3 historic games). Activate
// per-app seed uses DEFAULT_MISSIONS_BY_APP, so total seeded = 6, leaving
// one slot under the 7-mission cap for the user to add mines or crash.
// Once a user takes any directory action their explicit state wins; we
// never re-seed.
export const DEFAULT_PINNED_APPS: readonly string[] = [
  "nasun-devnet",
  "pado",
  "gostop",
];

export const CHAIN_LABEL: Record<AppChain, string> = {
  nasun: "Nasun",
  solana: "Solana",
  sui: "SUI",
  ethereum: "Ethereum",
  hyperliquid: "Hyperliquid",
};

// Full Tailwind class literals for JIT scanning
export const CHAIN_BADGE_CLASS: Record<AppChain, string> = {
  nasun: "text-pado-3 bg-pado-3/10",
  solana: "text-nasun-c3 bg-nasun-c3/10",
  sui: "text-pado-4 bg-pado-4/10",
  ethereum: "text-nasun-c1 bg-nasun-c1/10",
  hyperliquid: "text-nasun-c2 bg-nasun-c2/10",
};
