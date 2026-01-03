/**
 * Prediction Market Constants
 * Updated: 2026-01-03 (Devnet Genesis Redeployment)
 */

// Deployed contract addresses (Nasun Devnet)
export const PREDICTION_PACKAGE_ID =
  '0x8928903e412cfa1f974ffce1993dd21b381ed02f32a6d142116b1d5089f90903';

export const PREDICTION_ADMIN_CAP =
  '0x38a29029ec9e80779e2027c4a77b4c76060b6dc2dd55da64d4d952285774be0a';

export const PREDICTION_GLOBAL_STATE =
  '0x29d793422053324f90cbdd4050290118613be68edf5826f187ca6b47ebac8d71';

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
  '0x508ba1bda666f93e72543ebcce14075d08ac089c455fca51592bc1ef1c826489::nusdc::NUSDC';

// Clock
export const CLOCK_ID = '0x6';

// Test markets (created 2026-01-03)
export const TEST_MARKETS: string[] = [
  '0xb5939eb9f586d27c3f3512f0f5dc727ffba07ba5189a8fb966aca1a186b576dc', // BTC $150k by March 2026
  '0x948c1978a76fdd6fb3e3b899ae3a921630257d44398733f539dce8fbe70e0cde', // TikTok Ban by March 2026
  '0x20647b33d2b9cc0d60981d23890781d74aba27ebcc315a7003d70a1bb619f036', // Russia-Ukraine Ceasefire by June 2026
  '0xd3e138209e3c382d03da6bfbd21a451f62ee67e5a087ea140b8afce42b485b13', // ETH $10k by December 2026
];
