import { LOTTERY, LOTTERY_ORIGINAL_PACKAGE_ID, NUSDC_TYPE as DEVNET_NUSDC_TYPE } from '@nasun/devnet-config';

// Lottery Package deployed on Nasun Devnet (v2 - Multi-Tier)
// IDs imported from @nasun/devnet-config for centralized management
export const LOTTERY_PACKAGE_ID = LOTTERY.packageId;
export const LOTTERY_REGISTRY_ID = LOTTERY.registry;
export const LOTTERY_ADMIN_CAP_ID = LOTTERY.adminCap;
export const LOTTERY_UPGRADE_CAP_ID = LOTTERY.upgradeCap;

// Sui Random object (singleton, same across all Sui networks)
export const SUI_RANDOM_ID = '0x8';

// Clock object
export const CLOCK_ID = '0x6';

// Game constants (must match Move contract)
export const NUMBERS_COUNT = 5;
export const MAX_NUMBER = 32;
export const TICKET_PRICE = 5_000_000n; // 5 NUSDC (6 decimals)
export const MAX_TICKETS_PER_ADDRESS = 100;

// Prize distribution (basis points)
export const PRIZE_POOL_BPS = 7000; // 70%
export const ROLLOVER_BPS = 2000; // 20%
export const TREASURY_BPS = 1000; // 10%

// Multi-tier prize distribution within PRIZE_POOL_BPS (70%)
export const TIER1_BPS = 6000; // Jackpot (5 match): 60% of 70% = 42% total
export const TIER2_BPS = 2500; // 2nd (4 match): 25% of 70% = 17.5% total
export const TIER3_BPS = 1500; // 3rd (3 match): 15% of 70% = 10.5% total

// Prize tier identifiers
export const PRIZE_TIER = {
  NONE: 0,
  JACKPOT: 1, // 5 numbers match
  SECOND: 2, // 4 numbers match
  THIRD: 3, // 3 numbers match
} as const;

export type PrizeTier = (typeof PRIZE_TIER)[keyof typeof PRIZE_TIER];

// Round status
export const ROUND_STATUS = {
  OPEN: 0,
  CLOSED: 1,
  DRAWN: 2,
  SETTLED: 3,
} as const;

// NUSDC type (from @nasun/devnet-config)
export const NUSDC_TYPE = DEVNET_NUSDC_TYPE;

// On-chain type strings (use original package ID -- immutable across upgrades)
export const LOTTERY_ROUND_TYPE = `${LOTTERY_ORIGINAL_PACKAGE_ID}::lottery::LotteryRound`;
export const TICKET_TYPE = `${LOTTERY_ORIGINAL_PACKAGE_ID}::lottery::Ticket`;
export const ADMIN_CAP_TYPE = `${LOTTERY_ORIGINAL_PACKAGE_ID}::lottery::AdminCap`;
