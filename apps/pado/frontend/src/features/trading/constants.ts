/**
 * DeepBook V3 Trading Constants
 */

// Order Types (restrictions)
export const ORDER_TYPE = {
  NO_RESTRICTION: 0,      // 주문 제한 없음
  IMMEDIATE_OR_CANCEL: 1, // 즉시 체결 또는 취소 (IOC)
  FILL_OR_KILL: 2,        // 전량 체결 또는 취소 (FOK)
  POST_ONLY: 3,           // 메이커 전용
} as const;

// Self Matching Options
export const SELF_MATCHING = {
  ALLOWED: 0,       // 자체 체결 허용
  CANCEL_TAKER: 1,  // 테이커 주문 취소
  CANCEL_MAKER: 2,  // 메이커 주문 취소
} as const;

// Order Status
export const ORDER_STATUS = {
  LIVE: 0,
  PARTIALLY_FILLED: 1,
  FILLED: 2,
  CANCELED: 3,
  EXPIRED: 4,
} as const;

// Price bounds
export const PRICE = {
  MIN: 1n,
  MAX: (1n << 63n) - 1n,  // 2^63 - 1
} as const;

// Clock object ID
export const CLOCK_ID = '0x6';

// Native token (NASUN/SUI) type identifier
export const NATIVE_TOKEN_TYPE = '0x2::sui::SUI';

// Gas reserve: keep 0.1 NASUN (100_000_000 SOE at 9 decimals) for TX fees
export const GAS_RESERVE_RAW = 100_000_000n;
export const GAS_RESERVE_HUMAN = 0.1;
