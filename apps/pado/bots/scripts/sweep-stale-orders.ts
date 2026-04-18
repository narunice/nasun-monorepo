/**
 * sweep-stale-orders.ts
 *
 * One-shot script to clear stale orders from the NBTC/NUSDC orderbook
 * that are priced far above/below the current market price.
 *
 * Strategy:
 *   - BUY (IOC): consume all stale asks above market price
 *   - SELL (IOC): consume all stale bids above market price
 *
 * Usage:
 *   LP_MARKET=NBTC LP_PRIVATE_KEY=<key> pnpm tsx scripts/sweep-stale-orders.ts
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';

import {
  RPC_URL,
  MARKET,
  DEEPBOOK_PACKAGE,
  CLOCK_ID,
  ORDER_TYPE,
  SELF_MATCHING,
  priceToRaw,
  quantityToRaw,
  rawToPrice,
  rawToQuantity,
  roundToTickSize,
  roundToLotSize,
  timestamp,
} from '../lib/config.js';
import { getFullOrderbookState } from '../lib/orderbook.js';
import { findBalanceManager } from '../lib/balance-manager.js';
import { fetchPrice } from '../lib/price-source.js';
import { executeTransaction } from '../lib/order-manager.js';

const SWEEP_ABOVE_BPS = 30; // sweep asks/bids more than 30 bps from mid

async function main() {
  const privateKeyRaw = process.env.LP_PRIVATE_KEY;
  if (!privateKeyRaw) throw new Error('LP_PRIVATE_KEY required');

  const { secretKey } = decodeSuiPrivateKey(privateKeyRaw);
  const keypair = Ed25519Keypair.fromSecretKey(secretKey);
  const address = keypair.getPublicKey().toSuiAddress();
  const client = new SuiClient({ url: RPC_URL });

  console.log(`[${timestamp()}] Sweep script — market: ${MARKET.name}`);
  console.log(`[${timestamp()}] Address: ${address}`);

  // Find BalanceManager
  const bmId = await findBalanceManager(client, address);
  if (!bmId) throw new Error('No BalanceManager found for this address');
  console.log(`[${timestamp()}] BalanceManager: ${bmId}`);

  // Fetch current price and orderbook
  const midPrice = await fetchPrice();
  console.log(`[${timestamp()}] Mid price (Binance): $${midPrice.toLocaleString()}`);

  const ob = await getFullOrderbookState(client);
  console.log(`[${timestamp()}] Orderbook — bestBid: $${ob.bestBid.toLocaleString()}, bestAsk: $${ob.bestAsk.toLocaleString()}`);

  const sweepThreshold = SWEEP_ABOVE_BPS / 10000;
  const maxNormalAsk = midPrice * (1 + sweepThreshold); // asks below this are "normal"
  const minNormalBid = midPrice * (1 - sweepThreshold); // bids above this are "normal"

  // Sweep asks: BUY at a very high price (IOC) to consume all stale asks
  const SWEEP_BUY_PRICE = 999_999;  // above any realistic ask price including $738k anomaly
  const SWEEP_SELL_PRICE = 1;

  // Quantity to sweep: use large size to consume stale orders
  // Bot BM has thousands of NBTC/NUSDC, so 100 NBTC each side is safe
  const SWEEP_QUANTITY = 100; // base token units

  const sweepBuyPriceRaw = roundToTickSize(priceToRaw(SWEEP_BUY_PRICE));
  const sweepSellPriceRaw = roundToTickSize(priceToRaw(SWEEP_SELL_PRICE));
  const sweepQuantityRaw = roundToLotSize(quantityToRaw(SWEEP_QUANTITY));

  if (ob.bestAsk > maxNormalAsk) {
    console.log(`[${timestamp()}] Stale ask detected at $${ob.bestAsk.toLocaleString()} (>${(sweepThreshold * 100).toFixed(2)}% above mid)`);
    console.log(`[${timestamp()}] Placing IOC BUY at $${SWEEP_BUY_PRICE.toLocaleString()} to consume all stale asks...`);

    const tx = new Transaction();
    const tradeProof = tx.moveCall({
      target: `${DEEPBOOK_PACKAGE}::balance_manager::generate_proof_as_owner`,
      arguments: [tx.object(bmId)],
    });

    tx.moveCall({
      target: `${DEEPBOOK_PACKAGE}::pool::place_limit_order`,
      typeArguments: [MARKET.baseType, MARKET.quoteType],
      arguments: [
        tx.object(MARKET.poolId),
        tx.object(bmId),
        tradeProof,
        tx.pure.u64(BigInt(Date.now())),         // client_order_id
        tx.pure.u8(ORDER_TYPE.IMMEDIATE_OR_CANCEL),
        tx.pure.u8(SELF_MATCHING.CANCEL_TAKER),
        tx.pure.u64(sweepBuyPriceRaw),
        tx.pure.u64(sweepQuantityRaw),
        tx.pure.bool(true),                      // isBid = buy
        tx.pure.bool(false),
        tx.pure.u64(BigInt(Date.now() + 60000)),  // 1 min expiry (IOC ignores this anyway)
        tx.object(CLOCK_ID),
      ],
    });

    const result = await executeTransaction(client, keypair, tx);
    if (result.success) {
      console.log(`[${timestamp()}] BUY sweep executed (tx: ${result.digest?.slice(0, 10)}...)`);
    } else {
      console.error(`[${timestamp()}] BUY sweep failed: ${result.error}`);
    }
  } else {
    console.log(`[${timestamp()}] No stale asks detected (bestAsk $${ob.bestAsk.toLocaleString()} within normal range)`);
  }

  // Sweep bids: SELL at a very low price (IOC) to consume all stale bids above mid
  if (ob.bestBid > minNormalBid + midPrice * sweepThreshold) {
    console.log(`[${timestamp()}] Stale bid detected at $${ob.bestBid.toLocaleString()} (>${(sweepThreshold * 100).toFixed(2)}% above mid)`);
    console.log(`[${timestamp()}] Placing IOC SELL at $${SWEEP_SELL_PRICE} to consume all stale bids...`);

    const tx2 = new Transaction();
    const tradeProof2 = tx2.moveCall({
      target: `${DEEPBOOK_PACKAGE}::balance_manager::generate_proof_as_owner`,
      arguments: [tx2.object(bmId)],
    });

    tx2.moveCall({
      target: `${DEEPBOOK_PACKAGE}::pool::place_limit_order`,
      typeArguments: [MARKET.baseType, MARKET.quoteType],
      arguments: [
        tx2.object(MARKET.poolId),
        tx2.object(bmId),
        tradeProof2,
        tx2.pure.u64(BigInt(Date.now()) + 1n),
        tx2.pure.u8(ORDER_TYPE.IMMEDIATE_OR_CANCEL),
        tx2.pure.u8(SELF_MATCHING.CANCEL_TAKER),
        tx2.pure.u64(sweepSellPriceRaw),
        tx2.pure.u64(sweepQuantityRaw),
        tx2.pure.bool(false),                     // isBid = sell
        tx2.pure.bool(false),
        tx2.pure.u64(BigInt(Date.now() + 60000)),
        tx2.object(CLOCK_ID),
      ],
    });

    const result2 = await executeTransaction(client, keypair, tx2);
    if (result2.success) {
      console.log(`[${timestamp()}] SELL sweep executed (tx: ${result2.digest?.slice(0, 10)}...)`);
    } else {
      console.error(`[${timestamp()}] SELL sweep failed: ${result2.error}`);
    }
  } else {
    console.log(`[${timestamp()}] No stale bids detected above mid`);
  }

  // Re-check orderbook
  await new Promise((r) => setTimeout(r, 3000));
  const obAfter = await getFullOrderbookState(client);
  console.log(`[${timestamp()}] After sweep — bestBid: $${obAfter.bestBid.toLocaleString()}, bestAsk: $${obAfter.bestAsk.toLocaleString()}`);
  const spreadBps = ((obAfter.bestAsk - obAfter.bestBid) / midPrice * 10000).toFixed(1);
  console.log(`[${timestamp()}] Spread: ${spreadBps} bps`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
