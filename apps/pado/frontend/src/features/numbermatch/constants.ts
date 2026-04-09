/**
 * Number Match Constants
 */
import {
  NUMBERMATCH,
  NUMBERMATCH_ORIGINAL_PACKAGE_ID as DEVNET_NUMBERMATCH_ORIGINAL_PACKAGE_ID,
  NUSDC_TYPE as DEVNET_NUSDC_TYPE,
} from '@nasun/devnet-config';

// Contract IDs
export const NUMBERMATCH_PACKAGE_ID = NUMBERMATCH.packageId;
export const NUMBERMATCH_ORIGINAL_PACKAGE_ID = DEVNET_NUMBERMATCH_ORIGINAL_PACKAGE_ID;
export const NUMBERMATCH_POOL_ID = NUMBERMATCH.pool;
export const NUMBERMATCH_ADMIN_CAP_ID = NUMBERMATCH.adminCap;

// Sui system objects
export const SUI_RANDOM_ID = '0x8';
export const CLOCK_ID = '0x6';

// NUSDC type
export const NUSDC_TYPE = DEVNET_NUSDC_TYPE;

// On-chain type strings (use original package ID -- immutable across upgrades)
export const ADMIN_CAP_TYPE = `${NUMBERMATCH_ORIGINAL_PACKAGE_ID}::numbermatch::AdminCap`;
export const NUMBERMATCH_POOL_TYPE = `${NUMBERMATCH_ORIGINAL_PACKAGE_ID}::numbermatch::NumberMatchPool`;

// Game constants (must match Move contract)
export const MIN_NUMBER = 1;
export const MAX_NUMBER = 5;
export const POOL_SIZE = MAX_NUMBER - MIN_NUMBER + 1;
export const MAX_PICKS = 3;
export const PRICE_PER_PICK = 5_000_000n; // 5 NUSDC (6 decimals)
export const PRICE_PER_PICK_DISPLAY = 5; // For UI display

// Payout constants
export const WIN_PAYOUT_BASE = 15_000_000n; // 15 NUSDC
export const PAYOUT_PER_PICK = 1_000_000n;  // 1 NUSDC per pick
export const MAX_PAYOUT = 18_000_000n;       // 18 NUSDC (3 picks win)

// Pool
export const POOL_MIN_BALANCE = 500_000_000n; // 500 NUSDC
export const PER_ADDRESS_SOFT_LIMIT = 20; // Frontend-only advisory limit

// Payout table for UI display
export const PAYOUT_TABLE = [
  { picks: 1, cost: 5, winRate: '20%', winMult: '3.2x', winPayout: 16, lossRefund: 1 },
  { picks: 2, cost: 10, winRate: '40%', winMult: '1.7x', winPayout: 17, lossRefund: 2 },
  { picks: 3, cost: 15, winRate: '60%', winMult: '1.2x', winPayout: 18, lossRefund: 3 },
] as const;

// Transaction sync delay (wait for RPC indexing)
export const TX_SYNC_DELAY_MS = 1500;
