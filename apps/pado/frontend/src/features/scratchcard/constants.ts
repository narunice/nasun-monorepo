/**
 * Scratchcard Constants
 */
import {
  SCRATCHCARD,
  NUSDC_TYPE as DEVNET_NUSDC_TYPE,
} from '@nasun/devnet-config';

// Contract IDs
export const SCRATCHCARD_PACKAGE_ID = SCRATCHCARD.packageId;
export const SCRATCHCARD_POOL_ID = SCRATCHCARD.pool;
export const SCRATCHCARD_ADMIN_CAP_ID = SCRATCHCARD.adminCap;

// Sui system objects
export const SUI_RANDOM_ID = '0x8';
export const CLOCK_ID = '0x6';

// NUSDC type
export const NUSDC_TYPE = DEVNET_NUSDC_TYPE;

// Game constants (must match Move contract)
export const CARD_PRICE = 1_000_000n; // 1 NUSDC (6 decimals)
export const CARD_PRICE_DISPLAY = 1; // For UI display
export const MAX_MULTIPLIER = 100;
export const MAX_PRIZE = 100_000_000n; // 100 NUSDC
export const POOL_MIN_BALANCE = 500_000_000n; // 500 NUSDC
export const MAX_DAILY_CARDS = 1000;
export const PER_ADDRESS_SOFT_LIMIT = 10; // Frontend-only soft limit

// On-chain type strings
export const SCRATCHCARD_POOL_TYPE = `${SCRATCHCARD_PACKAGE_ID}::scratchcard::ScratchCardPool`;
export const SCRATCHCARD_TYPE = `${SCRATCHCARD_PACKAGE_ID}::scratchcard::ScratchCard`;
export const ADMIN_CAP_TYPE = `${SCRATCHCARD_PACKAGE_ID}::scratchcard::AdminCap`;

// Prize table (matches Move contract thresholds)
export const PRIZE_TIERS = [
  { label: 'Lose', multiplier: 0, probability: '80.50%', threshold: 0 },
  { label: 'Even', multiplier: 1, probability: '10.00%', threshold: 8050 },
  { label: '2x', multiplier: 2, probability: '4.00%', threshold: 9050 },
  { label: '5x', multiplier: 5, probability: '3.00%', threshold: 9450 },
  { label: '10x', multiplier: 10, probability: '1.50%', threshold: 9750 },
  { label: '20x', multiplier: 20, probability: '0.80%', threshold: 9900 },
  { label: '50x', multiplier: 50, probability: '0.15%', threshold: 9980 },
  { label: '100x', multiplier: 100, probability: '0.05%', threshold: 9995 },
] as const;

// Transaction sync delay (wait for RPC indexing)
export const TX_SYNC_DELAY_MS = 1500;
