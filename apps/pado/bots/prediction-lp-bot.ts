/**
 * Prediction Market LP Bot (dual YES+NO quotes)
 *
 * Strategy per tick:
 *   1. Fetch market + all 4 order book sides (yes_bids, yes_asks, no_bids, no_asks).
 *   2. If status != OPEN or now >= close_time: cancel all my orders on all sides, skip.
 *   3. Auto-bootstrap: if LP has no inventory for this market, mint YES+NO positions.
 *   4. Compute YES midpoint from external YES orders (excluding my own); empty -> 5000 bps.
 *   5. Derive NO quotes from YES quotes (NO bid = MAX_PRICE - YES ask, NO ask = MAX_PRICE - YES bid).
 *      This keeps both sides arbitrage-free by construction.
 *   6. Cancel any of my existing orders that don't match desired prices.
 *   7. Place YES bid, YES ask (if holding YES position), NO bid, NO ask (if holding NO position).
 *
 * Market discovery:
 *   If PREDICTION_LP_MARKETS is set, those IDs are pinned.
 *   Otherwise, markets are discovered from on-chain MarketCreated events and
 *   refreshed every PREDICTION_LP_DISCOVER_INTERVAL_MS (default 10 min).
 *   Newly discovered OPEN markets are auto-bootstrapped (mint YES+NO inventory).
 *
 * Env vars:
 *   PREDICTION_LP_PRIVATE_KEY              ed25519 hex or suiprivkey.
 *   PREDICTION_LP_MARKETS                  Optional comma-separated market IDs (static pin).
 *   PREDICTION_LP_SPREAD_BPS               Total quote spread (default 200).
 *   PREDICTION_LP_DEPTH_NUSDC              Bid depth in NUSDC human units (default 100).
 *   PREDICTION_LP_BOOTSTRAP_MINT_NUSDC     Inventory mint per new market (default 200).
 *   PREDICTION_LP_UPDATE_INTERVAL_MS       Tick interval (default 10000).
 *   PREDICTION_LP_DISCOVER_INTERVAL_MS     Market list refresh interval (default 600000).
 *   PREDICTION_PACKAGE_ID                  Deployed package id (required).
 *   NASUN_RPC_URL                          RPC endpoint (default devnet).
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
import { discoverMarketIds } from './lib/prediction-market-discovery.js';

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
const DEFAULT_BOOTSTRAP_MINT_NUSDC = 200;
const DEFAULT_INTERVAL_MS = 10_000;
const DEFAULT_DISCOVER_INTERVAL_MS = 10 * 60_000;
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
  noBidsTableId: string | null;
  noAsksTableId: string | null;
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
    noBidsTableId: extractTableId(fields.no_bids),
    noAsksTableId: extractTableId(fields.no_asks),
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
// My inventory fetch (YES or NO Positions)
// ========================================

interface OutcomePosition {
  id: string;
  shares: bigint;
}

async function fetchMyPositions(
  client: SuiClient,
  owner: string,
  packageId: string,
  marketId: string,
  isYes: boolean,
): Promise<OutcomePosition[]> {
  const positions: OutcomePosition[] = [];
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
      const posIsYes = Boolean(fields.is_yes ?? false);
      const shares = BigInt(String(fields.shares ?? 0));
      if (itsMarket === marketId.toLowerCase() && posIsYes === isYes && shares > 0n) {
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
// Auto-bootstrap mint
// ========================================

// Track markets we've already bootstrapped this process run to avoid redundant
// RPC checks every tick. Cleared only on restart (acceptable: cheap check on miss).
const bootstrappedMarkets = new Set<string>();

async function hasAnyInventory(
  client: SuiClient,
  owner: string,
  packageId: string,
  marketId: string,
): Promise<boolean> {
  // mint_outcome_tokens always creates both YES and NO together, so checking
  // either is sufficient to determine whether bootstrap has occurred.
  const positionType = `${packageId}::prediction_market::Position`;
  const target = marketId.toLowerCase();
  let cursor: string | null | undefined = null;
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
      if (
        String(fields.market_id ?? '').toLowerCase() === target &&
        BigInt(String(fields.shares ?? 0)) > 0n
      ) {
        return true;
      }
    }
    if (!page.hasNextPage || !page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return false;
}

async function bootstrapMint(
  client: SuiClient,
  keypair: Ed25519Keypair,
  packageId: string,
  marketId: string,
  amountRaw: bigint,
): Promise<void> {
  const owner = keypair.toSuiAddress();
  const coin = await fetchLargestNUSDCCoin(client, owner, amountRaw);
  if (!coin) {
    console.warn(
      `[${timestamp()}] ${marketId}: bootstrap skipped — no NUSDC coin >= ${Number(amountRaw) / 10 ** NUSDC_DECIMALS} (fund LP wallet)`,
    );
    return;
  }
  const tx = new Transaction();
  const [payment] = tx.splitCoins(tx.object(coin.id), [tx.pure.u64(amountRaw)]);
  tx.moveCall({
    target: `${packageId}::prediction_market::mint_outcome_tokens`,
    arguments: [tx.object(marketId), payment, tx.object(CLOCK_ID)],
  });
  const digest = await executeAndWait(client, keypair, tx, 'bootstrap_mint');
  bootstrappedMarkets.add(marketId.toLowerCase());
  console.log(`[${timestamp()}] ${marketId}: bootstrap minted ${Number(amountRaw) / 10 ** NUSDC_DECIMALS} NUSDC -> YES+NO positions (${digest.slice(0, 12)})`);
}

async function ensureBootstrapped(
  client: SuiClient,
  keypair: Ed25519Keypair,
  packageId: string,
  marketId: string,
  amountRaw: bigint,
): Promise<void> {
  const key = marketId.toLowerCase();
  if (bootstrappedMarkets.has(key)) return;
  const owner = keypair.toSuiAddress();
  const hasInventory = await hasAnyInventory(client, owner, packageId, marketId);
  if (hasInventory) {
    bootstrappedMarkets.add(key);
    return;
  }
  console.log(`[${timestamp()}] ${marketId}: no inventory — auto-bootstrapping YES+NO`);
  await bootstrapMint(client, keypair, packageId, marketId, amountRaw);
}

// ========================================
// Tx builders
// ========================================

function buildCancelOrder(
  packageId: string,
  marketId: string,
  isYes: boolean,
  isBid: boolean,
  price: number,
  orderId: number,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::prediction_market::cancel_order`,
    arguments: [
      tx.object(marketId),
      tx.pure.bool(isYes),
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
  isYes: boolean,
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
      tx.pure.bool(isYes),
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

// Annotated order: which side of which book (YES vs NO).
interface AnnotatedOrder extends BookOrder {
  isYes: boolean;
}

async function reconcileMarket(
  client: SuiClient,
  keypair: Ed25519Keypair,
  packageId: string,
  marketId: string,
  spreadBps: number,
  depthNusdc: number,
  bootstrapMintRaw: bigint,
): Promise<void> {
  const myAddress = keypair.toSuiAddress();
  const market = await fetchMarketSnapshot(client, marketId);
  if (!market) {
    console.warn(`[${timestamp()}] ${marketId}: not found`);
    return;
  }

  const closing = market.status !== STATUS_OPEN || Date.now() >= market.closeTime;

  if (!closing) {
    await ensureBootstrapped(client, keypair, packageId, marketId, bootstrapMintRaw);
  }

  // Fetch all 4 book sides in parallel.
  const emptySide: BookSide = { orders: [], truncated: false };
  const [yesBidSide, yesAskSide, noBidSide, noAskSide] = await Promise.all([
    market.yesBidsTableId ? fetchYesBookSide(client, market.yesBidsTableId, true) : Promise.resolve<BookSide>(emptySide),
    market.yesAsksTableId ? fetchYesBookSide(client, market.yesAsksTableId, false) : Promise.resolve<BookSide>(emptySide),
    market.noBidsTableId ? fetchYesBookSide(client, market.noBidsTableId, true) : Promise.resolve<BookSide>(emptySide),
    market.noAsksTableId ? fetchYesBookSide(client, market.noAsksTableId, false) : Promise.resolve<BookSide>(emptySide),
  ]);

  const annotate = (side: BookSide, isYes: boolean): AnnotatedOrder[] =>
    side.orders.map((o) => ({ ...o, isYes }));

  const allOrders: AnnotatedOrder[] = [
    ...annotate(yesBidSide, true),
    ...annotate(yesAskSide, true),
    ...annotate(noBidSide, false),
    ...annotate(noAskSide, false),
  ];
  const myOrders = allOrders.filter((o) => o.owner === myAddress);

  if (closing) {
    if (myOrders.length === 0) return;
    console.log(
      `[${timestamp()}] ${marketId}: market closing/closed, cancelling ${myOrders.length} order(s)`,
    );
    for (const o of myOrders) {
      if (shuttingDown) break;
      try {
        const digest = await executeAndWait(
          client,
          keypair,
          buildCancelOrder(packageId, marketId, o.isYes, o.isBid, o.price, o.orderId),
          `cancel_order`,
        );
        console.log(
          `[${timestamp()}] ${marketId}: cancelled ${o.isYes ? 'yes' : 'no'}-${o.isBid ? 'bid' : 'ask'} @ ${o.price} order=${o.orderId} (${digest.slice(0, 12)})`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[${timestamp()}] ${marketId}: cancel ${o.price}/${o.orderId} failed: ${msg}`);
      }
    }
    return;
  }

  // YES quotes derived from YES order book.
  const yesMid = computeMidpoint(yesBidSide.orders, yesAskSide.orders, myAddress);
  const yesDesired = computeQuotes(yesMid, spreadBps);

  // NO quotes are the complement of YES quotes: YES + NO = MAX_PRICE.
  // This keeps both sides arbitrage-free by construction.
  const noDesired = {
    bidBps: Math.max(1, MAX_PRICE_BPS - yesDesired.askBps),
    askBps: Math.min(MAX_PRICE_BPS - 1, MAX_PRICE_BPS - yesDesired.bidBps),
  };

  // Per-side placement skip flags.
  let skipYesBid = yesBidSide.truncated || myOrders.some((o) => o.isYes && o.isBid && o.price === yesDesired.bidBps);
  let skipYesAsk = yesAskSide.truncated || myOrders.some((o) => o.isYes && !o.isBid && o.price === yesDesired.askBps);
  let skipNoBid  = noBidSide.truncated  || myOrders.some((o) => !o.isYes && o.isBid && o.price === noDesired.bidBps);
  let skipNoAsk  = noAskSide.truncated  || myOrders.some((o) => !o.isYes && !o.isBid && o.price === noDesired.askBps);

  for (const side of [yesBidSide, yesAskSide, noBidSide, noAskSide]) {
    if (side.truncated) {
      console.warn(`[${timestamp()}] ${marketId}: book side truncated; skipping placement on truncated side(s) this tick`);
      break;
    }
  }

  // Cancel stale orders (wrong price for current desired quotes).
  const stale = myOrders.filter((o) => {
    const desired = o.isYes ? yesDesired : noDesired;
    return o.isBid ? o.price !== desired.bidBps : o.price !== desired.askBps;
  });
  for (const o of stale) {
    try {
      const digest = await executeAndWait(
        client,
        keypair,
        buildCancelOrder(packageId, marketId, o.isYes, o.isBid, o.price, o.orderId),
        `cancel_order`,
      );
      console.log(
        `[${timestamp()}] ${marketId}: cancelled stale ${o.isYes ? 'yes' : 'no'}-${o.isBid ? 'bid' : 'ask'} @ ${o.price} order=${o.orderId} (${digest.slice(0, 12)})`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[${timestamp()}] ${marketId}: stale cancel ${o.price}/${o.orderId} failed: ${msg}`);
      if (o.isYes && o.isBid) skipYesBid = true;
      else if (o.isYes && !o.isBid) skipYesAsk = true;
      else if (!o.isYes && o.isBid) skipNoBid = true;
      else skipNoAsk = true;
    }
  }

  const depthRaw = nusdcToRaw(depthNusdc);

  // Place YES bid.
  if (!skipYesBid) {
    const coin = await fetchLargestNUSDCCoin(client, myAddress, depthRaw);
    if (!coin) {
      console.warn(`[${timestamp()}] ${marketId}: no NUSDC coin >= ${depthNusdc} for yes-bid`);
    } else {
      try {
        const digest = await executeAndWait(
          client, keypair,
          buildPlaceBuyMaker(packageId, marketId, true, yesDesired.bidBps, depthRaw, coin.id),
          `place_buy_maker(yes)`,
        );
        console.log(`[${timestamp()}] ${marketId}: placed yes-bid @ ${yesDesired.bidBps}bps depth ${depthNusdc} (${digest.slice(0, 12)})`);
      } catch (err) {
        console.warn(`[${timestamp()}] ${marketId}: yes-bid failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // Place YES ask (requires YES position).
  if (!skipYesAsk) {
    const positions = await fetchMyPositions(client, myAddress, packageId, marketId, true);
    if (positions.length === 0) {
      console.warn(`[${timestamp()}] ${marketId}: no YES position for yes-ask`);
    } else {
      const largest = positions.reduce((a, b) => (b.shares > a.shares ? b : a));
      try {
        const digest = await executeAndWait(
          client, keypair,
          buildPlaceSellMaker(packageId, marketId, largest.id, yesDesired.askBps),
          `place_sell_maker(yes)`,
        );
        console.log(`[${timestamp()}] ${marketId}: placed yes-ask @ ${yesDesired.askBps}bps shares ${largest.shares} (${digest.slice(0, 12)})`);
      } catch (err) {
        console.warn(`[${timestamp()}] ${marketId}: yes-ask failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // Place NO bid.
  if (!skipNoBid) {
    const coin = await fetchLargestNUSDCCoin(client, myAddress, depthRaw);
    if (!coin) {
      console.warn(`[${timestamp()}] ${marketId}: no NUSDC coin >= ${depthNusdc} for no-bid`);
    } else {
      try {
        const digest = await executeAndWait(
          client, keypair,
          buildPlaceBuyMaker(packageId, marketId, false, noDesired.bidBps, depthRaw, coin.id),
          `place_buy_maker(no)`,
        );
        console.log(`[${timestamp()}] ${marketId}: placed no-bid @ ${noDesired.bidBps}bps depth ${depthNusdc} (${digest.slice(0, 12)})`);
      } catch (err) {
        console.warn(`[${timestamp()}] ${marketId}: no-bid failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // Place NO ask (requires NO position).
  if (!skipNoAsk) {
    const positions = await fetchMyPositions(client, myAddress, packageId, marketId, false);
    if (positions.length === 0) {
      console.warn(`[${timestamp()}] ${marketId}: no NO position for no-ask`);
    } else {
      const largest = positions.reduce((a, b) => (b.shares > a.shares ? b : a));
      try {
        const digest = await executeAndWait(
          client, keypair,
          buildPlaceSellMaker(packageId, marketId, largest.id, noDesired.askBps),
          `place_sell_maker(no)`,
        );
        console.log(`[${timestamp()}] ${marketId}: placed no-ask @ ${noDesired.askBps}bps shares ${largest.shares} (${digest.slice(0, 12)})`);
      } catch (err) {
        console.warn(`[${timestamp()}] ${marketId}: no-ask failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  console.log(
    `[${timestamp()}] ${marketId}: yes-mid=${yesMid} yes=${yesDesired.bidBps}/${yesDesired.askBps} no=${noDesired.bidBps}/${noDesired.askBps} myOrders=${myOrders.length}`,
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
  bootstrapMintRaw: bigint,
): Promise<void> {
  if (isRunning || shuttingDown) return;
  isRunning = true;
  try {
    for (const marketId of markets) {
      if (shuttingDown) break;
      try {
        await reconcileMarket(client, keypair, packageId, marketId, spreadBps, depthNusdc, bootstrapMintRaw);
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

// ========================================
// Market list (auto-discovery)
// ========================================

async function buildMarketList(
  client: SuiClient,
  packageId: string,
  pinnedMarkets: string[],
): Promise<string[]> {
  const discovered = await discoverMarketIds(client, packageId);
  const merged = new Map<string, true>();
  for (const id of [...pinnedMarkets, ...discovered]) {
    merged.set(id.toLowerCase(), true);
  }
  return [...merged.keys()];
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

  // Pinned markets (optional): merged with auto-discovered list.
  const pinnedMarkets = (process.env.PREDICTION_LP_MARKETS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^0x[0-9a-f]{64}$/.test(s));

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
  const bootstrapMintNusdc = parseFloat(
    process.env.PREDICTION_LP_BOOTSTRAP_MINT_NUSDC || String(DEFAULT_BOOTSTRAP_MINT_NUSDC),
  );
  if (!Number.isFinite(bootstrapMintNusdc) || bootstrapMintNusdc <= 0) {
    console.error('PREDICTION_LP_BOOTSTRAP_MINT_NUSDC must be positive');
    process.exit(1);
  }
  const bootstrapMintRaw = BigInt(Math.round(bootstrapMintNusdc * 10 ** NUSDC_DECIMALS));

  const intervalMs = parseInt(
    process.env.PREDICTION_LP_UPDATE_INTERVAL_MS || String(DEFAULT_INTERVAL_MS),
    10,
  );
  if (!Number.isFinite(intervalMs) || intervalMs < 2_000) {
    console.error('PREDICTION_LP_UPDATE_INTERVAL_MS must be >= 2000');
    process.exit(1);
  }
  const discoverIntervalMs = parseInt(
    process.env.PREDICTION_LP_DISCOVER_INTERVAL_MS || String(DEFAULT_DISCOVER_INTERVAL_MS),
    10,
  );

  const keypair = parseKeypair(keyInput);
  const lpAddress = keypair.toSuiAddress();
  const client = new SuiClient({ url: RPC_URL });

  console.log(`[${timestamp()}] Prediction LP Bot starting`);
  console.log(`[${timestamp()}] LP wallet: ${lpAddress}`);
  console.log(`[${timestamp()}] RPC: ${RPC_URL}`);
  console.log(`[${timestamp()}] Package: ${packageId}`);
  console.log(`[${timestamp()}] Pinned markets: ${pinnedMarkets.length > 0 ? pinnedMarkets.join(', ') : '(none — auto-discover only)'}`);
  console.log(
    `[${timestamp()}] Spread=${spreadBps}bps depth=${depthNusdc} bootstrap=${bootstrapMintNusdc} NUSDC tick=${intervalMs}ms discover=${discoverIntervalMs}ms`,
  );

  // Initial market discovery.
  let markets = await buildMarketList(client, packageId, pinnedMarkets);
  let lastDiscoverAt = Date.now();
  console.log(`[${timestamp()}] Watching ${markets.length} market(s) after discovery`);

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

  await tick(client, keypair, packageId, markets, spreadBps, depthNusdc, bootstrapMintRaw);
  if (runOnce) process.exit(0);

  while (!shuttingDown) {
    await sleep(intervalMs);
    if (shuttingDown) break;

    // Periodically refresh market list.
    if (Date.now() - lastDiscoverAt >= discoverIntervalMs) {
      try {
        const fresh = await buildMarketList(client, packageId, pinnedMarkets);
        const added = fresh.filter((id) => !markets.includes(id));
        if (added.length > 0) {
          console.log(`[${timestamp()}] Discovery: +${added.length} new market(s): ${added.join(', ')}`);
        }
        markets = fresh;
        lastDiscoverAt = Date.now();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[${timestamp()}] Market discovery refresh failed: ${msg}`);
      }
    }

    await tick(client, keypair, packageId, markets, spreadBps, depthNusdc, bootstrapMintRaw);
  }
}

main().catch((err) => {
  console.error(`[${timestamp()}] Fatal error:`, err);
  process.exit(1);
});
