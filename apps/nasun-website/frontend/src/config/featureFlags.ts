export const NASUN_AI_ENABLED = import.meta.env.VITE_NASUN_AI_ENABLED === 'true';

// Dashboard "Ecosystem Positions" cards (Uniswap LP, Hyperliquid, etc.) shown
// above the Overview hero. Hidden in prod until the integration is complete.
export const UJU_ECOSYSTEM_POSITIONS_ENABLED =
  import.meta.env.VITE_UJU_ECOSYSTEM_POSITIONS_ENABLED === 'true';

// Ecosystem page path for Nasun AI / Baram.
// /ecosystem/nasun-ai route does not exist; /ecosystem/baram is the canonical slug.
export const ecosystemAiPath = '/ecosystem/baram';
