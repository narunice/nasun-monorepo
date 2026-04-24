import devnetIds from '../../../devnet-ids.json';

// Single source of truth for on-chain IDs. Sync with apps/gostop/devnet-ids.json.

export const GOSTOP_NETWORK = devnetIds.network;
export const GOSTOP_CHAIN_ID = devnetIds.chainId;
export const GOSTOP_RPC_URL = devnetIds.rpc;
export const GOSTOP_DEPLOYER = devnetIds.deployer;

export const NUSDC_TYPE = devnetIds.tokens.nusdcType;
export const NUSDC_FAUCET_ID = devnetIds.tokens.tokenFaucet;

export const BANKROLL_PACKAGE_ID = devnetIds.bankrollPool.packageId;
export const BANKROLL_POOL_ID = devnetIds.bankrollPool.bankrollPool;

export const LOTTERY_PACKAGE_ID = devnetIds.lottery.packageId;
// Original package id is stable across upgrades; required for event type
// queries (Move event type strings reference the original package id even
// after `nasun client upgrade` mints a new package id).
export const LOTTERY_ORIGINAL_PACKAGE_ID =
  devnetIds.lottery.originalPackageId ?? devnetIds.lottery.packageId;
export const LOTTERY_REGISTRY_ID = devnetIds.lottery.registry;
export const LOTTERY_ADMIN_CAP_ID = devnetIds.lottery.adminCap;

export const LOTTERY_NUMBERS_COUNT = devnetIds.lottery.numbersCount; // 5
export const LOTTERY_MAX_NUMBER = devnetIds.lottery.maxNumber;       // 25
export const LOTTERY_MAX_TICKETS_PER_ADDRESS = devnetIds.lottery.maxTicketsPerAddress; // 300
export const LOTTERY_TICKET_PRICE = BigInt(devnetIds.lottery.ticketPriceNusdc); // 5_000_000 (6 decimals)
export const LOTTERY_CLAIM_WINDOW_MS = devnetIds.lottery.claimWindowMs;
export const LOTTERY_GAME_ID = devnetIds.lottery.gameId;

// Ticket struct type is stable across upgrades (originalPackageId).
export const TICKET_TYPE = `${LOTTERY_ORIGINAL_PACKAGE_ID}::lottery::Ticket`;
export const ROUND_CREATED_EVENT_TYPE = `${LOTTERY_ORIGINAL_PACKAGE_ID}::lottery::RoundCreated`;
export const PRIZE_CLAIMED_EVENT_TYPE = `${LOTTERY_ORIGINAL_PACKAGE_ID}::lottery::PrizeClaimed`;
export const ROUND_SETTLED_EVENT_TYPE = `${LOTTERY_ORIGINAL_PACKAGE_ID}::lottery::RoundSettled`;
export const TICKET_PURCHASED_EVENT_TYPE = `${LOTTERY_ORIGINAL_PACKAGE_ID}::lottery::TicketPurchased`;

export const SUI_CLOCK_ID = '0x6';
export const SUI_RANDOM_ID = '0x8';

export const ROUND_STATUS = {
  OPEN: 0,
  CLOSED: 1,
  DRAWN: 2,
  SETTLED: 3,
} as const;
export type RoundStatus = (typeof ROUND_STATUS)[keyof typeof ROUND_STATUS];
