export const NASUN_AI_ENABLED = import.meta.env.VITE_NASUN_AI_ENABLED === 'true';

// Dashboard "Ecosystem Positions" cards (Uniswap LP, Hyperliquid, etc.) shown
// above the Overview hero. Hidden in prod until the integration is complete.
export const UJU_ECOSYSTEM_POSITIONS_ENABLED =
  import.meta.env.VITE_UJU_ECOSYSTEM_POSITIONS_ENABLED === 'true';

// External-chain dApps (Uniswap/Aave on Ethereum, Hyperliquid, Drift on Solana)
// in the Activity > Apps Directory. When false, these entries render as
// "coming-soon" and cannot be activated. Kept enabled in staging/dev so the
// integration work can continue while prod hides the not-yet-shipped surface.
export const UJU_EXTERNAL_CHAIN_APPS_ENABLED =
  import.meta.env.VITE_UJU_EXTERNAL_CHAIN_APPS_ENABLED === 'true';

// Ecosystem page path for Nasun AI / Baram.
// /ecosystem/nasun-ai route does not exist; /ecosystem/baram is the canonical slug.
export const ecosystemAiPath = '/ecosystem/baram';
