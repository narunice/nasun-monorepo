/**
 * DeepBook V3 Utilities
 * Orderbook queries and trading functions
 */

import { Transaction, type TransactionObjectArgument } from '@mysten/sui/transactions';
import { getSuiClient } from './sui-client';
import { NETWORK_CONFIG, POOLS, TOKENS } from '../config/network';
import type { PoolConfig } from '../features/trading/types';
import { logOnce, logThrottled } from './logger';

// 기본 Pool (하위 호환)
const DEFAULT_POOL = POOLS.NBTC_NUSDC;

// Order type from DeepBook
export interface Order {
  orderId: string;
  price: bigint;
  quantity: bigint;
  isBid: boolean;
  owner: string;
  expireTimestamp: bigint;
}

// Level2 price level
export interface PriceLevel {
  price: number;
  quantity: number;
  total: number;
}

// Orderbook data
export interface Orderbook {
  bids: PriceLevel[];
  asks: PriceLevel[];
  spread: number;
  midPrice: number;
}

// Adaptive tick count for get_level2_ticks_from_mid devInspect.
// DeepBook's gas cost grows non-linearly with depth: ticks=25 ≈ 2M gas,
// ticks=50 ≈ 1.6B gas, ticks=100 exceeds devInspect budget on devnet.
// We start at the cheapest count that satisfies UI needs (25 levels per side
// is well above what the visible book renders) and only escalate if a caller
// hits the rare case where a small count returns no return values.
const TICK_FALLBACK_LADDER = [25, 50, 10];
const TICK_CACHE_KEY_PREFIX = 'pado:deepbook:ticks:';
const cachedSuccessfulTicks: Map<string, number> = new Map();

function loadCachedTicks(poolId: string): number | null {
  const inMemory = cachedSuccessfulTicks.get(poolId);
  if (inMemory !== undefined) return inMemory;
  try {
    const raw = globalThis.localStorage?.getItem(TICK_CACHE_KEY_PREFIX + poolId);
    if (!raw) return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || !TICK_FALLBACK_LADDER.includes(parsed)) return null;
    cachedSuccessfulTicks.set(poolId, parsed);
    return parsed;
  } catch {
    return null;
  }
}

function saveCachedTicks(poolId: string, ticks: number): void {
  cachedSuccessfulTicks.set(poolId, ticks);
  try {
    globalThis.localStorage?.setItem(TICK_CACHE_KEY_PREFIX + poolId, String(ticks));
  } catch {
    // localStorage unavailable (private mode / SSR) — in-memory cache still works
  }
}

