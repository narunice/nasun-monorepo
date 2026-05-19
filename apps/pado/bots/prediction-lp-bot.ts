/**
 * Prediction Market LP Bot — multi-level ladder MM
 *
 * Per market per tick:
 *   1. Fetch market + 4 order book sides + my YES/NO Position objects.
 *   2. If status != OPEN or close_time passed: cancel all my orders, exit.
 *   3. Ensure inventory: if YES or NO Position count < K, mint top-ups
 *      (one PTB containing one mint_outcome_tokens call per missing slot).
 *   4. Compute YES midpoint from external book; smooth via EMA across ticks;
 *      shift via inventory skew (yes-heavy => mid down).
 *   5. Build YES K-level ladder; mirror as NO ladder (NO_p = MAX - YES_p).
 *   6. Diff against my live orders with min_repost_bps tolerance.
 *      Cancel mismatched orders (one PTB per side); place missing levels
 *      (one PTB per side: K splitCoins + K maker calls for bids;
 *       K Position consumes for asks).
 *
 * NO direct quoting is achieved by computing NO ladder as YES complement and
 * placing NO native maker orders (same pattern as legacy single-level bot).
 *
 * Env vars (all optional, with defaults; legacy single-level vars still work):
 *   PREDICTION_LP_PRIVATE_KEY              ed25519 hex or suiprivkey (required).
 *   PREDICTION_PACKAGE_ID                  Deployed package id (required).
 *   PREDICTION_LP_MARKETS                  Comma-separated market IDs to pin.
 *
 *   PREDICTION_LP_LADDER_LEVELS            K, levels per side (default 5).
 *   PREDICTION_LP_BASE_SPREAD_BPS          Half-spread to nearest level (default 100).
 *   PREDICTION_LP_LEVEL_GAP_BPS            Gap between adjacent levels (default 50).
 *   PREDICTION_LP_GAP_GROWTH               Geometric gap growth (default 1.6).
 *   PREDICTION_LP_BASE_SIZE_NUSDC          Inner-most level NUSDC depth (default 25).
 *   PREDICTION_LP_SIZE_GROWTH              Geometric size growth (default 1.7).
 *   PREDICTION_LP_EMA_LAMBDA               Mid EMA weight (default 0.4).
 *   PREDICTION_LP_INV_SKEW_ALPHA_BPS       Max mid shift from full inventory imbalance (default 0).
 *   PREDICTION_LP_INV_CAP_SHARES           Inventory cap for skew normalization (default 0).
 *   PREDICTION_LP_MIN_REPOST_BPS           Don't replace orders within this distance (default 25).
 *
 *   PREDICTION_LP_UPDATE_INTERVAL_MS       Tick interval (default 10000, min 2000).
 *   PREDICTION_LP_DISCOVER_INTERVAL_MS     Market list refresh (default 600000).
 *   NASUN_RPC_URL                          RPC endpoint.
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
  applyEma,
  applyInventorySkew,
  complementLadder,
  computeLadder,
  computeMidpoint,
  MAX_PRICE_BPS,
  type BookOrder,
  type Ladder,
  type LadderLevel,
  type LadderParams,
} from './lib/prediction-quotes.js';
import { discoverMarketIds } from './lib/prediction-market-discovery.js';

// ========================================
// Configuration
// ========================================

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
const CLOCK_ID = '0x6';
const NUSDC_TYPE = MARKETS.NBTC.quoteType;
const NUSDC_DECIMALS = 6;

const STATUS_OPEN = 0;

// Ladder defaults
const DEFAULT_LADDER_LEVELS = 5;
const DEFAULT_BASE_SPREAD_BPS = 100;
const DEFAULT_LEVEL_GAP_BPS = 50;
const DEFAULT_GAP_GROWTH = 1.6;
const DEFAULT_BASE_SIZE_NUSDC = 25;
const DEFAULT_SIZE_GROWTH = 1.7;
const DEFAULT_EMA_LAMBDA = 0.4;
const DEFAULT_INV_SKEW_ALPHA_BPS = 0;
const DEFAULT_INV_CAP_SHARES = 0;
const DEFAULT_MIN_REPOST_BPS = 25;

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

// Track market IDs we've already warned about (stale-package mismatch) so the
// log doesn't get spammed every tick.
const warnedStaleMarkets = new Set<string>();

async function fetchMarketSnapshot(
  client: SuiClient,
  marketId: string,
  packageId: string,
  legacyPackageIds: string[] = [],
): Promise<MarketSnapshot | null> {
  const obj = await client.getObject({
    id: marketId,
    options: { showContent: true, showType: true },
  });
  if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') {
    console.warn(`[${timestamp()}] ${marketId}: object not found or not a move object`);
    return null;
  }

  // Guard against stale-package markets: Sui anchors a struct's type tag to
  // the publish that DEFINED the struct, not to the upgrade variant emitting
  // it, so an upgrade leaves existing Market objects with the prior publish's
  // type id. The bot is fine calling Move entries via PREDICTION_PACKAGE_ID
  // (latest) — Sui resolves the upgrade — but accepts the canonical struct
  // type from any id in PREDICTION_PACKAGE_ID_LEGACY too. A market with a
  // type from somewhere outside this list is genuinely stale.
  const acceptedTypes = new Set(
    [packageId, ...legacyPackageIds].map((p) => `${p}::prediction_market::Market`),
  );
  const actualType = obj.data.type ?? '';
  if (!acceptedTypes.has(actualType)) {
    const key = marketId.toLowerCase();
    if (!warnedStaleMarkets.has(key)) {
      warnedStaleMarkets.add(key);
      console.warn(
        `[${timestamp()}] ${marketId}: stale-package market (type=${actualType}); skipping. ` +
        `Remove from PREDICTION_LP_MARKETS to silence.`,
      );
    }
    return null;
  }

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

async function fetchBookSide(
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
// Inventory fetch
// ========================================

interface OutcomePosition {
  id: string;
  shares: bigint;
}

async function fetchAllPositions(
  client: SuiClient,
  owner: string,
  packageId: string,
  marketId: string,
  legacyPackageIds: string[] = [],
): Promise<{ yes: OutcomePosition[]; no: OutcomePosition[] }> {
  // Position struct type identity follows the original-publish rule (see
  // fetchMarketSnapshot). getOwnedObjects's StructType filter accepts only
  // one type per call, so iterate across the accepted type ids and merge.
  // Sui returns the seen-objects-per-page so duplicate suppression via the
  // objectId set is sufficient.
  const target = marketId.toLowerCase();
  const yes: OutcomePosition[] = [];
  const no: OutcomePosition[] = [];
  const seen = new Set<string>();
  for (const pkg of [packageId, ...legacyPackageIds]) {
    const positionType = `${pkg}::prediction_market::Position`;
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
        if (seen.has(item.data.objectId)) continue;
        const fields = item.data.content.fields as Record<string, unknown>;
        const itsMarket = String(fields.market_id ?? '').toLowerCase();
        if (itsMarket !== target) continue;
        const shares = BigInt(String(fields.shares ?? 0));
        if (shares <= 0n) continue;
        const isYes = Boolean(fields.is_yes ?? false);
        seen.add(item.data.objectId);
        const entry = { id: item.data.objectId, shares };
        if (isYes) yes.push(entry);
        else no.push(entry);
      }
      if (!page.hasNextPage || !page.nextCursor) break;
      cursor = page.nextCursor;
    }
  }
  return { yes, no };
}

// Cap on opportunistic NUSDC fragments merged per tx. Each maker placement
// produces a tiny change coin (= largest ladder size); without inline merge,
// the wallet fragments until no single coin is large enough for ladder/mint
// totals and the bot silently stalls. We always merge enough fragments to
// reach minRaw and pull additional small coins (up to this cap) to defrag
// over time. Cap keeps PTB input-object count well under Sui limits.
const NUSDC_DEFRAG_EXTRA_CAP = 100;

/**
 * Pick a primary NUSDC coin and a list of extra coin ids whose merged total
 * is >= `minRaw`. Returns null only if the wallet's total NUSDC balance is
 * insufficient. Callers must `tx.mergeCoins(primary, extras)` before
 * splitting/spending the primary.
 */
