/**
 * DeepBook V3 Utilities
 * Orderbook queries and trading functions
 */

import { Transaction } from '@mysten/sui/transactions';
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
        tx.pure.u64(100), // ticks (number of price levels to fetch per side)
        tx.object('0x6'), // Clock
      ],
    });

    const result = await client.devInspectTransactionBlock({
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      transactionBlock: tx,
    });

    if (!result.results || result.results.length === 0) {
      return { bids: [], asks: [], spread: 0, midPrice: 0 };
    }

    const returnValues = result.results[0]?.returnValues;
    if (!returnValues || returnValues.length < 4) {
      return { bids: [], asks: [], spread: 0, midPrice: 0 };
    }

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
    logOnce('deepbook-orderbook', 'warn', '[DeepBook] Orderbook unavailable (pool may not exist on-chain):', error);
    throw error;
  }
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
    const price = formatPriceWithDecimals(prices[i], quoteDecimals);
    const quantity = formatQuantityWithDecimals(quantities[i], baseDecimals);
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
 * Format price with explicit decimals
 */
function formatPriceWithDecimals(rawPrice: bigint, decimals: number): number {
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
 * Format quantity with explicit decimals
 */
function formatQuantityWithDecimals(rawQuantity: bigint, decimals: number): number {
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
    // Base 토큰 잔고 조회
    const baseTx = new Transaction();
    baseTx.moveCall({
      target: `${NETWORK_CONFIG.deepbookPackage}::balance_manager::balance`,
      typeArguments: [pool.baseToken.type],
      arguments: [baseTx.object(balanceManagerId)],
    });

    const baseResult = await client.devInspectTransactionBlock({
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      transactionBlock: baseTx,
    });

    let baseBalance = 0;
    if (baseResult.results?.[0]?.returnValues?.[0]) {
      const bytes = baseResult.results[0].returnValues[0][0];
      baseBalance = parseU64FromBytes(bytes);
    }

    // Quote 토큰 잔고 조회
    const quoteTx = new Transaction();
    quoteTx.moveCall({
      target: `${NETWORK_CONFIG.deepbookPackage}::balance_manager::balance`,
      typeArguments: [pool.quoteToken.type],
      arguments: [quoteTx.object(balanceManagerId)],
    });

    const quoteResult = await client.devInspectTransactionBlock({
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      transactionBlock: quoteTx,
    });

    let quoteBalance = 0;
    if (quoteResult.results?.[0]?.returnValues?.[0]) {
      const bytes = quoteResult.results[0].returnValues[0][0];
      quoteBalance = parseU64FromBytes(bytes);
    }

    return {
      base: baseBalance / Math.pow(10, pool.baseToken.decimals),
      quote: quoteBalance / Math.pow(10, pool.quoteToken.decimals),
    };
  } catch (error) {
    logThrottled('deepbook-balances', 'error', 60_000, '[DeepBook] Failed to get BalanceManager balances:', error);
    return { base: 0, quote: 0 };
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
