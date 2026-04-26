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

// ===== Scratch Card =====
export const SCRATCH_PACKAGE_ID = devnetIds.scratchcard.packageId;
export const SCRATCH_ORIGINAL_PACKAGE_ID =
  devnetIds.scratchcard.originalPackageId ?? devnetIds.scratchcard.packageId;
export const SCRATCH_REGISTRY_ID = devnetIds.scratchcard.registry;
export const SCRATCH_CARD_PRICE = BigInt(devnetIds.scratchcard.cardPriceNusdc); // 5_000_000
export const SCRATCH_MAX_PRIZE = BigInt(devnetIds.scratchcard.maxPrizeNusdc);   // 500_000_000
export const SCRATCH_MAX_BULK_COUNT = devnetIds.scratchcard.maxBulkCount;       // 10
export const SCRATCH_CARD_TYPE = devnetIds.scratchcard.sessionType;
export const SCRATCH_PURCHASED_EVENT_TYPE = devnetIds.scratchcard.purchasedEventType;
export const SCRATCH_GAME_ID = devnetIds.scratchcard.gameId;

// ===== Number Match =====
export const NM_PACKAGE_ID = devnetIds.numbermatch.packageId;
export const NM_ORIGINAL_PACKAGE_ID =
  devnetIds.numbermatch.originalPackageId ?? devnetIds.numbermatch.packageId;
export const NM_REGISTRY_ID = devnetIds.numbermatch.registry;
export const NM_PRICE_PER_PICK = BigInt(devnetIds.numbermatch.pricePerPickNusdc); // 5_000_000
export const NM_MAX_PICKS = devnetIds.numbermatch.maxPicks;           // 3
export const NM_MIN_NUMBER = devnetIds.numbermatch.minNumber;         // 1
export const NM_MAX_NUMBER = devnetIds.numbermatch.maxNumber;         // 5
export const NM_MAX_PAYOUT = BigInt(devnetIds.numbermatch.maxPayoutNusdc); // 18_000_000
export const NM_PLAYED_EVENT_TYPE = devnetIds.numbermatch.playedEventType;
export const NM_GAME_ID = devnetIds.numbermatch.gameId;

// ===== Mines =====
export const MINES_PACKAGE_ID = devnetIds.mines.packageId;
export const MINES_ORIGINAL_PACKAGE_ID =
  devnetIds.mines.originalPackageId ?? devnetIds.mines.packageId;
export const MINES_REGISTRY_ID = devnetIds.mines.registry;
export const MINES_GRID_SIZE = devnetIds.mines.gridSize;            // 25
export const MINES_MIN_MINES = devnetIds.mines.mineCountRange[0];   // 1
export const MINES_MAX_MINES = devnetIds.mines.mineCountRange[1];   // 24
export const MINES_HOUSE_EDGE_BPS = devnetIds.mines.houseEdgeBps;   // 300
export const MINES_MAX_SINGLE_PAYOUT = BigInt(devnetIds.mines.maxSinglePayout); // 100_000_000
export const MINES_SESSION_TYPE = devnetIds.mines.sessionType;
export const MINES_SESSION_CREATED_EVENT_TYPE = devnetIds.mines.sessionCreatedEventType;
export const MINES_CELL_REVEALED_EVENT_TYPE = devnetIds.mines.cellRevealedEventType;
export const MINES_SESSION_FINISHED_EVENT_TYPE = devnetIds.mines.sessionFinishedEventType;
export const MINES_GAME_ID = devnetIds.mines.gameId;

// ===== Crash =====
// `crash` may be absent in dev/staging devnet-ids when the C2 build gate is
// disabled. Guard reads so the module never throws at import time; Crash
// code paths are only reachable when the gate is on, where the IDs exist.
const crashIds = (devnetIds as { crash?: Record<string, unknown> }).crash;
function crashStr(key: string): string {
  const v = crashIds?.[key];
  return typeof v === 'string' ? v : '';
}
function crashNum(key: string): number {
  const v = crashIds?.[key];
  return typeof v === 'number' ? v : 0;
}
function crashBig(key: string): bigint {
  const v = crashIds?.[key];
  if (typeof v === 'string' || typeof v === 'number') {
    try {
      return BigInt(v);
    } catch {
      return 0n;
    }
  }
  return 0n;
}
export const CRASH_PACKAGE_ID = crashStr('packageId');
export const CRASH_ORIGINAL_PACKAGE_ID =
  crashStr('originalPackageId') || crashStr('packageId');
export const CRASH_REGISTRY_ID = crashStr('registry');
export const CRASH_GAME_ID = crashNum('gameId');
export const CRASH_MIN_BET = crashBig('minBetNusdc'); // 1_000_000
export const CRASH_MAX_BET = crashBig('maxBetNusdc'); // 400_000_000 (400 NUSDC)
export const CRASH_MAX_SINGLE_PAYOUT = crashBig('maxSinglePayout');
export const CRASH_HOUSE_EDGE_BPS = crashNum('houseEdgeBps');

// Build-time crash gate. Single source of truth — App.tsx and HomePage.tsx
// import from here instead of reading the env var locally.
export const ENABLE_CRASH = import.meta.env.VITE_ENABLE_CRASH === 'true';

export const SUI_CLOCK_ID = '0x6';
export const SUI_RANDOM_ID = '0x8';

export const ROUND_STATUS = {
  OPEN: 0,
  CLOSED: 1,
  DRAWN: 2,
  SETTLED: 3,
} as const;
export type RoundStatus = (typeof ROUND_STATUS)[keyof typeof ROUND_STATUS];