async function fetchEnoughNUSDC(
  client: SuiClient,
  owner: string,
  minRaw: bigint,
): Promise<{ primary: string; extras: string[]; mergedBalance: bigint } | null> {
  let cursor: string | null | undefined = null;
  const all: { id: string; balance: bigint }[] = [];
  while (true) {
    const page = await client.getCoins({ owner, coinType: NUSDC_TYPE, cursor: cursor ?? null });
    for (const c of page.data) all.push({ id: c.coinObjectId, balance: BigInt(c.balance) });
    if (!page.hasNextPage || !page.nextCursor) break;
    cursor = page.nextCursor;
  }
  if (all.length === 0) return null;
  // Largest first — primary is always the biggest coin so we never waste a
  // big coin as a mergeable extra.
  all.sort((a, b) => (b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0));

  const primary = all[0];
  let merged = primary.balance;
  const extras: string[] = [];
  // Phase 1: take next-largest coins until threshold met.
  let i = 1;
  while (merged < minRaw && i < all.length && extras.length < NUSDC_DEFRAG_EXTRA_CAP) {
    extras.push(all[i].id);
    merged += all[i].balance;
    i++;
  }
  if (merged < minRaw) return null;
  // Phase 2: opportunistically pull smallest coins from the tail to defrag.
  const remaining = NUSDC_DEFRAG_EXTRA_CAP - extras.length;
  if (remaining > 0 && i < all.length) {
    const tail = all.slice(i).slice(-remaining);
    for (const c of tail) {
      extras.push(c.id);
      merged += c.balance;
    }
  }
  return { primary: primary.id, extras, mergedBalance: merged };
}

