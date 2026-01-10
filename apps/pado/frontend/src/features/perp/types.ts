/**
 * Perpetual Futures DEX Types
 * @module features/perp/types
 */

import type { POSITION_SIDE, RISK_LEVEL } from './constants';

// ===== On-chain Types (Mirror Move structs) =====

/**
 * PerpMarket shared object
 * Represents a perpetual futures market configuration
 */
export interface PerpMarket {
  id: string;
  admin: string;
  /** Oracle symbol ID (1=BTC, 2=ETH, 3=NASUN) */
  baseSymbol: number;
  /** Market name (e.g., "BTC-PERP") */
  name: string;
  /** Maximum leverage allowed (default: 20) */
  maxLeverage: number;
  /** Maker fee in basis points */
  makerFeeBps: number;
  /** Taker fee in basis points */
  takerFeeBps: number;
  /** Total long open interest in base units */
  openInterestLong: bigint;
  /** Total short open interest in base units */
  openInterestShort: bigint;
  /** Maximum open interest cap per side */
  maxOpenInterest: bigint;
  /** Current funding rate value (BPS per 8h) */
  fundingRateValue: number;
  /** True if funding rate is negative */
  fundingRateNegative: boolean;
  /** Cumulative funding index value */
  cumulativeFundingValue: bigint;
  /** True if cumulative funding is negative */
  cumulativeFundingNegative: boolean;
  /** Last funding settlement timestamp */
  lastFundingTime: number;
  /** Insurance fund balance in NUSDC */
  insuranceFund: bigint;
  /** Accumulated trading fees in NUSDC */
  feePool: bigint;
  /** Market active status */
  isActive: boolean;
  /** Created timestamp */
  createdAt: number;
}

/**
 * PerpPosition owned object
 * Represents a user's perpetual position
 */
export interface PerpPosition {
  id: string;
  /** Market ID this position belongs to */
  marketId: string;
  /** Position owner address */
  owner: string;
  /** True = Long, False = Short */
  isLong: boolean;
  /** Position size in base units (8 decimals) */
  size: bigint;
  /** Average entry price (8 decimals) */
  entryPrice: bigint;
  /** Collateral deposited (NUSDC balance) */
  collateral: bigint;
  /** Leverage used (1-20) */
  leverage: number;
  /** Funding index at position open */
  entryFundingValue: bigint;
  /** True if entry funding was negative */
  entryFundingNegative: boolean;
  /** Accumulated realized P&L value */
  realizedPnlValue: bigint;
  /** True if realized P&L is negative */
  realizedPnlNegative: boolean;
  /** Created timestamp */
  createdAt: number;
  /** Last updated timestamp */
  lastUpdated: number;
}

// ===== Computed Types (Frontend) =====

/**
 * Position with computed P&L and risk metrics
 */
export interface PositionWithMetrics extends PerpPosition {
  /** Current market price */
  currentPrice: number;
  /** Unrealized P&L in NUSDC */
  unrealizedPnl: number;
  /** True if unrealized P&L is negative */
  unrealizedPnlNegative: boolean;
  /** Margin ratio in basis points */
  marginRatio: number;
  /** Liquidation price */
  liquidationPrice: number;
  /** Risk level based on margin ratio */
  riskLevel: (typeof RISK_LEVEL)[keyof typeof RISK_LEVEL];
  /** Position notional value in NUSDC */
  notionalValue: number;
  /** Return on equity percentage */
  roe: number;
}

/**
 * Market with human-readable values
 */
export interface PerpMarketDisplay {
  id: string;
  name: string;
  symbol: string; // "BTC", "ETH", etc.
  /** Formatted funding rate (e.g., "+0.01%" or "-0.02%") */
  fundingRate: string;
  /** Funding rate as number */
  fundingRateValue: number;
  /** Next funding time */
  nextFundingTime: Date;
  /** Open interest long in USD */
  openInterestLongUsd: number;
  /** Open interest short in USD */
  openInterestShortUsd: number;
  /** Total open interest in USD */
  totalOpenInterestUsd: number;
  /** Maximum leverage */
  maxLeverage: number;
  /** Taker fee percentage */
  takerFee: number;
  /** Maker fee percentage */
  makerFee: number;
  /** Is market active */
  isActive: boolean;
}

