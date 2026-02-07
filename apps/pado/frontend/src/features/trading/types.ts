/**
 * Trading Types
 */

import type { ORDER_TYPE, SELF_MATCHING, ORDER_STATUS } from './constants';

export type OrderType = typeof ORDER_TYPE[keyof typeof ORDER_TYPE];
export type SelfMatchingOption = typeof SELF_MATCHING[keyof typeof SELF_MATCHING];
export type OrderStatus = typeof ORDER_STATUS[keyof typeof ORDER_STATUS];

// Pool 설정 타입
export interface TokenConfig {
  symbol: string;
  name: string;
  decimals: number;
  type: string | undefined;
}

export interface PoolConfig {
  id: string | undefined;
  baseToken: TokenConfig;
  quoteToken: TokenConfig;
  tickSize: number;
  lotSize: number;
  makerFeeBps: number;
  takerFeeBps: number;
}

export interface PlaceLimitOrderParams {
  price: bigint;         // 가격 (quote decimals)
  quantity: bigint;      // 수량 (base decimals)
  isBid: boolean;        // true = 매수, false = 매도
  orderType?: OrderType;
  selfMatchingOption?: SelfMatchingOption;
  expireTimestamp?: bigint; // 만료 시간 (ms)
  payWithDeep?: boolean;
  clientOrderId?: bigint;
}

export interface PlaceMarketOrderParams {
  quantity: bigint;      // 수량 (base decimals)
  isBid: boolean;        // true = 매수, false = 매도
  selfMatchingOption?: SelfMatchingOption;
  payWithDeep?: boolean;
  clientOrderId?: bigint;
}

export interface SwapParams {
  amount: bigint;        // 스왑할 양
  minOut: bigint;        // 최소 받을 양
  isBid: boolean;        // true = quote→base, false = base→quote
}

export interface OrderInfo {
  orderId: string;
  clientOrderId: bigint;
  price: bigint;
  originalQuantity: bigint;
  executedQuantity: bigint;
  remainingQuantity: bigint;
  isBid: boolean;
  status: OrderStatus;
  timestamp: bigint;
}

export interface DepositInfo {
  baseAmount: string;   // formatted (예: "0.5")
  quoteAmount: string;  // formatted (예: "50000")
  baseSymbol: string;   // 토큰 심볼 (예: "NBTC", "NASUN")
  quoteSymbol: string;  // 토큰 심볼 (예: "NUSDC")
}

export interface OrderExecutionInfo {
  executedQuantity: number;  // 체결된 base 수량 (formatted)
  executedQuote: number;     // 체결된 quote 수량 (formatted)
  remainingQuantity: number; // 미체결 수량 (formatted)
  avgPrice: number;          // 평균 체결 가격
  isBid: boolean;
  status: 'filled' | 'partial' | 'placed'; // 완전체결, 부분체결, 미체결
}

export interface TradeResult {
  success: boolean;
  digest?: string;
  error?: string;
  objectChanges?: any[]; // SuiObjectChange[]
  events?: any[];        // SuiEvent[]
  depositInfo?: DepositInfo; // 입금 금액 정보
  executionInfo?: OrderExecutionInfo; // 체결 정보
}

// Locked amount calculation: buy orders lock quote token, sell orders lock base token
export function calcLockedAmounts(orders: Array<{ price: number; quantity: number; isBid: boolean }>) {
  const lockedQuote = orders
    .filter((o) => o.isBid)
    .reduce((sum, o) => sum + o.price * o.quantity, 0);
  const lockedBase = orders
    .filter((o) => !o.isBid)
    .reduce((sum, o) => sum + o.quantity, 0);
  return { lockedQuote, lockedBase };
}
