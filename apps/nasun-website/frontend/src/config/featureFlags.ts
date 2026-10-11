export const NASUN_AI_ENABLED = import.meta.env.VITE_NASUN_AI_ENABLED === 'true';

// Dashboard "Ecosystem Positions" cards (Uniswap LP, Hyperliquid, etc.) shown
// above the Overview hero.
//
// NOTHING READS THIS FLAG. The section's real gate is a commented-out import
// and JSX in DashboardTab.tsx ("TEMP DISABLED for reload-loop diagnosis",
// 2026-05-20), so setting it true changes nothing. Re-enabling means
// uncommenting there; keep this flag as the intended gate when that happens.
export const UJU_ECOSYSTEM_POSITIONS_ENABLED =
  import.meta.env.VITE_UJU_ECOSYSTEM_POSITIONS_ENABLED === 'true';

// External-chain dApps (Uniswap/Aave on Ethereum, Hyperliquid, Drift on Solana)
// in the Activity > Apps Directory. When false they are filtered out of the
// registry entirely rather than shown as "coming-soon". Enabled everywhere
// since 2026-10-11; a pinned entry links out but shows no positions until
// EcosystemPositionsSection is re-enabled in DashboardTab.
export const UJU_EXTERNAL_CHAIN_APPS_ENABLED =
  import.meta.env.VITE_UJU_EXTERNAL_CHAIN_APPS_ENABLED === 'true';

// Ecosystem page path for Nasun AI / Baram.
// /ecosystem/nasun-ai route does not exist; /ecosystem/baram is the canonical slug.
export const ecosystemAiPath = '/ecosystem/baram';
