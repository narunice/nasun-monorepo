/**
 * Perpetual Futures RPC Client
 * Fetches market and position data from on-chain
 * @module features/perp/lib/perp-client
 */

import { getSuiClient } from '../../../lib/sui-client';
import {
  PERP_PACKAGE_ID,
  PRICE_DECIMALS,
  MAINTENANCE_MARGIN_BPS,
  BPS,
  getRiskLevel,
  fromContractPrice,
  fromContractAmount,
} from '../constants';
import type {
  PerpMarket,
  PerpPosition,
  PositionWithMetrics,
  PerpMarketDisplay,
  RawPerpMarket,
  RawPerpPosition,
} from '../types';

// ===== Market Queries =====

/**
 * Fetch a PerpMarket by its object ID
 */
export async function fetchPerpMarket(marketId: string): Promise<PerpMarket | null> {
  if (!marketId) return null;

  const client = getSuiClient();

  try {
    const response = await client.getObject({
      id: marketId,
      options: {
        showContent: true,
      },
    });

    if (response.data?.content?.dataType !== 'moveObject') {
      return null;
    }

    const fields = response.data.content.fields as unknown as RawPerpMarket;
    return parseRawMarket(fields, marketId);
  } catch (error) {
    console.error('Error fetching perp market:', error);
    return null;
  }
}

/**
 * Fetch all PerpMarket objects
 */
export async function fetchAllPerpMarkets(): Promise<PerpMarket[]> {
  const client = getSuiClient();

  try {
    // Query all objects of type PerpMarket
    const response = await client.queryEvents({
      query: {
        MoveEventType: `${PERP_PACKAGE_ID}::perpetual::MarketCreated`,
      },
      limit: 50,
    });

    const marketIds = response.data.map((event) => {
      const parsed = event.parsedJson as { market_id: string };
      return parsed.market_id;
    });

    // Fetch all markets
    const markets = await Promise.all(
      marketIds.map((id) => fetchPerpMarket(id)),
    );

    return markets.filter((m): m is PerpMarket => m !== null);
  } catch (error) {
    console.error('Error fetching all perp markets:', error);
    return [];
  }
}

// ===== Position Queries =====

/**
 * Fetch all positions owned by an address
 */
export async function fetchUserPositions(
  owner: string,
): Promise<PerpPosition[]> {
  const client = getSuiClient();

  try {
    const response = await client.getOwnedObjects({
      owner,
      filter: {
        StructType: `${PERP_PACKAGE_ID}::perpetual::PerpPosition`,
      },
      options: {
        showContent: true,
      },
    });

    const positions: PerpPosition[] = [];

    for (const obj of response.data) {
      if (obj.data?.content?.dataType === 'moveObject') {
        const fields = obj.data.content.fields as unknown as RawPerpPosition;
        positions.push(parseRawPosition(fields));
      }
    }

    return positions;
  } catch (error) {
    console.error('Error fetching user positions:', error);
    return [];
  }
}

/**
 * Fetch a single position by ID
 */
export async function fetchPosition(
  positionId: string,
): Promise<PerpPosition | null> {
  const client = getSuiClient();

  try {
    const response = await client.getObject({
      id: positionId,
      options: {
        showContent: true,
      },
    });

    if (response.data?.content?.dataType !== 'moveObject') {
      return null;
    }

    const fields = response.data.content.fields as unknown as RawPerpPosition;
    return parseRawPosition(fields);
  } catch (error) {
    console.error('Error fetching position:', error);
    return null;
  }
}

/**
 * Fetch positions with computed metrics (P&L, margin ratio, etc.)
 */
export async function fetchUserPositionsWithMetrics(
  owner: string,
  currentPrices: Map<string, number>, // marketId -> price
): Promise<PositionWithMetrics[]> {
  const positions = await fetchUserPositions(owner);

  return positions.map((pos) => {
    const currentPrice = currentPrices.get(pos.marketId) || 0;
    return calculatePositionMetrics(pos, currentPrice);
  });
}

// ===== Oracle Queries =====

