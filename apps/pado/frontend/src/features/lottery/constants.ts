// Lottery Package deployed on Nasun Devnet (v2 - Multi-Tier)
export const LOTTERY_PACKAGE_ID =
  '0x8dce08316436ed3fa8c4a183895101ee4a4c4eb8e1dcd19e121b46ee5e256538';

export const LOTTERY_REGISTRY_ID =
  '0x56e1875df39be66f3c591678ff75866b6c44637c4b84e4c2767926f738ea7f16';

export const LOTTERY_ADMIN_CAP_ID =
  '0xf60cb648dc721bc14b794914518732e809efc7ac471ad1e1213706d209447d68';

export const LOTTERY_UPGRADE_CAP_ID =
  '0xacd8378d0c184155abf3f782c83de51830a5f8b964b60ea3406cb2213854d1d0';

// Sui Random object (singleton, same across all Sui networks)
export const SUI_RANDOM_ID = '0x8';

// Clock object
export const CLOCK_ID = '0x6';

// Game constants (must match Move contract)
export const NUMBERS_COUNT = 5;
export const MAX_NUMBER = 32;
export const TICKET_PRICE = 1_000_000n; // 1 NUSDC (6 decimals)
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

// NUSDC type
export const NUSDC_TYPE =
  '0xc84727af62147f35ccf070f521e441f48be9325ab0a1b56225f361f0bc266bb8::nusdc::NUSDC';

// Lottery module types
export const LOTTERY_ROUND_TYPE = `${LOTTERY_PACKAGE_ID}::lottery::LotteryRound`;
export const TICKET_TYPE = `${LOTTERY_PACKAGE_ID}::lottery::Ticket`;
