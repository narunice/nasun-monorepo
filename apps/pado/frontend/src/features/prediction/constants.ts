/**
 * Prediction Market Constants
 *
 * IDs imported from @nasun/devnet-config for centralized management.
 * Caps mirror the deployed Move contract's constants — keep in sync.
 * (See plan §4.1 single-source-of-truth checklist; if Move caps are tuned
 * after gas dry-run, mirror the change here.)
 */

import { PREDICTION, NUSDC_TYPE as DEVNET_NUSDC_TYPE } from '@nasun/devnet-config';

// Deployed contract addresses (from @nasun/devnet-config)
export const PREDICTION_PACKAGE_ID = PREDICTION.packageId;
export const PREDICTION_ADMIN_CAP = PREDICTION.adminCap;

// Admin multisig address (acts as resolver for all markets). For dev, use the
// deployer/admin account from devnet-config. Pre-launch this becomes the real
// multisig address generated via team key ceremony.
import { ADMIN_ADDRESS } from '@nasun/devnet-config';
export const ADMIN_MULTISIG_ADDRESS: string = ADMIN_ADDRESS;

// Type names
export const MARKET_TYPE = `${PREDICTION_PACKAGE_ID}::prediction_market::Market`;
export const POSITION_TYPE = `${PREDICTION_PACKAGE_ID}::prediction_market::Position`;
export const ADMIN_CAP_TYPE = `${PREDICTION_PACKAGE_ID}::prediction_market::AdminCap`;

// Event type identifiers
export const MARKET_CREATED_EVENT = `${PREDICTION_PACKAGE_ID}::prediction_market::MarketCreated`;
export const ORDER_PLACED_EVENT = `${PREDICTION_PACKAGE_ID}::prediction_market::OrderPlaced`;
export const ORDER_FILLED_EVENT = `${PREDICTION_PACKAGE_ID}::prediction_market::OrderFilled`;
export const ORDER_CANCELLED_EVENT = `${PREDICTION_PACKAGE_ID}::prediction_market::OrderCancelled`;
export const MARKET_RESOLVED_EVENT = `${PREDICTION_PACKAGE_ID}::prediction_market::MarketResolved`;
export const MARKET_CANCELLED_EVENT = `${PREDICTION_PACKAGE_ID}::prediction_market::MarketCancelled`;

// Price constants (basis points)
export const MAX_PRICE = 10000;       // 100%
export const PRICE_DECIMALS = 4;

// Caps mirroring Move contract (round-6 plan §1.4).
// If Move caps are reduced after gas dry-run, mirror here.
export const MAX_WALK_LEVELS = 10;
export const MAX_FIFO_PER_LEVEL = 20;
export const MAX_PRICE_LEVELS_PER_SIDE = 200;
export const MAX_PAYMENT_AMOUNT_BASE = 100_000_000_000n; // 100k NUSDC at 6 decimals
export const MAX_MINT_AMOUNT_BASE = 100_000_000_000n;

// NUSDC
export const NUSDC_DECIMALS = 6;
export const NUSDC_TYPE = DEVNET_NUSDC_TYPE;

// Clock
export const CLOCK_ID = '0x6';

// Active markets (empty — markets discovered via on-chain events)
export const TEST_MARKETS: string[] = [];
