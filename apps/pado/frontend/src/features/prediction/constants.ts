/**
 * Prediction Market Constants
 * IDs imported from @nasun/devnet-config for centralized management
 */

import { PREDICTION, NUSDC_TYPE as DEVNET_NUSDC_TYPE } from '@nasun/devnet-config';

// Deployed contract addresses (from @nasun/devnet-config)
export const PREDICTION_PACKAGE_ID = PREDICTION.packageId;
export const PREDICTION_ADMIN_CAP = PREDICTION.adminCap;
export const PREDICTION_GLOBAL_STATE = PREDICTION.globalState;

// Type names
export const MARKET_TYPE = `${PREDICTION_PACKAGE_ID}::prediction_market::Market`;
export const POSITION_TYPE = `${PREDICTION_PACKAGE_ID}::prediction_market::Position`;
export const ADMIN_CAP_TYPE = `${PREDICTION_PACKAGE_ID}::prediction_market::AdminCap`;

// Price constants
export const MAX_PRICE = 10000; // 100% in basis points
export const PRICE_DECIMALS = 4;

// NUSDC (from @nasun/devnet-config)
export const NUSDC_DECIMALS = 6;
export const NUSDC_TYPE = DEVNET_NUSDC_TYPE;

// Clock
export const CLOCK_ID = '0x6';

// Active markets (TODO: Create after V6 deployment)
export const TEST_MARKETS: string[] = [
  // Markets will be created after V6 contract deployment
];