// ========================================
// Bootstrap / inventory top-up
// ========================================

/**
 * Mint sizes for the K Position objects we keep per market per side.
 * Mirrors the ladder size curve so larger ladder levels can consume larger
 * Positions. Each entry is a NUSDC amount; mint creates 1 YES + 1 NO Position
 * each with shares == nusdc_amount.
 */
function targetMintSizesNusdc(params: LadderParams): number[] {
  const sizes: number[] = [];
  for (let i = 0; i < params.levels; i++) {
    sizes.push(params.baseSizeNusdc * Math.pow(params.sizeGrowth, i));
  }
  return sizes;
}

async function ensureInventory(
  client: SuiClient,
  keypair: Ed25519Keypair,
  packageId: string,
  marketId: string,
  ladderParams: LadderParams,
  legacyPackageIds: string[] = [],
): Promise<{ yes: OutcomePosition[]; no: OutcomePosition[] }> {
  const owner = keypair.toSuiAddress();
  let positions = await fetchAllPositions(client, owner, packageId, marketId, legacyPackageIds);
  const target = ladderParams.levels;

  // We mint until both sides have >= K Positions. Each mint adds one to each.
  const shortfall = Math.max(0, target - Math.min(positions.yes.length, positions.no.length));
  if (shortfall === 0) return positions;

  const targetSizes = targetMintSizesNusdc(ladderParams);
  // Heuristic: top up with the smallest target sizes we appear to be missing.
  // We don't track per-Position level identity, so just mint the
  // smallest `shortfall` sizes (cheap top-up; ladder still works).
  const toMint = targetSizes.slice(0, shortfall);
  const totalNusdc = toMint.reduce((s, v) => s + v, 0);
  const totalRaw = nusdcToRaw(totalNusdc);
  const funds = await fetchEnoughNUSDC(client, owner, totalRaw);
  if (!funds) {
    console.warn(
      `[${timestamp()}] ${marketId}: inventory top-up skipped — wallet NUSDC < ${totalNusdc} (fund LP wallet)`,
    );
    return positions;
  }

  const tx = new Transaction();
  if (funds.extras.length > 0) {
    tx.mergeCoins(tx.object(funds.primary), funds.extras.map((id) => tx.object(id)));
  }
  const splits = tx.splitCoins(
    tx.object(funds.primary),
    toMint.map((amt) => tx.pure.u64(nusdcToRaw(amt))),
  );
  for (let i = 0; i < toMint.length; i++) {
    tx.moveCall({
      target: `${packageId}::prediction_market::mint_outcome_tokens`,
      arguments: [tx.object(marketId), splits[i], tx.object(CLOCK_ID)],
    });
  }
  const digest = await executeAndWait(client, keypair, tx, 'mint_outcome_tokens(batch)');
  console.log(
    `[${timestamp()}] ${marketId}: minted ${toMint.length} Position pair(s) (${toMint
      .map((s) => s.toFixed(2))
      .join('+')} NUSDC) ${digest.slice(0, 12)}`,
  );

  // Re-fetch fresh state.
  positions = await fetchAllPositions(client, owner, packageId, marketId, legacyPackageIds);
  return positions;
}

// ========================================
// Reconciliation diff
// ========================================

interface MyOrder {
  orderId: number;
  price: number;
  isBid: boolean;
  isYes: boolean;
}

interface SidePlan {
  toCancel: MyOrder[];
  toPlace: LadderLevel[];
  /** Subset of myOrders we kept (matched to a desired level within tolerance). */
  kept: MyOrder[];
}

/**
 * Greedy nearest-match between my live orders and desired ladder levels.
 *
 * For each desired level (walked in priceBps order), claim the nearest
 * unmatched of my orders that lies within `minRepostBps`. Unmatched levels
 * become `toPlace`; unmatched my orders become `toCancel`.
 */
function planSide(
  myOrders: MyOrder[],
  desired: LadderLevel[],
  minRepostBps: number,
): SidePlan {
  const remaining = [...myOrders];
  const toPlace: LadderLevel[] = [];
  const kept: MyOrder[] = [];

  // Walk desired levels in stable order; each consumes at most one of mine.
  for (const lv of desired) {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = Math.abs(remaining[i].price - lv.priceBps);
      if (d < bestDist && d <= minRepostBps) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      kept.push(remaining[bestIdx]);
      remaining.splice(bestIdx, 1);
    } else {
      toPlace.push(lv);
    }
  }

  return { toCancel: remaining, toPlace, kept };
}

