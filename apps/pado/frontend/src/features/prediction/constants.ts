/**
 * Prediction Market Constants
 * Updated: 2026-01-27 (V6 Reset - 2-hour epoch, Chain ID: 12bf3808)
 */

// Deployed contract addresses (Nasun Devnet V6)
export const PREDICTION_PACKAGE_ID =
  '0x8c9423b4e64ee673171e46a21f0d41b9d58f67afecda23caf010bca78be05f0b';

export const PREDICTION_ADMIN_CAP =
  '0x5bca34f1f7ce08aa1a65aac760d3f50dbc920d71d73f1b2dd04545955968dc0b';

export const PREDICTION_GLOBAL_STATE =
  '0x80d04dfe103eb168769d0d2a2a14cf06ec4b41aed8b53cff5751d471c742245e';

// Type names
export const MARKET_TYPE = `${PREDICTION_PACKAGE_ID}::prediction_market::Market`;
export const POSITION_TYPE = `${PREDICTION_PACKAGE_ID}::prediction_market::Position`;
export const ADMIN_CAP_TYPE = `${PREDICTION_PACKAGE_ID}::prediction_market::AdminCap`;

// Price constants
export const MAX_PRICE = 10000; // 100% in basis points
export const PRICE_DECIMALS = 4;

// NUSDC (pado_tokens V6 package)
export const NUSDC_DECIMALS = 6;
export const NUSDC_TYPE =
  '0xd0e01761b2f822df9cd412af99d75d35c477d805b1636981acd15c4a5c0ab772::nusdc::NUSDC';

// Clock
export const CLOCK_ID = '0x6';

// Active markets (TODO: Create after V6 deployment)
export const TEST_MARKETS: string[] = [
  // Markets will be created after V6 contract deployment
];