function invalidateCachedTicks(poolId: string, ticks: number): void {
  if (cachedSuccessfulTicks.get(poolId) === ticks) {
    cachedSuccessfulTicks.delete(poolId);
    try {
      globalThis.localStorage?.removeItem(TICK_CACHE_KEY_PREFIX + poolId);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Query orderbook using get_level2_ticks_from_mid
 * Returns bid/ask prices and quantities
 * @param pool - Pool config (optional, defaults to NBTC/NUSDC)
 */
export async function getOrderbook(pool: PoolConfig = DEFAULT_POOL): Promise<Orderbook> {
  const client = getSuiClient();

  if (!pool.id || !pool.baseToken.type || !pool.quoteToken.type) {
    console.error('Pool configuration incomplete');
    return { bids: [], asks: [], spread: 0, midPrice: 0 };
  }

  const cached = loadCachedTicks(pool.id);
  const candidates = cached !== null
    ? [cached, ...TICK_FALLBACK_LADDER.filter((t) => t !== cached)]
    : [...TICK_FALLBACK_LADDER];

  let lastError: unknown = null;
  for (const ticks of candidates) {
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${NETWORK_CONFIG.deepbookPackage}::pool::get_level2_ticks_from_mid`,
        typeArguments: [
          pool.baseToken.type,
          pool.quoteToken.type,
        ],
        arguments: [
          tx.object(pool.id),
          tx.pure.u64(ticks),
          tx.object('0x6'), // Clock
        ],
      });

      const result = await client.devInspectTransactionBlock({
        sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
        transactionBlock: tx,
      });

      // devInspect returns failure status (not throw) on InsufficientGas. Detect
      // and fall back to a smaller tick count rather than returning empty book.
      const status = result.effects?.status;
      if (status?.status === 'failure') {
        const errMsg = status.error || '';
        if (errMsg.includes('InsufficientGas')) {
          invalidateCachedTicks(pool.id, ticks);
          lastError = new Error(`InsufficientGas at ticks=${ticks}`);
          continue;
        }
        // Non-gas failure (e.g. pool not found): surface immediately.
        throw new Error(`devInspect failure: ${errMsg}`);
      }

      if (!result.results || result.results.length === 0) {
        // Treat missing return data as a transport failure, not an empty book.
        // Real "empty orderbook" comes through as a successful call with 4
        // return vectors of length 0; falling through to the next candidate
        // (or surfacing the throw) avoids silently rendering an empty UI.
        lastError = new Error(`devInspect returned no results at ticks=${ticks}`);
        continue;
      }

      const returnValues = result.results[0]?.returnValues;
      if (!returnValues || returnValues.length < 4) {
        lastError = new Error(`devInspect returned malformed result at ticks=${ticks}`);
        continue;
      }

      saveCachedTicks(pool.id, ticks);

      // Parse the 4 vectors: bid_prices, bid_quantities, ask_prices, ask_quantities
      const bidPrices = parseU64Vector(returnValues[0][0]);
      const bidQuantities = parseU64Vector(returnValues[1][0]);
      const askPrices = parseU64Vector(returnValues[2][0]);
      const askQuantities = parseU64Vector(returnValues[3][0]);

      // Convert to PriceLevel format (with dynamic decimals)
      const bids = buildPriceLevels(bidPrices, bidQuantities, pool.quoteToken.decimals, pool.baseToken.decimals);
      const asks = buildPriceLevels(askPrices, askQuantities, pool.quoteToken.decimals, pool.baseToken.decimals);

      // Calculate spread and mid price
      const bestBid = bids.length > 0 ? bids[0].price : 0;
      const bestAsk = asks.length > 0 ? asks[0].price : 0;
      const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
      const midPrice = bestAsk > 0 && bestBid > 0 ? (bestAsk + bestBid) / 2 : 0;

      return { bids, asks, spread, midPrice };
    } catch (error) {
      lastError = error;
      // Network/transport errors: try next candidate as well in case intermittent
      continue;
    }
  }

  logOnce('deepbook-orderbook', 'warn', '[DeepBook] Orderbook unavailable (all tick fallbacks exhausted):', lastError);
  throw lastError ?? new Error('Orderbook query failed at all tick fallback levels');
}

// Maximum ULEB128 bytes for a u64 value (ceil(64/7) = 10)
const MAX_ULEB128_BYTES = 10;

/**
 * Read a ULEB128-encoded unsigned integer with bounded loop.
 * Returns the decoded value and number of bytes consumed.
 */
function readUleb128(bytes: number[], startOffset: number): { value: number; bytesRead: number } {
  let value = 0;
  let shift = 0;
  let bytesRead = 0;
  let offset = startOffset;

  while (offset < bytes.length && bytesRead < MAX_ULEB128_BYTES) {
    const byte = bytes[offset++];
    bytesRead++;
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value, bytesRead };
    shift += 7;
  }

  // Reached MAX_ULEB128_BYTES or end of buffer without termination
  logOnce('uleb128-unterminated', 'warn', 'ULEB128 decoding: unterminated or oversized encoding');
  return { value, bytesRead };
}

/**
 * Parse vector<u64> from BCS bytes
 * Vector format: [length as ULEB128] + [u64 values as little-endian]
 */
function parseU64Vector(bytes: number[]): bigint[] {
  if (!bytes || bytes.length === 0) return [];

  const result: bigint[] = [];
  const { value: length, bytesRead } = readUleb128(bytes, 0);
  let offset = bytesRead;

  // Read u64 values
  for (let i = 0; i < length && offset + 8 <= bytes.length; i++) {
    let value = 0n;
    for (let j = 0; j < 8; j++) {
      value |= BigInt(bytes[offset + j]) << BigInt(j * 8);
    }
    result.push(value);
    offset += 8;
  }

  return result;
}

/**
 * Build PriceLevel array from prices and quantities
 */
function buildPriceLevels(
  prices: bigint[],
  quantities: bigint[],
  quoteDecimals: number = TOKENS.NUSDC.decimals,
  baseDecimals: number = TOKENS.NBTC.decimals
): PriceLevel[] {
  const levels: PriceLevel[] = [];
  let cumulativeTotal = 0;

  for (let i = 0; i < prices.length && i < quantities.length; i++) {
    const price = formatPrice(prices[i], quoteDecimals);
    const quantity = formatQuantity(quantities[i], baseDecimals);
    cumulativeTotal += quantity;

    levels.push({
      price,
      quantity,
      total: cumulativeTotal,
    });
  }

  return levels;
}

/**
 * Format price from raw value (accounting for decimals)
 * @param rawPrice - Raw price value
 * @param decimals - Quote token decimals (default: NUSDC = 6)
 */
export function formatPrice(rawPrice: bigint, decimals: number = TOKENS.NUSDC.decimals): number {
  return Number(rawPrice) / Math.pow(10, decimals);
}

/**
 * Format quantity from raw value (accounting for decimals)
 * @param rawQuantity - Raw quantity value
 * @param decimals - Base token decimals (default: NBTC = 8)
 */
export function formatQuantity(rawQuantity: bigint, decimals: number = TOKENS.NBTC.decimals): number {
  return Number(rawQuantity) / Math.pow(10, decimals);
}

/**
 * Convert price to raw value
 * @param price - Human-readable price
 * @param decimals - Quote token decimals (default: NUSDC = 6)
 */
export function priceToRaw(price: number, decimals: number = TOKENS.NUSDC.decimals): bigint {
  // Use Math.round to avoid floating-point precision errors
  return BigInt(Math.round(price * Math.pow(10, decimals)));
}

/**
 * Convert quantity to raw value
 * @param quantity - Human-readable quantity
 * @param decimals - Base token decimals (default: NBTC = 8)
 */
export function quantityToRaw(quantity: number, decimals: number = TOKENS.NBTC.decimals): bigint {
  // Use Math.round to avoid floating-point precision errors
  // e.g., 0.018 * 10^8 = 1799999.9999999998 with floor, but 1800000 with round
  return BigInt(Math.round(quantity * Math.pow(10, decimals)));
}

// Token symbol → DeepBook pool used for "deposit-as-X" auto-swap.
// All Pado spot pools quote in NUSDC, so the deposit flow is always a
// base→quote swap. NUSDC has no entry (no swap needed).
const DEPOSIT_POOL_FOR: Record<string, PoolConfig | undefined> = {
  NBTC: POOLS.NBTC_NUSDC, // for fallback callers; NBTC normally deposits direct
  NETH: POOLS.NETH_NUSDC,
  NSOL: POOLS.NSOL_NUSDC,
  NSN:  POOLS.NASUN_NUSDC,
};

export function depositPoolFor(symbol: string): PoolConfig | undefined {
  return DEPOSIT_POOL_FOR[symbol];
}

/**
 * Conservative swap quote for the deposit flow.
 *
 * v1 strategy: use the best bid as the effective price (always equal to or
 * worse than a full bid-walk for sells), so `minQuoteOut` is safe even when
 * the book is fragmented. Marks `underestimateRisk` when the requested base
 * exceeds the best bid's depth so the UI can warn.
 *
 * v1.1: replace with full bid-walk for accurate large-order quotes.
 */
export interface SwapQuote {
  /** Expected NUSDC out (raw, 6-decimal) — best-bid based */
  expectedQuoteRaw: bigint;
  /** Min NUSDC out enforced in the PTB after slippage tolerance */
  minQuoteRaw: bigint;
  /** Effective price (quote per base, human float) used for expected */
  effectivePrice: number;
  /** Mid-price snapshot for reference */
  midPrice: number;
  /** Best-bid price (= effectivePrice for v1) */
  bestBidPrice: number;
  /** (mid - bestBid) / mid → sell-side execution loss vs mid */
  priceImpact: number;
  /** True if the best bid level cannot fully fill the requested base amount */
  underestimateRisk: boolean;
}

/**
 * Pure quote computation. Separated from RPC so unit tests can exercise the
 * decimal arithmetic and edge cases without mocking network calls.
 */
export function computeSwapQuote(args: {
  bids: PriceLevel[];
  midPrice: number;
  baseAmountRaw: bigint;
  baseDecimals: number;
  quoteDecimals: number;
  slippageBps: number;
}): SwapQuote | null {
  const { bids, midPrice, baseAmountRaw, baseDecimals, quoteDecimals, slippageBps } = args;
  if (baseAmountRaw <= 0n) return null;
  if (bids.length === 0 || midPrice === 0) return null;

  const bestBid = bids[0];
  const bestBidPrice = bestBid.price;
  if (bestBidPrice <= 0) return null;

  // Convert price (human float, scaled to quote decimals) into a bigint
  // multiplier. baseAmountRaw is in baseDecimals; we want quote in quoteDecimals.
  //   expectedQuoteRaw = baseAmountRaw * priceScaled / 10^baseDecimals
  // priceScaled = round(bestBidPrice * 10^quoteDecimals)
  const priceScaled = BigInt(Math.round(bestBidPrice * Math.pow(10, quoteDecimals)));
  const baseScale = 10n ** BigInt(baseDecimals);
  const expectedQuoteRaw = (baseAmountRaw * priceScaled) / baseScale;

  // minQuoteRaw enforced in PTB: floor(expected * (1 - slippage))
  const slippageScale = BigInt(Math.max(0, 10000 - slippageBps));
  const minQuoteRaw = (expectedQuoteRaw * slippageScale) / 10000n;

  const priceImpact = midPrice > 0
    ? Math.max(0, (midPrice - bestBidPrice) / midPrice)
    : 0;

  // bestBid.quantity is in human base units; convert to raw for comparison
  const bestBidBaseRaw = BigInt(Math.round(bestBid.quantity * Math.pow(10, baseDecimals)));
  const underestimateRisk = bestBidBaseRaw < baseAmountRaw;

  return {
    expectedQuoteRaw,
    minQuoteRaw,
    effectivePrice: bestBidPrice,
    midPrice,
    bestBidPrice,
    priceImpact,
    underestimateRisk,
  };
}

/**
 * Query DeepBook's on-chain swap simulation for exact output including fee penalty.
 * DeepBook charges takerFee * 1.25x from base input when not paying DEEP fees,
 * which reduces the effective base traded (and thus the quote output) in a way
 * that the client-side orderbook walk cannot accurately predict.
 *
 * Returns the exact quoteOut, or null on RPC failure.
 */
async function getOnChainSwapQuote(
  pool: PoolConfig,
  baseAmountRaw: bigint,
): Promise<bigint | null> {
  if (!pool.id || !pool.baseToken.type || !pool.quoteToken.type) return null;
  const client = getSuiClient();
  const tx = new Transaction();
  tx.moveCall({
    target: `${NETWORK_CONFIG.deepbookPackage}::pool::get_quote_quantity_out_input_fee`,
    typeArguments: [pool.baseToken.type, pool.quoteToken.type],
    arguments: [tx.object(pool.id), tx.pure.u64(baseAmountRaw), tx.object('0x6')],
  });
  try {
    const result = await client.devInspectTransactionBlock({
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      transactionBlock: tx,
    });
    const rv = result.results?.[0]?.returnValues;
    if (!rv || rv.length < 2) return null;
    // Returns (baseOut, quoteOut, deepRequired) — index 1 is quoteOut
    const quoteBytes = rv[1][0];
    let quoteOut = 0n;
    for (let j = 0; j < 8; j++) quoteOut |= BigInt(quoteBytes[j]) << BigInt(8 * j);
    return quoteOut;
  } catch {
    return null;
  }
}

export async function quoteBaseForQuote(
  pool: PoolConfig,
  baseAmountRaw: bigint,
  baseDecimals: number,
  quoteDecimals: number,
  slippageBps: number,
): Promise<SwapQuote | null> {
  const [{ bids, midPrice }, onChainQuoteOut] = await Promise.all([
    getOrderbook(pool),
    getOnChainSwapQuote(pool, baseAmountRaw),
  ]);

  // Use on-chain result as the source of truth for expectedQuoteRaw and minQuoteRaw.
  // The on-chain simulation accounts for the 12.5bps fee penalty on base input
  // and lot rounding, which the client-side orderbook walk cannot replicate.
  // If on-chain returns 0, the amount is below the minimum lot after fee deduction.
  if (onChainQuoteOut !== null) {
    if (onChainQuoteOut === 0n) return null;
    const slippageScale = BigInt(Math.max(0, 10000 - slippageBps));
    const minQuoteRaw = (onChainQuoteOut * slippageScale) / 10000n;

    // Derive display metrics from the orderbook walk (best-effort)
    const displayQuote = computeSwapQuote({ bids, midPrice, baseAmountRaw, baseDecimals, quoteDecimals, slippageBps });
    const effectivePrice = displayQuote?.effectivePrice ?? 0;
    const bestBidPrice = displayQuote?.bestBidPrice ?? 0;
    const priceImpact = displayQuote?.priceImpact ?? 0;
    const underestimateRisk = displayQuote?.underestimateRisk ?? false;

    return {
      expectedQuoteRaw: onChainQuoteOut,
      minQuoteRaw,
      effectivePrice,
      midPrice,
      bestBidPrice,
      priceImpact,
      underestimateRisk,
    };
  }

  // Fallback to client-side estimate if on-chain call fails
  return computeSwapQuote({ bids, midPrice, baseAmountRaw, baseDecimals, quoteDecimals, slippageBps });
}

/**
 * v1 slippage policy: 50bps default; bump to 100bps if price impact ≥ 0.5%.
 * UI surfaces this as the "recommended" preset; user may override.
 */
export function recommendedSlippageBps(quote: SwapQuote): number {
  return quote.priceImpact >= 0.005 ? 100 : 50;
}

/**
 * Append a `swap_exact_base_for_quote` move call to an existing PTB.
 *
 * Returns the three output coin TransactionArguments so callers can chain
 * them (e.g. transfer base/deep dust to sender, deposit quote into MA).
 *
 * Pre-flight (probe-deep-fee.ts) verified that Pado pools are whitelisted
 * (DEEP fee = 0), so callers may pass a `coin::zero<DEEP>` as `deepCoinArg`
 * without sourcing real DEEP from the user's wallet.
 */
export function appendSwapBaseForQuote(
  tx: Transaction,
  pool: PoolConfig,
  baseCoinArg: TransactionObjectArgument,
  deepCoinArg: TransactionObjectArgument,
  minQuoteRaw: bigint,
): [
  baseOut: TransactionObjectArgument,
  quoteOut: TransactionObjectArgument,
  deepOut: TransactionObjectArgument,
] {
  const poolLabel = `${pool.baseToken.symbol}/${pool.quoteToken.symbol}`;
  if (!pool.id) throw new Error(`Pool id missing for ${poolLabel}`);
  if (!pool.baseToken.type || !pool.quoteToken.type) {
    throw new Error(`Pool token types missing for ${poolLabel}`);
  }
  return tx.moveCall({
    target: `${NETWORK_CONFIG.deepbookPackage}::pool::swap_exact_base_for_quote`,
    typeArguments: [pool.baseToken.type, pool.quoteToken.type],
    arguments: [
      tx.object(pool.id),
      baseCoinArg,
      deepCoinArg,
      tx.pure.u64(minQuoteRaw),
      tx.object('0x6'), // Clock
    ],
  }) as unknown as [TransactionObjectArgument, TransactionObjectArgument, TransactionObjectArgument];
}

/**
 * Build swap transaction (base for quote)
 * Simpler than limit orders - no BalanceManager needed
 */
export function buildSwapBaseForQuote(
  _baseAmount: bigint,
  minQuoteOut: bigint,
  baseCoinId: string,
  deepCoinId: string,
): Transaction {
  const tx = new Transaction();

  const [baseOut, quoteOut, deepOut] = tx.moveCall({
    target: `${NETWORK_CONFIG.deepbookPackage}::pool::swap_exact_base_for_quote`,
    typeArguments: [
      TOKENS.NBTC.type!,
      TOKENS.NUSDC.type!,
    ],
    arguments: [
      tx.object(POOLS.NBTC_NUSDC.id!),
      tx.object(baseCoinId),
      tx.object(deepCoinId),
      tx.pure.u64(minQuoteOut),
      tx.object('0x6'), // Clock
    ],
  });

  // Transfer outputs to sender
  tx.transferObjects([baseOut, quoteOut, deepOut], tx.pure.address(''));

  return tx;
}

/**
 * Build swap transaction (quote for base)
 */
export function buildSwapQuoteForBase(
  _quoteAmount: bigint,
  minBaseOut: bigint,
  quoteCoinId: string,
  deepCoinId: string,
): Transaction {
  const tx = new Transaction();

  const [baseOut, quoteOut, deepOut] = tx.moveCall({
    target: `${NETWORK_CONFIG.deepbookPackage}::pool::swap_exact_quote_for_base`,
    typeArguments: [
      TOKENS.NBTC.type!,
      TOKENS.NUSDC.type!,
    ],
    arguments: [
      tx.object(POOLS.NBTC_NUSDC.id!),
      tx.object(quoteCoinId),
      tx.object(deepCoinId),
      tx.pure.u64(minBaseOut),
      tx.object('0x6'), // Clock
    ],
  });

  // Transfer outputs to sender
  tx.transferObjects([baseOut, quoteOut, deepOut], tx.pure.address(''));

  return tx;
}

/**
 * Get pool mid price from on-chain data
 * @param pool - Pool config (optional, defaults to NBTC/NUSDC)
 */
export async function getPoolMidPrice(pool: PoolConfig = DEFAULT_POOL): Promise<number> {
  const client = getSuiClient();

  if (!pool.id || !pool.baseToken.type || !pool.quoteToken.type) {
    console.error('Pool configuration incomplete');
    return 0;
  }

  try {
    const tx = new Transaction();

    tx.moveCall({
      target: `${NETWORK_CONFIG.deepbookPackage}::pool::mid_price`,
      typeArguments: [
        pool.baseToken.type,
        pool.quoteToken.type,
      ],
      arguments: [
        tx.object(pool.id),
        tx.object('0x6'), // Clock
      ],
    });

    const result = await client.devInspectTransactionBlock({
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      transactionBlock: tx,
    });

    if (result.results && result.results[0]?.returnValues?.[0]) {
      // Parse u64 from bytes
      const bytes = result.results[0].returnValues[0][0];
      const price = parseU64FromBytes(bytes);
      return formatPrice(BigInt(price), pool.quoteToken.decimals);
    }

    return 0;
  } catch (error) {
    logOnce('deepbook-midprice', 'warn', '[DeepBook] Mid price unavailable (pool may not exist on-chain):', error);
    return 0;
  }
}

/**
 * Parse u64 from little-endian bytes
 */
function parseU64FromBytes(bytes: number[]): number {
  let value = 0n;
  for (let i = 0; i < 8 && i < bytes.length; i++) {
    value += BigInt(bytes[i]) << BigInt(i * 8);
  }
  return Number(value);
}

// Open order info
export interface OpenOrder {
  orderId: string;
  price: number;
  quantity: number;
  isBid: boolean;
}

/**
 * Get open orders for a BalanceManager
 * @param balanceManagerId - BalanceManager object ID
 * @param pool - Pool config (optional, defaults to NBTC/NUSDC)
 */
export async function getOpenOrders(
  balanceManagerId: string,
  pool: PoolConfig = DEFAULT_POOL
): Promise<OpenOrder[]> {
  const client = getSuiClient();

  if (!pool.id || !pool.baseToken.type || !pool.quoteToken.type) {
    console.error('Pool configuration incomplete');
    return [];
  }

  try {
    const tx = new Transaction();

    tx.moveCall({
      target: `${NETWORK_CONFIG.deepbookPackage}::pool::get_account_order_details`,
      typeArguments: [
        pool.baseToken.type,
        pool.quoteToken.type,
      ],
      arguments: [
        tx.object(pool.id),
        tx.object(balanceManagerId),
      ],
    });

    const result = await client.devInspectTransactionBlock({
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      transactionBlock: tx,
    });

    if (!result.results || result.results.length === 0) {
      return [];
    }

    const returnValues = result.results[0]?.returnValues;
    if (!returnValues || returnValues.length === 0) {
      return [];
    }

    // Parse vector<Order> from BCS (with dynamic decimals)
    const orders = parseOrderVector(returnValues[0][0], pool.quoteToken.decimals, pool.baseToken.decimals);
    return orders;
  } catch (error) {
    logThrottled('deepbook-open-orders', 'error', 60_000, '[DeepBook] Failed to get open orders:', error);
    return [];
  }
}

/**
 * Parse vector<Order> from BCS bytes
 * Order struct (from DeepBook V3):
 *   balance_manager_id: ID (32 bytes)
 *   order_id: u128 (16 bytes) - contains is_bid (bit 127) and price (bits 64-126)
 *   client_order_id: u64 (8 bytes)
 *   quantity: u64 (8 bytes) - remaining quantity
 *   filled_quantity: u64 (8 bytes)
 *   fee_is_deep: bool (1 byte)
 *   order_deep_price: { asset_is_base: bool (1), deep_per_asset: u64 (8) }
 *   epoch: u64 (8 bytes)
 *   status: u8 (1 byte)
 *   expire_timestamp: u64 (8 bytes)
 * Total: 99 bytes per order
 */
function parseOrderVector(
  bytes: number[],
  quoteDecimals: number = TOKENS.NUSDC.decimals,
  baseDecimals: number = TOKENS.NBTC.decimals
): OpenOrder[] {
  if (!bytes || bytes.length === 0) return [];

  const orders: OpenOrder[] = [];
  const { value: length, bytesRead } = readUleb128(bytes, 0);
  let offset = bytesRead;

  // Parse each order (99 bytes each)
  for (let i = 0; i < length && offset + 99 <= bytes.length; i++) {
    try {
      // balance_manager_id: ID (32 bytes) - skip
      offset += 32;

      // order_id: u128 (16 bytes)
      let orderId = 0n;
      for (let j = 0; j < 16; j++) {
        orderId |= BigInt(bytes[offset + j]) << BigInt(j * 8);
      }
      offset += 16;

      // Extract is_bid and price from order_id
      // Bit 127: 0 = bid, 1 = ask
      // Bits 64-126: price
      const isBid = (orderId >> 127n) === 0n;
      const rawPrice = (orderId >> 64n) & ((1n << 63n) - 1n);

      // client_order_id: u64 (8 bytes) - skip
      offset += 8;

      // quantity: u64 (8 bytes) - remaining quantity
      let rawQuantity = 0n;
      for (let j = 0; j < 8; j++) {
        rawQuantity |= BigInt(bytes[offset + j]) << BigInt(j * 8);
      }
      offset += 8;

      // filled_quantity: u64 (8 bytes) - skip
      offset += 8;

      // fee_is_deep: bool (1 byte) - skip
      offset += 1;

      // order_deep_price: { asset_is_base: bool (1), deep_per_asset: u64 (8) } - skip
      offset += 9;

      // epoch: u64 (8 bytes) - skip
      offset += 8;

      // status: u8 (1 byte) - skip
      offset += 1;

      // expire_timestamp: u64 (8 bytes) - skip
      offset += 8;

      // 수량이 0이면 이미 체결된 주문이므로 제외
      const quantity = formatQuantity(rawQuantity, baseDecimals);
      const price = formatPrice(rawPrice, quoteDecimals);

      if (quantity > 0) {
        orders.push({
          orderId: orderId.toString(),
          price,
          quantity,
          isBid,
        });
      }
    } catch (e) {
      console.error('[parseOrder] error:', e);
      break;
    }
  }

  return orders;
}

// BalanceManager 잔고 정보 (base/quote 기준)
export interface BalanceManagerBalance {
  base: number;
  quote: number;
}

/**
 * BalanceManager의 Base/Quote 토큰 잔고 조회
 * @param balanceManagerId - BalanceManager object ID
 * @param pool - Pool config (optional, defaults to NBTC/NUSDC)
 */
export async function getBalanceManagerBalances(
  balanceManagerId: string,
  pool: PoolConfig = DEFAULT_POOL
): Promise<BalanceManagerBalance> {
  const client = getSuiClient();

  if (!pool.baseToken.type || !pool.quoteToken.type) {
    console.error('Pool configuration incomplete');
    return { base: 0, quote: 0 };
  }

  try {
    // Batch base + quote balance queries into a single devInspect call
    const tx = new Transaction();
    tx.moveCall({
      target: `${NETWORK_CONFIG.deepbookPackage}::balance_manager::balance`,
      typeArguments: [pool.baseToken.type],
      arguments: [tx.object(balanceManagerId)],
    });
    tx.moveCall({
      target: `${NETWORK_CONFIG.deepbookPackage}::balance_manager::balance`,
      typeArguments: [pool.quoteToken.type],
      arguments: [tx.object(balanceManagerId)],
    });

    const result = await client.devInspectTransactionBlock({
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      transactionBlock: tx,
    });

    let baseBalance = 0;
    if (result.results?.[0]?.returnValues?.[0]) {
      const bytes = result.results[0].returnValues[0][0];
      baseBalance = parseU64FromBytes(bytes);
    }

    let quoteBalance = 0;
    if (result.results?.[1]?.returnValues?.[0]) {
      const bytes = result.results[1].returnValues[0][0];
      quoteBalance = parseU64FromBytes(bytes);
    }

    return {
      base: baseBalance / Math.pow(10, pool.baseToken.decimals),
      quote: quoteBalance / Math.pow(10, pool.quoteToken.decimals),
    };
  } catch (error) {
    logThrottled('deepbook-balances', 'error', 60_000, '[DeepBook] Failed to get BalanceManager balances:', error);
    throw error;
  }
}

// ============================================================
// Validation Helpers (사용자 친화적인 에러 메시지용)
// ============================================================

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

/**
 * 최소 수량 계산 (lotSize 기반)
 * @example NASUN/NUSDC 풀: 0.01 NASUN
 */
export function getMinQuantity(pool: PoolConfig): number {
  return pool.lotSize / Math.pow(10, pool.baseToken.decimals);
}

/**
 * 최소 가격 단위 계산 (tickSize 기반)
 * @example NASUN/NUSDC 풀: $0.001
 */
export function getMinPrice(pool: PoolConfig): number {
  return pool.tickSize / Math.pow(10, pool.quoteToken.decimals);
}

/** Snap price down to nearest tick multiple (integer arithmetic to avoid float errors) */
export function snapToTick(price: number, pool: PoolConfig): number {
  if (price <= 0) return 0;
  const decimals = pool.quoteToken.decimals;
  const priceRaw = Math.round(price * Math.pow(10, decimals));
  const snapped = priceRaw - (priceRaw % pool.tickSize);
  if (snapped === 0 && priceRaw > 0) {
    return pool.tickSize / Math.pow(10, decimals);
  }
  return snapped / Math.pow(10, decimals);
}

/** Snap quantity down to nearest lot-size multiple (integer arithmetic to avoid float errors) */
export function snapToLot(quantity: number, pool: PoolConfig): number {
  if (quantity <= 0) return 0;
  const decimals = pool.baseToken.decimals;
  const qtyRaw = Math.round(quantity * Math.pow(10, decimals));
  const snapped = qtyRaw - (qtyRaw % pool.lotSize);
  if (snapped === 0 && qtyRaw > 0) {
    return pool.lotSize / Math.pow(10, decimals);
  }
  return snapped / Math.pow(10, decimals);
}

/**
 * 최소 수량을 사람이 읽기 좋은 형태로 포맷
 * @example "0.01 NASUN"
 */
export function formatMinQuantity(pool: PoolConfig): string {
  const minQty = getMinQuantity(pool);
  return `${minQty} ${pool.baseToken.symbol}`;
}

/**
 * 최소 가격을 사람이 읽기 좋은 형태로 포맷
 * @example "$0.001"
 */
export function formatMinPrice(pool: PoolConfig): string {
  const minPrice = getMinPrice(pool);
  return `$${minPrice}`;
}

/**
 * 수량 유효성 검증
 * - 0보다 커야 함
 * - lotSize의 배수여야 함
 */
export function validateQuantity(amount: number, pool: PoolConfig): ValidationResult {
  if (!amount || amount <= 0) {
    return { valid: false, message: 'Enter quantity to continue' };
  }

  // Integer arithmetic to avoid floating-point modulo errors
  // e.g. 0.00100 % 0.00001 in JS can produce non-zero due to IEEE 754
  const amountRaw = Math.round(amount * Math.pow(10, pool.baseToken.decimals));
  if (amountRaw % pool.lotSize !== 0) {
    const minQty = getMinQuantity(pool);
    return {
      valid: false,
      message: `Quantity: min ${minQty}, increments of ${minQty} ${pool.baseToken.symbol}`,
    };
  }

  return { valid: true };
}

/**
 * 가격 유효성 검증
 * - 0보다 커야 함
 * - tickSize의 배수여야 함
 */
export function validatePrice(price: number, pool: PoolConfig): ValidationResult {
  if (!price || price <= 0) {
    return { valid: false, message: 'Enter price to continue' };
  }

  // Integer arithmetic to avoid floating-point modulo errors
  // e.g. 64900.0 % 0.1 in JS produces 0.0999... instead of 0
  const priceRaw = Math.round(price * Math.pow(10, pool.quoteToken.decimals));
  if (priceRaw % pool.tickSize !== 0) {
    const minPrice = getMinPrice(pool);
    return {
      valid: false,
      message: `Price: min $${minPrice}, increments of $${minPrice}`,
    };
  }

  return { valid: true };
}

/**
 * 주문 전체 유효성 검증 (가격 + 수량)
 */
export function validateOrder(
  price: number,
  amount: number,
  pool: PoolConfig
): ValidationResult {
  const priceValidation = validatePrice(price, pool);
  if (!priceValidation.valid) {
    return priceValidation;
  }

  const quantityValidation = validateQuantity(amount, pool);
  if (!quantityValidation.valid) {
    return quantityValidation;
  }

  return { valid: true };
}
