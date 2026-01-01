/**
 * Prediction Market Constants
 * Updated: 2026-01-01 (Security Hardening Redeployment)
 */

// Deployed contract addresses (Nasun Devnet)
export const PREDICTION_PACKAGE_ID =
  '0x6754f5806b9bb348f570e350b1309deb5bd9469d0d3000455b1ce368ef4085eb';

export const PREDICTION_ADMIN_CAP =
  '0x9e06794a20be24f3be11558351125924aed98a6ac03c1d1ec212c3197fb9a3c6';

export const PREDICTION_GLOBAL_STATE =
  '0x02bd4975791ee0c2e73aa5f41e596b6a04f7cc5045f3e36a60832dcf8b5ba421';

// Type names
export const MARKET_TYPE = `${PREDICTION_PACKAGE_ID}::prediction_market::Market`;
export const POSITION_TYPE = `${PREDICTION_PACKAGE_ID}::prediction_market::Position`;
export const ADMIN_CAP_TYPE = `${PREDICTION_PACKAGE_ID}::prediction_market::AdminCap`;

// Price constants
export const MAX_PRICE = 10000; // 100% in basis points
export const PRICE_DECIMALS = 4;

// NUSDC (updated package)
export const NUSDC_DECIMALS = 6;
export const NUSDC_TYPE =
  '0xb083f14e6d768d6ccb7bb95b225a06d65fa41a14aea4c8d102ae1a104835c1d7::nusdc::NUSDC';

// Clock
export const CLOCK_ID = '0x6';

// Test markets - need to recreate after redeployment
export const TEST_MARKETS: string[] = [];
