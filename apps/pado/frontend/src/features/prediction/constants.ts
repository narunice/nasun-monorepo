/**
 * Prediction Market Constants
 * Updated: 2026-01-03 (New Markets with valid close dates)
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

// Active markets (created 2026-01-03 with valid close dates)
export const TEST_MARKETS: string[] = [
  '0x860a90a42ee611c5740b4a4e74fcadd301f877991c7f47fffb318f6ca9520c96', // BTC $150k by March 2026 (closes 2026-03-01)
  '0xf0d8f14b7f9015139d0e5a03ab54b11a2a8cb52c91587559fc1212c7a7b67c64', // TikTok Ban by March 2026 (closes 2026-03-01)
  '0xc78bffa99153bdb1a43f350f8b4244d3e4f0e91365f425f288ec3f31fec8363f', // Russia-Ukraine Ceasefire by June 2026 (closes 2026-06-30)
  '0x9a214b8a6ddac338e71d8f8495da51f07db6de5a37dc46354d32dc98b34fcbd1', // ETH $10k by December 2026 (closes 2026-12-31)
];