// Table ID within OracleRegistry (TODO: Update after V6 oracle redeployment)
const ORACLE_FEEDS_TABLE_ID =
  import.meta.env.VITE_ORACLE_FEEDS_TABLE_ID || '';

/**
 * Fetch oracle price for a symbol using dynamic field access
 * @param symbolId - 1=BTC, 2=ETH, 3=NASUN
 */
export async function fetchOraclePrice(symbolId: number): Promise<{
  price: number;
  timestamp: number;
  isFresh: boolean;
} | null> {
  const client = getSuiClient();

  try {
    // Access Table entries via dynamic fields
    const response = await client.getDynamicFieldObject({
      parentId: ORACLE_FEEDS_TABLE_ID,
      name: {
        type: 'u64',
        value: symbolId.toString(),
      },
    });

    if (response.data?.content?.dataType !== 'moveObject') {
      return null;
    }

    const fields = response.data.content.fields as {
      value: {
        fields: {
          price: string;
          timestamp: string;
          decimals: string;
        };
      };
    };

    const priceData = fields.value.fields;
    const price = Number(priceData.price) / PRICE_DECIMALS;
    const timestamp = Number(priceData.timestamp);
    const now = Date.now();
    const isFresh = now - timestamp < 2 * 60 * 1000; // 2 minute staleness

    return { price, timestamp, isFresh };
  } catch (error) {
    console.error('Error fetching oracle price:', error);
    return null;
  }
}

// ===== Parsing Functions =====

/**
 * Parse raw market data from RPC
 */
function parseRawMarket(raw: RawPerpMarket, marketId: string): PerpMarket {
  return {
    id: marketId,
    admin: raw.admin,
    baseSymbol: Number(raw.base_symbol),
    name: new TextDecoder().decode(new Uint8Array(raw.name)),
    maxLeverage: Number(raw.max_leverage),
    makerFeeBps: Number(raw.maker_fee_bps),
    takerFeeBps: Number(raw.taker_fee_bps),
    openInterestLong: BigInt(raw.open_interest_long),
    openInterestShort: BigInt(raw.open_interest_short),
    maxOpenInterest: BigInt(raw.max_open_interest),
    fundingRateValue: Number(raw.funding_rate_value),
    fundingRateNegative: raw.funding_rate_negative,
    cumulativeFundingValue: BigInt(raw.cumulative_funding_value),
    cumulativeFundingNegative: raw.cumulative_funding_negative,
    lastFundingTime: Number(raw.last_funding_time),
    insuranceFund: BigInt(raw.insurance_fund.value),
    feePool: BigInt(raw.fee_pool.value),
    isActive: raw.is_active,
    createdAt: Number(raw.created_at),
  };
}

/**
 * Parse raw position data from RPC
 */
function parseRawPosition(raw: RawPerpPosition): PerpPosition {
  return {
    id: raw.id.id,
    marketId: raw.market_id,
    owner: raw.owner,
    isLong: raw.is_long,
    size: BigInt(raw.size),
    entryPrice: BigInt(raw.entry_price),
    collateral: BigInt(raw.collateral.value),
    leverage: Number(raw.leverage),
    entryFundingValue: BigInt(raw.entry_funding_value),
    entryFundingNegative: raw.entry_funding_negative,
    realizedPnlValue: BigInt(raw.realized_pnl_value),
    realizedPnlNegative: raw.realized_pnl_negative,
    createdAt: Number(raw.created_at),
    lastUpdated: Number(raw.last_updated),
  };
}

// ===== Calculation Functions =====

/**
 * Calculate P&L for a position
 */
export function calculatePnl(
  position: PerpPosition,
  currentPrice: number,
): { value: number; isNegative: boolean } {
  const entryPrice = fromContractPrice(position.entryPrice);
  const size = Number(position.size) / PRICE_DECIMALS;

  if (position.isLong) {
    if (currentPrice >= entryPrice) {
      return { value: (currentPrice - entryPrice) * size, isNegative: false };
    } else {
      return { value: (entryPrice - currentPrice) * size, isNegative: true };
    }
  } else {
    // Short position
    if (entryPrice >= currentPrice) {
      return { value: (entryPrice - currentPrice) * size, isNegative: false };
    } else {
      return { value: (currentPrice - entryPrice) * size, isNegative: true };
    }
  }
}

