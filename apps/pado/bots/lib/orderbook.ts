/**
 * Orderbook Query Module
 *
 * Queries DeepBook V3 orderbook to get best bid/ask prices.
 * Uses MARKET config for pool and token types.
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import {
  DEEPBOOK_PACKAGE,
  MARKET,
  CLOCK_ID,
  timestamp,
} from './config.js';

export interface OrderbookLevel {
  price: number;
  quantity: number;
}

export interface OrderbookState {
  bestBid: number;
  bestAsk: number;
  midPrice: number;
  spread: number;
  hasBids: boolean;
  hasAsks: boolean;
}

export interface FullOrderbookState extends OrderbookState {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
}

export async function getOrderbookState(client: SuiClient): Promise<OrderbookState> {
  try {
    const tx = new Transaction();

    tx.moveCall({
      target: `${DEEPBOOK_PACKAGE}::pool::get_level2_ticks_from_mid`,
      typeArguments: [MARKET.baseType, MARKET.quoteType],
      arguments: [
        tx.object(MARKET.poolId),
        tx.pure.u64(5),
        tx.object(CLOCK_ID),
      ],
    });

    const result = await client.devInspectTransactionBlock({
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      transactionBlock: tx,
    });

    if (!result.results || result.results.length === 0) {
      return emptyOrderbookState();
    }

    const returnValues = result.results[0]?.returnValues;
    if (!returnValues || returnValues.length < 4) {
      return emptyOrderbookState();
    }

    const bidPrices = parseU64Vector(returnValues[0][0]);
    const askPrices = parseU64Vector(returnValues[2][0]);

    const bestBid = bidPrices.length > 0 ? formatPrice(bidPrices[0]) : 0;
    const bestAsk = askPrices.length > 0 ? formatPrice(askPrices[0]) : 0;

    const hasBids = bestBid > 0;
    const hasAsks = bestAsk > 0;
    const midPrice = hasBids && hasAsks ? (bestBid + bestAsk) / 2 : 0;
    const spread = hasBids && hasAsks ? bestAsk - bestBid : 0;

    return { bestBid, bestAsk, midPrice, spread, hasBids, hasAsks };
  } catch (error) {
    console.error(`[${timestamp()}] Failed to query orderbook:`, error instanceof Error ? error.message : error);
    return emptyOrderbookState();
  }
}

function emptyOrderbookState(): OrderbookState {
  return { bestBid: 0, bestAsk: 0, midPrice: 0, spread: 0, hasBids: false, hasAsks: false };
}

function emptyFullOrderbookState(): FullOrderbookState {
  return { ...emptyOrderbookState(), bids: [], asks: [] };
}

export async function getFullOrderbookState(client: SuiClient): Promise<FullOrderbookState> {
  try {
    const tx = new Transaction();

    tx.moveCall({
      target: `${DEEPBOOK_PACKAGE}::pool::get_level2_ticks_from_mid`,
      typeArguments: [MARKET.baseType, MARKET.quoteType],
      arguments: [
        tx.object(MARKET.poolId),
        tx.pure.u64(50),
        tx.object(CLOCK_ID),
      ],
    });

    const result = await client.devInspectTransactionBlock({
      sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      transactionBlock: tx,
    });

    if (!result.results || result.results.length === 0) {
      return emptyFullOrderbookState();
    }

    const returnValues = result.results[0]?.returnValues;
    if (!returnValues || returnValues.length < 4) {
      return emptyFullOrderbookState();
    }

    const bidPrices = parseU64Vector(returnValues[0][0]);
    const bidQuantities = parseU64Vector(returnValues[1][0]);
    const askPrices = parseU64Vector(returnValues[2][0]);
    const askQuantities = parseU64Vector(returnValues[3][0]);

    const bids: OrderbookLevel[] = [];
    for (let i = 0; i < bidPrices.length && i < bidQuantities.length; i++) {
      bids.push({ price: formatPrice(bidPrices[i]), quantity: formatQuantity(bidQuantities[i]) });
    }

    const asks: OrderbookLevel[] = [];
    for (let i = 0; i < askPrices.length && i < askQuantities.length; i++) {
      asks.push({ price: formatPrice(askPrices[i]), quantity: formatQuantity(askQuantities[i]) });
    }

    const bestBid = bids.length > 0 ? bids[0].price : 0;
    const bestAsk = asks.length > 0 ? asks[0].price : 0;
    const hasBids = bestBid > 0;
    const hasAsks = bestAsk > 0;
    const midPrice = hasBids && hasAsks ? (bestBid + bestAsk) / 2 : 0;
    const spread = hasBids && hasAsks ? bestAsk - bestBid : 0;

    return { bestBid, bestAsk, midPrice, spread, hasBids, hasAsks, bids, asks };
  } catch (error) {
    console.error(`[${timestamp()}] Failed to query full orderbook:`, error instanceof Error ? error.message : error);
    return emptyFullOrderbookState();
  }
}

function parseU64Vector(bytes: number[]): bigint[] {
  if (!bytes || bytes.length === 0) return [];

  const result: bigint[] = [];
  let offset = 0;

  let length = 0;
  let shift = 0;
  while (offset < bytes.length) {
    const byte = bytes[offset++];
    length |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }

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

function formatPrice(rawPrice: bigint): number {
  return Number(rawPrice) / Math.pow(10, MARKET.quoteDecimals);
}

function formatQuantity(rawQuantity: bigint): number {
  return Number(rawQuantity) / Math.pow(10, MARKET.baseDecimals);
}
