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

// Test markets (created 2026-01-01)
export const TEST_MARKETS: string[] = [
  '0xdc90e9a3ab8609e7322d711fb56d996622e1119070057b2359449193656d71b8', // BTC $150k by March 2026
  '0x0a1f9f569660fa89988192c8645dede0928d489d0330c19e63f4a613bd202fe5', // TikTok Ban by March 2026
  '0xb1859139e2a7c7005ce17434b2d2d11b9930e7bab9b161b5421e7817b2bc577b', // HUNTR/X Grammy 2026
  '0x7a044386e183bdaf9c1eb802ee88422078af3603cfe6a00b6aab170164af4805', // Russia-Ukraine Ceasefire by June 2026
];