/**
 * Calculate liquidation price for a position
 */
export function calculateLiquidationPrice(position: PerpPosition): number {
  const collateral = fromContractAmount(position.collateral);
  const entryPrice = fromContractPrice(position.entryPrice);
  const size = Number(position.size) / PRICE_DECIMALS;

  if (size === 0) return 0;

  const sizeFactor = collateral / size;
  const marginAdjustment = (sizeFactor * (BPS - MAINTENANCE_MARGIN_BPS)) / BPS;

  if (position.isLong) {
    return Math.max(0, entryPrice - marginAdjustment);
  } else {
    return entryPrice + marginAdjustment;
  }
}

/**
 * Calculate margin ratio in basis points
 */
export function calculateMarginRatio(
  position: PerpPosition,
  currentPrice: number,
): number {
  const collateral = fromContractAmount(position.collateral);
  const { value: pnlValue, isNegative: pnlNegative } = calculatePnl(
    position,
    currentPrice,
  );

  const equity = pnlNegative
    ? Math.max(0, collateral - pnlValue)
    : collateral + pnlValue;

  const size = Number(position.size) / PRICE_DECIMALS;
  const notional = size * currentPrice;

  if (notional === 0) return BPS * 100; // Max ratio

  return Math.floor((equity * BPS) / notional);
}

/**
 * Calculate full position metrics
 */
export function calculatePositionMetrics(
  position: PerpPosition,
  currentPrice: number,
): PositionWithMetrics {
  const { value: unrealizedPnl, isNegative: unrealizedPnlNegative } =
    calculatePnl(position, currentPrice);
  const marginRatio = calculateMarginRatio(position, currentPrice);
  const liquidationPrice = calculateLiquidationPrice(position);
  const riskLevel = getRiskLevel(marginRatio);

  const size = Number(position.size) / PRICE_DECIMALS;
  const notionalValue = size * currentPrice;
  const collateral = fromContractAmount(position.collateral);

  // ROE = P&L / Collateral * 100
  const roe =
    collateral > 0
      ? ((unrealizedPnlNegative ? -unrealizedPnl : unrealizedPnl) / collateral) *
        100
      : 0;

  return {
    ...position,
    currentPrice,
    unrealizedPnl,
    unrealizedPnlNegative,
    marginRatio,
    liquidationPrice,
    riskLevel,
    notionalValue,
    roe,
  };
}

/**
 * Convert market to display format
 */
export function toMarketDisplay(
  market: PerpMarket,
  currentPrice: number,
): PerpMarketDisplay {
  const symbolMap: Record<number, string> = {
    1: 'BTC',
    2: 'ETH',
    3: 'NASUN',
  };

  const fundingRatePercent =
    (market.fundingRateValue / BPS) * (market.fundingRateNegative ? -1 : 1);
  const fundingRateFormatted =
    (fundingRatePercent >= 0 ? '+' : '') + fundingRatePercent.toFixed(4) + '%';

  const oiLong = Number(market.openInterestLong) / PRICE_DECIMALS;
  const oiShort = Number(market.openInterestShort) / PRICE_DECIMALS;

  // Calculate next funding time (8 hours after last)
  const nextFundingTime = new Date(market.lastFundingTime + 8 * 60 * 60 * 1000);

  return {
    id: market.id,
    name: market.name,
    symbol: symbolMap[market.baseSymbol] || 'UNKNOWN',
    fundingRate: fundingRateFormatted,
    fundingRateValue: fundingRatePercent,
    nextFundingTime,
    openInterestLongUsd: oiLong * currentPrice,
    openInterestShortUsd: oiShort * currentPrice,
    totalOpenInterestUsd: (oiLong + oiShort) * currentPrice,
    maxLeverage: market.maxLeverage,
    takerFee: market.takerFeeBps / 100, // Convert to percentage
    makerFee: market.makerFeeBps / 100,
    isActive: market.isActive,
  };
}