// ========================================
// PTB builders (batched)
// ========================================

function buildBatchedCancel(
  packageId: string,
  marketId: string,
  orders: { isYes: boolean; isBid: boolean; price: number; orderId: number }[],
): Transaction {
  const tx = new Transaction();
  for (const o of orders) {
    tx.moveCall({
      target: `${packageId}::prediction_market::cancel_order`,
      arguments: [
        tx.object(marketId),
        tx.pure.bool(o.isYes),
        tx.pure.bool(o.isBid),
        tx.pure.u64(o.price),
        tx.pure.u64(o.orderId),
        tx.object(CLOCK_ID),
      ],
    });
  }
  return tx;
}

function buildBatchedBuyMakers(
  packageId: string,
  marketId: string,
  isYes: boolean,
  levels: LadderLevel[],
  sourceCoinId: string,
  mergeCoinIds: string[] = [],
): Transaction {
  const tx = new Transaction();
  if (mergeCoinIds.length > 0) {
    tx.mergeCoins(tx.object(sourceCoinId), mergeCoinIds.map((id) => tx.object(id)));
  }
  const splits = tx.splitCoins(
    tx.object(sourceCoinId),
    levels.map((l) => tx.pure.u64(nusdcToRaw(l.sizeNusdc))),
  );
  for (let i = 0; i < levels.length; i++) {
    tx.moveCall({
      target: `${packageId}::prediction_market::place_buy_maker`,
      arguments: [
        tx.object(marketId),
        tx.pure.bool(isYes),
        tx.pure.u64(levels[i].priceBps),
        splits[i],
        tx.object(CLOCK_ID),
      ],
    });
  }
  return tx;
}

function buildBatchedSellMakers(
  packageId: string,
  marketId: string,
  assignments: { positionId: string; priceBps: number }[],
): Transaction {
  const tx = new Transaction();
  for (const a of assignments) {
    tx.moveCall({
      target: `${packageId}::prediction_market::place_sell_maker`,
      arguments: [
        tx.object(marketId),
        tx.object(a.positionId),
        tx.pure.u64(a.priceBps),
        tx.object(CLOCK_ID),
      ],
    });
  }
  return tx;
}

// ========================================
// Per-market reconcile
// ========================================

interface MarketState {
  yesMidEma: number | null;
}

const marketState = new Map<string, MarketState>();

function getState(marketId: string): MarketState {
  const key = marketId.toLowerCase();
  let st = marketState.get(key);
  if (!st) {
    st = { yesMidEma: null };
    marketState.set(key, st);
  }
  return st;
}

interface ReconcileConfig {
  ladder: LadderParams;
  emaLambda: number;
  invSkewAlphaBps: number;
  invCapShares: bigint;
  minRepostBps: number;
}