// ===== Input Types =====

/**
 * Parameters for opening a position
 */
export interface OpenPositionParams {
  /** Market object ID */
  marketId: string;
  /** True for Long, False for Short */
  isLong: boolean;
  /** Position size in base units */
  size: bigint;
  /** Leverage (1-20) */
  leverage: number;
  /** Collateral amount in NUSDC */
  collateralAmount: bigint;
  /** Current oracle price (8 decimals) */
  currentPrice: bigint;
}

/**
 * Parameters for closing a position
 */
export interface ClosePositionParams {
  /** Market object ID */
  marketId: string;
  /** Position object ID */
  positionId: string;
  /** Current oracle price (8 decimals) */
  currentPrice: bigint;
}

/**
 * Parameters for adding collateral
 */
export interface AddCollateralParams {
  /** Position object ID */
  positionId: string;
  /** Amount to add in NUSDC */
  amount: bigint;
  /** Current oracle price (8 decimals) */
  currentPrice: bigint;
}

/**
 * Parameters for removing collateral
 */
export interface RemoveCollateralParams {
  /** Market object ID */
  marketId: string;
  /** Position object ID */
  positionId: string;
  /** Amount to remove in NUSDC */
  amount: bigint;
  /** Current oracle price (8 decimals) */
  currentPrice: bigint;
}

// ===== Form Types =====

/**
 * Order form state
 */
export interface PerpOrderFormState {
  /** Selected side */
  side: (typeof POSITION_SIDE)[keyof typeof POSITION_SIDE];
  /** Size in USD or base units */
  size: string;
  /** Selected leverage */
  leverage: number;
  /** Collateral amount (auto-calculated or manual) */
  collateral: string;
  /** Take profit price (optional) */
  takeProfit?: string;
  /** Stop loss price (optional) */
  stopLoss?: string;
}

/**
 * Order preview with estimated values
 */
export interface OrderPreview {
  /** Estimated entry price */
  entryPrice: number;
  /** Position notional value */
  notionalValue: number;
  /** Required margin */
  requiredMargin: number;
  /** Estimated trading fee */
  fee: number;
  /** Estimated liquidation price */
  liquidationPrice: number;
  /** Max position size based on available balance */
  maxSize: number;
  /** Validation errors if any */
  errors: string[];
}

// ===== Event Types =====

/**
 * Position opened event
 */
export interface PositionOpenedEvent {
  positionId: string;
  marketId: string;
  owner: string;
  isLong: boolean;
  size: bigint;
  entryPrice: bigint;
  collateral: bigint;
  leverage: number;
  timestamp: number;
}

/**
 * Position closed event
 */
export interface PositionClosedEvent {
  positionId: string;
  marketId: string;
  owner: string;
  size: bigint;
  exitPrice: bigint;
  realizedPnlValue: bigint;
  realizedPnlNegative: boolean;
  timestamp: number;
}

// ===== API Response Types =====

/**
 * Raw market data from RPC
 */
export interface RawPerpMarket {
  id: { id: string };
  admin: string;
  base_symbol: string;
  name: number[];
  max_leverage: string;
  maker_fee_bps: string;
  taker_fee_bps: string;
  open_interest_long: string;
  open_interest_short: string;
  max_open_interest: string;
  funding_rate_value: string;
  funding_rate_negative: boolean;
  cumulative_funding_value: string;
  cumulative_funding_negative: boolean;
  last_funding_time: string;
  insurance_fund: { value: string };
  fee_pool: { value: string };
  is_active: boolean;
  created_at: string;
}

/**
 * Raw position data from RPC
 */
export interface RawPerpPosition {
  id: { id: string };
  market_id: string;
  owner: string;
  is_long: boolean;
  size: string;
  entry_price: string;
  collateral: { value: string };
  leverage: string;
  entry_funding_value: string;
  entry_funding_negative: boolean;
  realized_pnl_value: string;
  realized_pnl_negative: boolean;
  created_at: string;
  last_updated: string;
}
