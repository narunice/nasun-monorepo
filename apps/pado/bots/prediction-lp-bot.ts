/**
 * Prediction Market LP Bot (mvp, single-level YES quotes)
 *
 * Strategy per tick:
 *   1. Fetch market + YES order book.
 *   2. If status != OPEN or now >= close_time: cancel all my YES orders, skip.
 *   3. Compute midpoint from external orders (excluding my own); empty -> 5000 bps.
 *   4. Desired:
 *        yes-bid  at max(1, mid - spread/2)
 *        yes-ask  at min(MAX_PRICE-1, mid + spread/2)  (only if I hold a YES Position)
 *   5. Cancel any of my existing YES orders that don't match desired prices.
 *   6. Place new buy-maker (NUSDC depth) and sell-maker (consumes one YES Position).
 *
 * Inventory (YES + NO Positions) must be seeded once via
 * scripts/prediction-lp-bootstrap-mint.ts. This bot never mints.
 *
 * Env vars:
 *   PREDICTION_LP_PRIVATE_KEY            ed25519 hex or suiprivkey.
 *   PREDICTION_LP_MARKETS                Comma-separated market object ids.
 *   PREDICTION_LP_SPREAD_BPS             Total quote spread (default 200).
 *   PREDICTION_LP_DEPTH_NUSDC            Bid depth in NUSDC human units (default 100).
 *   PREDICTION_LP_UPDATE_INTERVAL_MS     Tick interval (default 10000).
 *   PREDICTION_PACKAGE_ID                Deployed package id (required).
 *   NASUN_RPC_URL                        RPC endpoint (default devnet).
 *
 * Usage:
 *   node --env-file=.env --import tsx prediction-lp-bot.ts
 *   node --env-file=.env --import tsx prediction-lp-bot.ts --once
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import { MARKETS } from './lib/config.js';
import {
  computeMidpoint,
  computeQuotes,
  MAX_PRICE_BPS,
  type BookOrder,
} from './lib/prediction-quotes.js';

// ========================================
// Configuration
// ========================================

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
const CLOCK_ID = '0x6';
// NUSDC type sourced from the existing LP-bot config (NBTC pool's quoteType).
const NUSDC_TYPE = MARKETS.NBTC.quoteType;
const NUSDC_DECIMALS = 6;

const STATUS_OPEN = 0;

const DEFAULT_SPREAD_BPS = 200;
const DEFAULT_DEPTH_NUSDC = 100;
const DEFAULT_INTERVAL_MS = 10_000;
const MAX_CONSECUTIVE_ERRORS = 10;
const ORDERBOOK_PAGE = 50;
const MAX_ORDERBOOK_LEVELS = 200;

// ========================================
// Helpers
// ========================================

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

function parseKeypair(keyInput: string): Ed25519Keypair {
  if (keyInput.startsWith('suiprivkey')) {
    const { secretKey } = decodeSuiPrivateKey(keyInput);
    return Ed25519Keypair.fromSecretKey(secretKey);
  }
  const cleanKey = keyInput.replace(/^0x/, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(cleanKey)) {
    throw new Error('Invalid private key (expected 64 hex chars or suiprivkey bech32)');
  }
  return Ed25519Keypair.fromSecretKey(Buffer.from(cleanKey, 'hex'));
}

async function executeAndWait(
  client: SuiClient,
  keypair: Ed25519Keypair,
  tx: Transaction,
  label: string,
): Promise<string> {
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });
  if (result.effects?.status?.status !== 'success') {
    throw new Error(`${label} TX failed: ${result.effects?.status?.error || 'unknown'}`);
  }
  await client.waitForTransaction({ digest: result.digest });
  return result.digest;
}

function nusdcToRaw(human: number): bigint {
  return BigInt(Math.round(human * 10 ** NUSDC_DECIMALS));
}

// ========================================
// Market + orderbook fetch
// ========================================

interface MarketSnapshot {
  status: number;
  closeTime: number;
  yesBidsTableId: string | null;
  yesAsksTableId: string | null;
}

async function fetchMarketSnapshot(
  client: SuiClient,
  marketId: string,
): Promise<MarketSnapshot | null> {
  const obj = await client.getObject({ id: marketId, options: { showContent: true } });
  if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') return null;
  const fields = obj.data.content.fields as Record<string, unknown>;
  return {
    status: Number(fields.status ?? 0),
    closeTime: Number(fields.close_time ?? 0),
    yesBidsTableId: extractTableId(fields.yes_bids),
    yesAsksTableId: extractTableId(fields.yes_asks),
  };
}

function extractTableId(field: unknown): string | null {
  const obj = field as { fields?: { id?: { id?: string } } } | undefined;
  return obj?.fields?.id?.id ?? null;
}

interface BookSide {
  orders: BookOrder[];
  truncated: boolean;
}

async function fetchYesBookSide(
  client: SuiClient,
  tableId: string,
  isBid: boolean,
): Promise<BookSide> {
  const names: Array<{ name: { type: string; value: unknown } }> = [];
  let cursor: string | null | undefined = null;
  let truncated = false;
  while (names.length < MAX_ORDERBOOK_LEVELS) {
    const page = await client.getDynamicFields({ parentId: tableId, cursor, limit: ORDERBOOK_PAGE });
    names.push(...page.data.map((d) => ({ name: d.name })));
    if (!page.hasNextPage || !page.nextCursor) break;
    if (names.length >= MAX_ORDERBOOK_LEVELS) {
      truncated = true;
      break;
    }
    cursor = page.nextCursor;
  }
  if (truncated) {
    console.warn(
      `[${timestamp()}] orderbook side hit MAX_ORDERBOOK_LEVELS=${MAX_ORDERBOOK_LEVELS}; far-priced own orders may be missed`,
    );
  }
  const orders: BookOrder[] = [];
  for (let i = 0; i < names.length; i += ORDERBOOK_PAGE) {
    const chunk = names.slice(i, i + ORDERBOOK_PAGE);
    const results = await Promise.all(
      chunk.map((entry) => client.getDynamicFieldObject({ parentId: tableId, name: entry.name })),
    );
    for (let j = 0; j < results.length; j++) {
      const fieldObj = results[j];
      const priceValue = chunk[j].name.value;
      if (!fieldObj.data?.content || fieldObj.data.content.dataType !== 'moveObject') continue;
      const value = fieldObj.data.content.fields as Record<string, unknown>;
      const arr = value.value as Array<Record<string, unknown>> | undefined;
      if (!arr) continue;
      const price = Number(priceValue);
      for (const raw of arr) {
        // Sui SDK wraps nested struct fields under an inner `fields` key when
        // the struct sits inside a vector inside a Table value. Unwrap so the
        // read works whether the SDK returns flat or wrapped shape.
        const f = ((raw as { fields?: Record<string, unknown> }).fields ?? raw);
        orders.push({
          orderId: Number(f.order_id ?? 0),
          owner: String(f.owner ?? ''),
          isBid,
          price,
          amount: BigInt(String(f.amount ?? 0)),
        });
      }
    }
  }
  return { orders, truncated };
}

// ========================================
// My inventory fetch (YES Positions)
// ========================================

interface YesPosition {
  id: string;
  shares: bigint;
}

async function fetchMyYesPositions(
  client: SuiClient,
  owner: string,
  packageId: string,
  marketId: string,
): Promise<YesPosition[]> {
  const positions: YesPosition[] = [];
  let cursor: string | null | undefined = null;
  const positionType = `${packageId}::prediction_market::Position`;
  while (true) {
    const page = await client.getOwnedObjects({
      owner,
      filter: { StructType: positionType },
      options: { showContent: true },
      cursor: cursor ?? null,
    });
    for (const item of page.data) {
      if (!item.data?.content || item.data.content.dataType !== 'moveObject') continue;
      const fields = item.data.content.fields as Record<string, unknown>;
      const itsMarket = String(fields.market_id ?? '').toLowerCase();
      const isYes = Boolean(fields.is_yes ?? false);
      const shares = BigInt(String(fields.shares ?? 0));
      if (itsMarket === marketId.toLowerCase() && isYes && shares > 0n) {
        positions.push({ id: item.data.objectId, shares });
      }
    }
    if (!page.hasNextPage || !page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return positions;
}

async function fetchLargestNUSDCCoin(
  client: SuiClient,
  owner: string,
  minRaw: bigint,
): Promise<{ id: string; balance: bigint } | null> {
  let cursor: string | null | undefined = null;
  let best: { id: string; balance: bigint } | null = null;
  while (true) {
    const page = await client.getCoins({ owner, coinType: NUSDC_TYPE, cursor: cursor ?? null });
    for (const c of page.data) {
      const bal = BigInt(c.balance);
      if (bal >= minRaw && (!best || bal > best.balance)) {
        best = { id: c.coinObjectId, balance: bal };
      }
    }
    if (!page.hasNextPage || !page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return best;
}

// ========================================
// Tx builders
// ========================================

function buildCancelOrder(
  packageId: string,
  marketId: string,
  isBid: boolean,
  price: number,
  orderId: number,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::prediction_market::cancel_order`,
    arguments: [
      tx.object(marketId),
      tx.pure.bool(true), // is_yes
      tx.pure.bool(isBid),
      tx.pure.u64(price),
      tx.pure.u64(orderId),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

function buildPlaceBuyMaker(
  packageId: string,
  marketId: string,
  priceBps: number,
  paymentRaw: bigint,
  nusdcCoinId: string,
): Transaction {
  const tx = new Transaction();
  const [payment] = tx.splitCoins(tx.object(nusdcCoinId), [tx.pure.u64(paymentRaw)]);
  tx.moveCall({
    target: `${packageId}::prediction_market::place_buy_maker`,
    arguments: [
      tx.object(marketId),
      tx.pure.bool(true), // is_yes
      tx.pure.u64(priceBps),
      payment,
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

function buildPlaceSellMaker(
  packageId: string,
  marketId: string,
  positionId: string,
  priceBps: number,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::prediction_market::place_sell_maker`,
    arguments: [
      tx.object(marketId),
      tx.object(positionId),
      tx.pure.u64(priceBps),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

// ========================================
// Per-market reconcile
// ========================================

async function reconcileMarket(
  client: SuiClient,
  keypair: Ed25519Keypair,
  packageId: string,
  marketId: string,
  spreadBps: number,
  depthNusdc: number,
): Promise<void> {
  const myAddress = keypair.toSuiAddress();
  const market = await fetchMarketSnapshot(client, marketId);
  if (!market) {
    console.warn(`[${timestamp()}] ${marketId}: not found`);
    return;
  }

  const closing = market.status !== STATUS_OPEN || Date.now() >= market.closeTime;

  // Always fetch both sides to find my orders for cancellation.
  const emptySide: BookSide = { orders: [], truncated: false };
  const [bidSide, askSide] = await Promise.all([
    market.yesBidsTableId
      ? fetchYesBookSide(client, market.yesBidsTableId, true)
      : Promise.resolve<BookSide>(emptySide),
    market.yesAsksTableId
      ? fetchYesBookSide(client, market.yesAsksTableId, false)
      : Promise.resolve<BookSide>(emptySide),
  ]);
  const bids = bidSide.orders;
  const asks = askSide.orders;

  const myOrders = [...bids, ...asks].filter((o) => o.owner === myAddress);

  if (closing) {
    if (myOrders.length === 0) return;
    console.log(
      `[${timestamp()}] ${marketId}: market closing/closed, cancelling ${myOrders.length} order(s)`,
    );
    // Best-effort: any cancel that fails (e.g. already filled by a taker) is
    // logged and skipped. Move aborts are not retriable.
    for (const o of myOrders) {
      if (shuttingDown) break;
      try {
        const digest = await executeAndWait(
          client,
          keypair,
          buildCancelOrder(packageId, marketId, o.isBid, o.price, o.orderId),
          `cancel_order`,
        );
        console.log(
          `[${timestamp()}] ${marketId}: cancelled ${o.isBid ? 'bid' : 'ask'} @ ${o.price} order=${o.orderId} (${digest.slice(0, 12)})`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
          `[${timestamp()}] ${marketId}: cancel ${o.price}/${o.orderId} failed: ${msg}`,
        );
      }
    }
    return;
  }

  const midpoint = computeMidpoint(bids, asks, myAddress);
  const desired = computeQuotes(midpoint, spreadBps);

  // Identify whether each side already has my desired-price order. If a stale
  // cancel fails (e.g. taker filled it between our fetch and cancel tx), we
  // also skip placement on that side this tick to avoid double-stacking.
  // If a side was truncated, far-priced own orders may be invisible to the
  // staleness check, so defensively skip placement on that side too.
  let skipBidPlacement =
    bidSide.truncated || myOrders.some((o) => o.isBid && o.price === desired.bidBps);
  let skipAskPlacement =
    askSide.truncated || myOrders.some((o) => !o.isBid && o.price === desired.askBps);
  if (bidSide.truncated || askSide.truncated) {
    console.warn(
      `[${timestamp()}] ${marketId}: book truncated (bid=${bidSide.truncated} ask=${askSide.truncated}); skipping placement on truncated side(s) this tick`,
    );
  }

  const stale = myOrders.filter(
    (o) => (o.isBid ? o.price !== desired.bidBps : o.price !== desired.askBps),
  );
  for (const o of stale) {
    try {
      const digest = await executeAndWait(
        client,
        keypair,
        buildCancelOrder(packageId, marketId, o.isBid, o.price, o.orderId),
        `cancel_order`,
      );
      console.log(
        `[${timestamp()}] ${marketId}: cancelled stale ${o.isBid ? 'bid' : 'ask'} @ ${o.price} order=${o.orderId} (${digest.slice(0, 12)})`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[${timestamp()}] ${marketId}: stale cancel ${o.price}/${o.orderId} failed: ${msg}`,
      );
      // Conservative: if cancel failed and the order is still on book at the
      // wrong price, skip placement on this side rather than risk inventory
      // being locked across two prices simultaneously.
      if (o.isBid) skipBidPlacement = true;
      else skipAskPlacement = true;
    }
  }

  if (!skipBidPlacement) {
    const depthRaw = nusdcToRaw(depthNusdc);
    const coin = await fetchLargestNUSDCCoin(client, myAddress, depthRaw);
    if (!coin) {
      console.warn(
        `[${timestamp()}] ${marketId}: no single NUSDC coin >= ${depthNusdc} (wallet may be fragmented; bootstrap merges coins)`,
      );
    } else {
      try {
        const digest = await executeAndWait(
          client,
          keypair,
          buildPlaceBuyMaker(packageId, marketId, desired.bidBps, depthRaw, coin.id),
          `place_buy_maker`,
        );
        console.log(
          `[${timestamp()}] ${marketId}: placed yes-bid @ ${desired.bidBps}bps depth ${depthNusdc} (${digest.slice(0, 12)})`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[${timestamp()}] ${marketId}: place_buy_maker failed: ${msg}`);
      }
    }
  }

  if (!skipAskPlacement) {
    const positions = await fetchMyYesPositions(client, myAddress, packageId, marketId);
    if (positions.length === 0) {
      console.warn(
        `[${timestamp()}] ${marketId}: no YES Position available, skipping ask placement (run bootstrap-mint to seed inventory)`,
      );
    } else {
      const largest = positions.reduce((a, b) => (b.shares > a.shares ? b : a));
      try {
        const digest = await executeAndWait(
          client,
          keypair,
          buildPlaceSellMaker(packageId, marketId, largest.id, desired.askBps),
          `place_sell_maker`,
        );
        console.log(
          `[${timestamp()}] ${marketId}: placed yes-ask @ ${desired.askBps}bps shares ${largest.shares} (${digest.slice(0, 12)})`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[${timestamp()}] ${marketId}: place_sell_maker failed: ${msg}`);
      }
    }
  }

  console.log(
    `[${timestamp()}] ${marketId}: mid=${midpoint} bid=${desired.bidBps} ask=${desired.askBps} myOrders=${myOrders.length}`,
  );
}

// ========================================
// Tick + main loop
// ========================================

let isRunning = false;
let consecutiveErrors = 0;
let shuttingDown = false;

async function tick(
  client: SuiClient,
  keypair: Ed25519Keypair,
  packageId: string,
  markets: string[],
  spreadBps: number,
  depthNusdc: number,
): Promise<void> {
  if (isRunning || shuttingDown) return;
  isRunning = true;
  try {
    for (const marketId of markets) {
      if (shuttingDown) break;
      try {
        await reconcileMarket(client, keypair, packageId, marketId, spreadBps, depthNusdc);
        consecutiveErrors = 0;
      } catch (err) {
        consecutiveErrors++;
        const msg = err instanceof Error ? err.message : String(err);
        const prefix = consecutiveErrors >= 5 ? '[LP CRITICAL]' : '[LP ERROR]';
        console.error(
          `[${timestamp()}] ${prefix} ${marketId}: ${msg} (consecutive: ${consecutiveErrors})`,
        );
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          console.error(
            `[${timestamp()}] [LP CRITICAL] ${MAX_CONSECUTIVE_ERRORS} consecutive errors. Exiting for pm2 restart.`,
          );
          process.exit(1);
        }
      }
    }
  } finally {
    isRunning = false;
  }
}

async function main(): Promise<void> {
  const keyInput = process.env.PREDICTION_LP_PRIVATE_KEY;
  if (!keyInput) {
    console.error('PREDICTION_LP_PRIVATE_KEY environment variable is required');
    process.exit(1);
  }

  const packageIdRaw = process.env.PREDICTION_PACKAGE_ID;
  if (!packageIdRaw || !/^0x[0-9a-fA-F]{64}$/.test(packageIdRaw)) {
    console.error('PREDICTION_PACKAGE_ID environment variable is required (0x-prefixed 32-byte hex)');
    process.exit(1);
  }
  const packageId = packageIdRaw.toLowerCase();

  const marketsRaw = process.env.PREDICTION_LP_MARKETS || '';
  const markets = marketsRaw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  if (markets.length === 0) {
    console.error('PREDICTION_LP_MARKETS must list at least one market id');
    process.exit(1);
  }
  for (const m of markets) {
    if (!/^0x[0-9a-f]{64}$/.test(m)) {
      console.error(`PREDICTION_LP_MARKETS: invalid market id ${m} (expected 0x-prefixed 32-byte hex)`);
      process.exit(1);
    }
  }

  const spreadBps = parseInt(process.env.PREDICTION_LP_SPREAD_BPS || String(DEFAULT_SPREAD_BPS), 10);
  if (!Number.isFinite(spreadBps) || spreadBps < 10 || spreadBps > 5000) {
    console.error('PREDICTION_LP_SPREAD_BPS must be between 10 and 5000');
    process.exit(1);
  }
  const depthNusdc = parseFloat(process.env.PREDICTION_LP_DEPTH_NUSDC || String(DEFAULT_DEPTH_NUSDC));
  if (!Number.isFinite(depthNusdc) || depthNusdc <= 0) {
    console.error('PREDICTION_LP_DEPTH_NUSDC must be positive');
    process.exit(1);
  }
  const intervalMs = parseInt(
    process.env.PREDICTION_LP_UPDATE_INTERVAL_MS || String(DEFAULT_INTERVAL_MS),
    10,
  );
  if (!Number.isFinite(intervalMs) || intervalMs < 2_000) {
    console.error('PREDICTION_LP_UPDATE_INTERVAL_MS must be >= 2000');
    process.exit(1);
  }

  const keypair = parseKeypair(keyInput);
  const lpAddress = keypair.toSuiAddress();
  const client = new SuiClient({ url: RPC_URL });

  console.log(`[${timestamp()}] Prediction LP Bot starting`);
  console.log(`[${timestamp()}] LP wallet: ${lpAddress}`);
  console.log(`[${timestamp()}] RPC: ${RPC_URL}`);
  console.log(`[${timestamp()}] Package: ${packageId}`);
  console.log(`[${timestamp()}] Markets (${markets.length}): ${markets.join(', ')}`);
  console.log(
    `[${timestamp()}] Spread=${spreadBps}bps depth=${depthNusdc} NUSDC interval=${intervalMs}ms`,
  );

  let wakeUp: (() => void) | null = null;
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        wakeUp = null;
        resolve();
      }, ms);
      wakeUp = () => {
        clearTimeout(timer);
        wakeUp = null;
        resolve();
      };
    });

  const shutdown = () => {
    console.log(`[${timestamp()}] Shutting down...`);
    shuttingDown = true;
    if (wakeUp) wakeUp();
    const check = setInterval(() => {
      if (!isRunning) {
        clearInterval(check);
        process.exit(0);
      }
    }, 500);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  const runOnce = process.argv.includes('--once');

  await tick(client, keypair, packageId, markets, spreadBps, depthNusdc);
  if (runOnce) process.exit(0);

  while (!shuttingDown) {
    await sleep(intervalMs);
    if (shuttingDown) break;
    await tick(client, keypair, packageId, markets, spreadBps, depthNusdc);
  }
}

main().catch((err) => {
  console.error(`[${timestamp()}] Fatal error:`, err);
  process.exit(1);
});