async function reconcileMarket(
  client: SuiClient,
  keypair: Ed25519Keypair,
  packageId: string,
  marketId: string,
  cfg: ReconcileConfig,
  legacyPackageIds: string[] = [],
): Promise<void> {
  const myAddress = keypair.toSuiAddress();
  const market = await fetchMarketSnapshot(client, marketId, packageId, legacyPackageIds);
  if (!market) {
    // Either object missing or stale-package; both already log inside the helper.
    return;
  }

  const closing = market.status !== STATUS_OPEN || Date.now() >= market.closeTime;

  // Fetch all 4 book sides in parallel.
  const emptySide: BookSide = { orders: [], truncated: false };
  const [yesBidSide, yesAskSide, noBidSide, noAskSide] = await Promise.all([
    market.yesBidsTableId ? fetchBookSide(client, market.yesBidsTableId, true) : Promise.resolve<BookSide>(emptySide),
    market.yesAsksTableId ? fetchBookSide(client, market.yesAsksTableId, false) : Promise.resolve<BookSide>(emptySide),
    market.noBidsTableId ? fetchBookSide(client, market.noBidsTableId, true) : Promise.resolve<BookSide>(emptySide),
    market.noAsksTableId ? fetchBookSide(client, market.noAsksTableId, false) : Promise.resolve<BookSide>(emptySide),
  ]);

  const myYesBids: MyOrder[] = yesBidSide.orders
    .filter((o) => o.owner === myAddress)
    .map((o) => ({ orderId: o.orderId, price: o.price, isBid: true, isYes: true }));
  const myYesAsks: MyOrder[] = yesAskSide.orders
    .filter((o) => o.owner === myAddress)
    .map((o) => ({ orderId: o.orderId, price: o.price, isBid: false, isYes: true }));
  const myNoBids: MyOrder[] = noBidSide.orders
    .filter((o) => o.owner === myAddress)
    .map((o) => ({ orderId: o.orderId, price: o.price, isBid: true, isYes: false }));
  const myNoAsks: MyOrder[] = noAskSide.orders
    .filter((o) => o.owner === myAddress)
    .map((o) => ({ orderId: o.orderId, price: o.price, isBid: false, isYes: false }));

  const allMine: MyOrder[] = [...myYesBids, ...myYesAsks, ...myNoBids, ...myNoAsks];

  if (closing) {
    if (allMine.length === 0) return;
    console.log(
      `[${timestamp()}] ${marketId}: market closing/closed, cancelling ${allMine.length} order(s)`,
    );
    try {
      const tx = buildBatchedCancel(packageId, marketId, allMine);
      const digest = await executeAndWait(client, keypair, tx, 'cancel_all');
      console.log(`[${timestamp()}] ${marketId}: cancelled ${allMine.length} (${digest.slice(0, 12)})`);
    } catch (err) {
      console.warn(
        `[${timestamp()}] ${marketId}: cancel-all failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return;
  }

  // Ensure inventory before quoting (mints up to K Position pairs).
  const positions = await ensureInventory(client, keypair, packageId, marketId, cfg.ladder, legacyPackageIds);

  // Compute YES midpoint using 4-book complementary view to prevent skew when
  // external YES bids are abnormally high (e.g. crossed market from user orders).
  // Uses the same effective-bid/ask logic as calculateProbabilityFromOrderbook:
  //   effectiveBid = max(yesBestBid, MAX - noExternalBestAsk)
  //   effectiveAsk = min(yesBestAsk, MAX - noExternalBestBid)
  const extYesBid = yesBidSide.orders.filter((o) => o.owner !== myAddress)
    .reduce((best, o) => Math.max(best, Number(o.price)), 0);
  const extYesAsk = yesAskSide.orders.filter((o) => o.owner !== myAddress)
    .reduce<number>((best, o) => best === 0 ? Number(o.price) : Math.min(best, Number(o.price)), 0);
  const extNoBid = noBidSide.orders.filter((o) => o.owner !== myAddress)
    .reduce((best, o) => Math.max(best, Number(o.price)), 0);
  const extNoAsk = noAskSide.orders.filter((o) => o.owner !== myAddress)
    .reduce<number>((best, o) => best === 0 ? Number(o.price) : Math.min(best, Number(o.price)), 0);

  const impliedYesBid = extNoAsk > 0 ? MAX_PRICE_BPS - extNoAsk : 0;
  const impliedYesAsk = extNoBid > 0 ? MAX_PRICE_BPS - extNoBid : 0;
  const effectiveBid = Math.max(extYesBid, impliedYesBid);
  const effectiveAsk = impliedYesAsk > 0 && extYesAsk > 0
    ? Math.min(extYesAsk, impliedYesAsk)
    : impliedYesAsk > 0 ? impliedYesAsk
    : extYesAsk;

  const rawMid = effectiveBid > 0 && effectiveAsk > 0
    ? Math.round((effectiveBid + effectiveAsk) / 2)
    : computeMidpoint(yesBidSide.orders, yesAskSide.orders, myAddress);

  const state = getState(marketId);
  // Reset EMA when mid shifts by more than 1500 bps (market regime change).
  if (state.yesMidEma !== 0 && Math.abs(rawMid - state.yesMidEma) > 1500) {
    console.log(
      `[${timestamp()}] ${marketId}: mid regime shift ${state.yesMidEma}->${rawMid}, resetting EMA`,
    );
    state.yesMidEma = rawMid;
  }
  const smoothedMid = applyEma(state.yesMidEma, rawMid, cfg.emaLambda);
  // Note: state.yesMidEma is set AFTER skew below so the inventory-driven bias
  // persists across ticks (otherwise mid reverts the moment LP refills depth).

  // Inventory imbalance signal: use resting ask depth on each side rather than
  // idle Position objects. mint_outcome_tokens always mints YES+NO pairs, so
  // idle positions stay ~1:1 regardless of taker flow — that signal is dead.
  // Resting ask depletion directly reflects taker direction:
  //   yes_ask depleted (yesAskAmt < target) → users bought YES → push mid UP
  //   no_ask  depleted (noAskAmt  < target) → users bought NO  → push mid DOWN
  // applyInventorySkew shifts mid down when its arg is positive, so we feed
  // (yesAskAmt - noAskAmt): positive when noAsk is more depleted (NO bought).
  const yesAskAmt = yesAskSide.orders
    .filter((o) => o.owner === myAddress)
    .reduce((s, o) => s + o.amount, 0n);
  const noAskAmt = noAskSide.orders
    .filter((o) => o.owner === myAddress)
    .reduce((s, o) => s + o.amount, 0n);
  const deltaInv = yesAskAmt - noAskAmt;
  const skewedMid = applyInventorySkew(
    smoothedMid,
    deltaInv,
    cfg.invCapShares,
    cfg.invSkewAlphaBps,
  );
  // Persist the post-skew mid so taker-driven bias accumulates across ticks
  // and decays gracefully when imbalance disappears.
  state.yesMidEma = skewedMid;

  // Build YES ladder; mirror to NO via complement.
  const yesLadder = computeLadder(skewedMid, cfg.ladder);
  const noLadder: Ladder = complementLadder(yesLadder);

  // Plan each of 4 sides.
  const yesBidPlan = planSide(myYesBids, yesLadder.bids, cfg.minRepostBps);
  const yesAskPlan = planSide(myYesAsks, yesLadder.asks, cfg.minRepostBps);
  const noBidPlan = planSide(myNoBids, noLadder.bids, cfg.minRepostBps);
  const noAskPlan = planSide(myNoAsks, noLadder.asks, cfg.minRepostBps);

  // Skip placement on truncated sides (might miss own orders => duplicate placement).
  const truncated = {
    yesBid: yesBidSide.truncated,
    yesAsk: yesAskSide.truncated,
    noBid: noBidSide.truncated,
    noAsk: noAskSide.truncated,
  };

  // ===== Cancel mismatches (one PTB per side) =====
  const cancelTasks: Array<{ orders: MyOrder[]; label: string }> = [];
  if (yesBidPlan.toCancel.length > 0) cancelTasks.push({ orders: yesBidPlan.toCancel, label: 'yes-bid' });
  if (yesAskPlan.toCancel.length > 0) cancelTasks.push({ orders: yesAskPlan.toCancel, label: 'yes-ask' });
  if (noBidPlan.toCancel.length > 0) cancelTasks.push({ orders: noBidPlan.toCancel, label: 'no-bid' });
  if (noAskPlan.toCancel.length > 0) cancelTasks.push({ orders: noAskPlan.toCancel, label: 'no-ask' });

  for (const task of cancelTasks) {
    if (shuttingDown) return;
    try {
      const tx = buildBatchedCancel(
        packageId,
        marketId,
        task.orders.map((o) => ({ isYes: o.isYes, isBid: o.isBid, price: o.price, orderId: o.orderId })),
      );
      const digest = await executeAndWait(client, keypair, tx, `cancel_${task.label}`);
      console.log(
        `[${timestamp()}] ${marketId}: cancelled ${task.orders.length} ${task.label} (${digest.slice(0, 12)})`,
      );
    } catch (err) {
      console.warn(
        `[${timestamp()}] ${marketId}: cancel ${task.label} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ===== Place YES bids =====
  if (!truncated.yesBid && yesBidPlan.toPlace.length > 0) {
    await placeBidLadder(client, keypair, packageId, marketId, true, yesBidPlan.toPlace);
  }
  // ===== Place NO bids =====
  if (!truncated.noBid && noBidPlan.toPlace.length > 0) {
    await placeBidLadder(client, keypair, packageId, marketId, false, noBidPlan.toPlace);
  }

  // Re-fetch positions in case cancels above returned new Positions to us.
  const positionsAfterCancel = (yesAskPlan.toCancel.length > 0 || noAskPlan.toCancel.length > 0)
    ? await fetchAllPositions(client, keypair.toSuiAddress(), packageId, marketId, legacyPackageIds)
    : positions;

  // ===== Place YES asks (consume YES Positions) =====
  if (!truncated.yesAsk && yesAskPlan.toPlace.length > 0) {
    await placeAskLadder(
      client, keypair, packageId, marketId, true,
      yesAskPlan.toPlace, positionsAfterCancel.yes,
    );
  }
  // ===== Place NO asks (consume NO Positions) =====
  if (!truncated.noAsk && noAskPlan.toPlace.length > 0) {
    await placeAskLadder(
      client, keypair, packageId, marketId, false,
      noAskPlan.toPlace, positionsAfterCancel.no,
    );
  }

  console.log(
    `[${timestamp()}] ${marketId}: rawMid=${rawMid} ema=${smoothedMid} skew=${skewedMid} ` +
    `yes=[${yesLadder.bids.map((l) => l.priceBps).join(',')} | ${yesLadder.asks.map((l) => l.priceBps).join(',')}] ` +
    `mine=${allMine.length} kept=${yesBidPlan.kept.length + yesAskPlan.kept.length + noBidPlan.kept.length + noAskPlan.kept.length} ` +
    `placed=${yesBidPlan.toPlace.length + yesAskPlan.toPlace.length + noBidPlan.toPlace.length + noAskPlan.toPlace.length} ` +
    `cancelled=${yesBidPlan.toCancel.length + yesAskPlan.toCancel.length + noBidPlan.toCancel.length + noAskPlan.toCancel.length}`,
  );
}

async function placeBidLadder(
  client: SuiClient,
  keypair: Ed25519Keypair,
  packageId: string,
  marketId: string,
  isYes: boolean,
  levels: LadderLevel[],
): Promise<void> {
  const owner = keypair.toSuiAddress();
  const totalNusdc = levels.reduce((s, l) => s + l.sizeNusdc, 0);
  const totalRaw = nusdcToRaw(totalNusdc);
  const funds = await fetchEnoughNUSDC(client, owner, totalRaw);
  if (!funds) {
    console.warn(
      `[${timestamp()}] ${marketId}: wallet NUSDC < ${totalNusdc} for ${isYes ? 'yes' : 'no'}-bid ladder`,
    );
    return;
  }
  try {
    const tx = buildBatchedBuyMakers(packageId, marketId, isYes, levels, funds.primary, funds.extras);
    const digest = await executeAndWait(
      client, keypair, tx,
      `place_buy_maker_batch(${isYes ? 'yes' : 'no'})`,
    );
    console.log(
      `[${timestamp()}] ${marketId}: placed ${levels.length} ${isYes ? 'yes' : 'no'}-bids ` +
      `[${levels.map((l) => `${l.priceBps}@${l.sizeNusdc.toFixed(1)}`).join(', ')}] (${digest.slice(0, 12)})`,
    );
  } catch (err) {
    console.warn(
      `[${timestamp()}] ${marketId}: ${isYes ? 'yes' : 'no'}-bid ladder failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function placeAskLadder(
  client: SuiClient,
  keypair: Ed25519Keypair,
  packageId: string,
  marketId: string,
  isYes: boolean,
  levels: LadderLevel[],
  available: OutcomePosition[],
): Promise<void> {
  if (available.length === 0) {
    console.warn(
      `[${timestamp()}] ${marketId}: no ${isYes ? 'YES' : 'NO'} Positions for ask ladder`,
    );
    return;
  }
  // Sort levels by sizeNusdc desc, positions by shares desc, zip pairs.
  const sortedLevels = [...levels].sort((a, b) => b.sizeNusdc - a.sizeNusdc);
  const sortedPositions = [...available].sort((a, b) => (b.shares > a.shares ? 1 : b.shares < a.shares ? -1 : 0));
  const pairs: { positionId: string; priceBps: number }[] = [];
  for (let i = 0; i < sortedLevels.length && i < sortedPositions.length; i++) {
    pairs.push({ positionId: sortedPositions[i].id, priceBps: sortedLevels[i].priceBps });
  }
  if (pairs.length < sortedLevels.length) {
    console.warn(
      `[${timestamp()}] ${marketId}: only ${pairs.length}/${sortedLevels.length} ${isYes ? 'YES' : 'NO'} Positions available for ask ladder`,
    );
  }
  try {
    const tx = buildBatchedSellMakers(packageId, marketId, pairs);
    const digest = await executeAndWait(
      client, keypair, tx,
      `place_sell_maker_batch(${isYes ? 'yes' : 'no'})`,
    );
    console.log(
      `[${timestamp()}] ${marketId}: placed ${pairs.length} ${isYes ? 'yes' : 'no'}-asks ` +
      `[${pairs.map((p) => p.priceBps).join(', ')}] (${digest.slice(0, 12)})`,
    );
  } catch (err) {
    console.warn(
      `[${timestamp()}] ${marketId}: ${isYes ? 'yes' : 'no'}-ask ladder failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
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
  cfg: ReconcileConfig,
  legacyPackageIds: string[] = [],
): Promise<void> {
  if (isRunning || shuttingDown) return;
  isRunning = true;
  try {
    for (const marketId of markets) {
      if (shuttingDown) break;
      try {
        await reconcileMarket(client, keypair, packageId, marketId, cfg, legacyPackageIds);
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

async function buildMarketList(
  client: SuiClient,
  packageId: string,
  pinnedMarkets: string[],
  legacyPackageIds: string[] = [],
): Promise<string[]> {
  const pkgs = legacyPackageIds.length > 0 ? [packageId, ...legacyPackageIds] : packageId;
  const discovered = await discoverMarketIds(client, pkgs);
  const merged = new Map<string, true>();
  for (const id of [...pinnedMarkets, ...discovered]) {
    merged.set(id.toLowerCase(), true);
  }
  return [...merged.keys()];
}

function readNumberEnv(name: string, def: number, min?: number, max?: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  const v = parseFloat(raw);
  if (!Number.isFinite(v)) {
    console.error(`${name} must be a finite number, got: ${raw}`);
    process.exit(1);
  }
  if (min !== undefined && v < min) {
    console.error(`${name} must be >= ${min}, got: ${v}`);
    process.exit(1);
  }
  if (max !== undefined && v > max) {
    console.error(`${name} must be <= ${max}, got: ${v}`);
    process.exit(1);
  }
  return v;
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

  // Dual-scan support: see prediction-keeper.ts for the rationale.
  const legacyPackageIds = (process.env.PREDICTION_PACKAGE_ID_LEGACY || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^0x[0-9a-f]{64}$/.test(s));

  const pinnedMarkets = (process.env.PREDICTION_LP_MARKETS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^0x[0-9a-f]{64}$/.test(s));

  const ladder: LadderParams = {
    levels: Math.round(readNumberEnv('PREDICTION_LP_LADDER_LEVELS', DEFAULT_LADDER_LEVELS, 1, 20)),
    baseSpreadBps: readNumberEnv('PREDICTION_LP_BASE_SPREAD_BPS', DEFAULT_BASE_SPREAD_BPS, 1, 5000),
    levelGapBps: readNumberEnv('PREDICTION_LP_LEVEL_GAP_BPS', DEFAULT_LEVEL_GAP_BPS, 1, 5000),
    gapGrowth: readNumberEnv('PREDICTION_LP_GAP_GROWTH', DEFAULT_GAP_GROWTH, 1, 5),
    baseSizeNusdc: readNumberEnv('PREDICTION_LP_BASE_SIZE_NUSDC', DEFAULT_BASE_SIZE_NUSDC, 0.000001),
    sizeGrowth: readNumberEnv('PREDICTION_LP_SIZE_GROWTH', DEFAULT_SIZE_GROWTH, 1, 5),
  };
  const emaLambda = readNumberEnv('PREDICTION_LP_EMA_LAMBDA', DEFAULT_EMA_LAMBDA, 0, 1);
  const invSkewAlphaBps = readNumberEnv(
    'PREDICTION_LP_INV_SKEW_ALPHA_BPS', DEFAULT_INV_SKEW_ALPHA_BPS, 0, 5000,
  );
  const invCapSharesNum = readNumberEnv(
    'PREDICTION_LP_INV_CAP_SHARES', DEFAULT_INV_CAP_SHARES, 0,
  );
  const invCapShares = BigInt(Math.floor(invCapSharesNum * 10 ** NUSDC_DECIMALS));
  const minRepostBps = readNumberEnv('PREDICTION_LP_MIN_REPOST_BPS', DEFAULT_MIN_REPOST_BPS, 0, 5000);

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

  const cfg: ReconcileConfig = {
    ladder, emaLambda, invSkewAlphaBps, invCapShares, minRepostBps,
  };

  const keypair = parseKeypair(keyInput);
  const lpAddress = keypair.toSuiAddress();
  const client = new SuiClient({ url: RPC_URL });

  const totalLadderNusdc = targetMintSizesNusdc(ladder).reduce((s, v) => s + v, 0);

  console.log(`[${timestamp()}] Prediction LP Bot (ladder mode) starting`);
  console.log(`[${timestamp()}] LP wallet: ${lpAddress}`);
  console.log(`[${timestamp()}] RPC: ${RPC_URL}`);
  console.log(`[${timestamp()}] Package: ${packageId}`);
  console.log(`[${timestamp()}] Legacy packages: ${legacyPackageIds.length > 0 ? legacyPackageIds.join(', ') : '(none)'}`);
  console.log(
    `[${timestamp()}] Pinned markets: ${pinnedMarkets.length > 0 ? pinnedMarkets.join(', ') : '(none — auto-discover only)'}`,
  );
  console.log(
    `[${timestamp()}] Ladder K=${ladder.levels} baseSpread=${ladder.baseSpreadBps}bps gap=${ladder.levelGapBps}bps×${ladder.gapGrowth} ` +
    `size0=${ladder.baseSizeNusdc} ×${ladder.sizeGrowth} (mint pool ≈ ${totalLadderNusdc.toFixed(1)} NUSDC/side/market)`,
  );
  console.log(
    `[${timestamp()}] EMA λ=${emaLambda} invSkewα=${invSkewAlphaBps}bps invCap=${invCapSharesNum} minRepost=${minRepostBps}bps tick=${intervalMs}ms`,
  );

  let markets = await buildMarketList(client, packageId, pinnedMarkets, legacyPackageIds);
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

  await tick(client, keypair, packageId, markets, cfg, legacyPackageIds);
  if (runOnce) process.exit(0);

  while (!shuttingDown) {
    await sleep(intervalMs);
    if (shuttingDown) break;

    if (Date.now() - lastDiscoverAt >= discoverIntervalMs) {
      try {
        const fresh = await buildMarketList(client, packageId, pinnedMarkets, legacyPackageIds);
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

    await tick(client, keypair, packageId, markets, cfg, legacyPackageIds);
  }
}

main().catch((err) => {
  console.error(`[${timestamp()}] Fatal error:`, err);
  process.exit(1);
});
