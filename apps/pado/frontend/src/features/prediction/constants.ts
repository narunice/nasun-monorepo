/**
 * Prediction Market Constants
 */

// Deployed contract addresses (Nasun Devnet)
export const PREDICTION_PACKAGE_ID =
  '0xc585b0b99bc4552de542a465c4b42575fa9ee2f1d56895260efc4a7c65baea89';

export const PREDICTION_ADMIN_CAP =
  '0x906d0edc8137d419b14248f69bc9bd4c29023666cb62756476109a0ad8f315f9';

export const PREDICTION_GLOBAL_STATE =
  '0xdae9480159fb2a616e085c85ae9e908358fd635dc49e5a2b98ea8211d476863c';

// Type names
export const MARKET_TYPE = `${PREDICTION_PACKAGE_ID}::prediction_market::Market`;
export const POSITION_TYPE = `${PREDICTION_PACKAGE_ID}::prediction_market::Position`;
export const ADMIN_CAP_TYPE = `${PREDICTION_PACKAGE_ID}::prediction_market::AdminCap`;

// Price constants
export const MAX_PRICE = 10000; // 100% in basis points
export const PRICE_DECIMALS = 4;

// NUSDC
export const NUSDC_DECIMALS = 6;
export const NUSDC_TYPE =
  '0xfdd1e75f22a7680ea3b1e29eed397b0fbf06838273aaec77001dcfc101d09976::nusdc::NUSDC';

// Clock
export const CLOCK_ID = '0x6';

// Test markets (for development)
export const TEST_MARKETS = [
  '0x739cf64abf2ef089027fbf20bd6b5b8ad1ccfa1236a6d8f2aa7e73c4fb1439e8', // BTC $150k
  '0x9fe47195b3d8898175ceb5d6b84f4274b74cf6ac4f6bbc3ba7724ee8a55f2bc8', // TikTok Ban (Politics)
  '0x4ec3822a8644372da192260e4e6784c31c39f63f7025aff1190850153067267b', // HUNTR/X Grammy (Entertainment)
  '0x48d89468066cc41b353094345c38c2e92d7377c3658ab968f27a52d49fe72721', // Russia-Ukraine Ceasefire (Geopolitics)
];
