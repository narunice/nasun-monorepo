/**
 * Prediction Market Constants
 * Updated: 2026-01-17 (V5 Reset - 2-hour epoch, Chain ID: 56c8b101)
 */

// Deployed contract addresses (Nasun Devnet V5)
export const PREDICTION_PACKAGE_ID =
  '0xc428b702930337328044520256f783e51e80790cd766d5b6f77e7b126d3abb99';

export const PREDICTION_ADMIN_CAP =
  '0xdf0e94d2260ecc4ae38af192f1a7f8bf10e71fd8b90826eb2881906d5dac8240';

export const PREDICTION_GLOBAL_STATE =
  '0x59320a0a63a16bdf5ad4173ed331d81f17afd63b706bd398fab0d629df6f4f7c';

// Type names
export const MARKET_TYPE = `${PREDICTION_PACKAGE_ID}::prediction_market::Market`;
export const POSITION_TYPE = `${PREDICTION_PACKAGE_ID}::prediction_market::Position`;
export const ADMIN_CAP_TYPE = `${PREDICTION_PACKAGE_ID}::prediction_market::AdminCap`;

// Price constants
export const MAX_PRICE = 10000; // 100% in basis points
export const PRICE_DECIMALS = 4;

// NUSDC (pado_tokens V5 package)
export const NUSDC_DECIMALS = 6;
export const NUSDC_TYPE =
  '0xc84727af62147f35ccf070f521e441f48be9325ab0a1b56225f361f0bc266bb8::nusdc::NUSDC';

// Clock
export const CLOCK_ID = '0x6';

// Active markets (created 2026-01-17 V5)
export const TEST_MARKETS: string[] = [
  '0xdc2110edc69ba2284bddf701c5337f19df0bd7abcd8396bb74754230affc6323', // AI: Will OpenAI release GPT-5 in Q1 2026?
  '0x8d0f9ffcacf5c871bbc8370061d0c68dead53bf36f64b3996133281885bf57a9', // Crypto: Will BTC reach 200K by 2026?
  '0x02e0ffab6da9b5b24d2808b978aa5c29e9a9b05cce1f613023befca31a195134', // Sports: Will Korea advance to 2026 World Cup semifinals?
];
