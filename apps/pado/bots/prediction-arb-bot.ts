/**
 * Prediction Market Arbitrage Bot
 *
 * Monitors all open prediction markets for two distinct risk-free states.
 *
 * (A) CROSS-MARKET cross: (best_yes_bid + best_no_bid) > 10000 bps. Both
 *     outcomes can be sold for more than the 10000 bps it costs to mint a pair.
 *
 *   tx1: mint_outcome_tokens(amount NUSDC) -> YES + NO positions sent to wallet
 *   tx2: place_sell_taker(YES) + place_sell_taker(NO) in one PTB
 *
 *   Profit per arb: (yesBid + noBid - 10000) bps * mintAmount / 10000
 *
 * (B) SINGLE-SIDE cross: best_bid > best_ask on the SAME side (YES or NO).
 *     The maker entry functions (place_buy_maker / place_sell_maker) are
 *     post-only and do NOT match against the opposite side, so a resting bid
 *     can sit ABOVE a later resting ask indefinitely until a taker sweeps it.
 *     This both breaks the displayed probability and leaves free money on the
 *     table. We capture it (and uncross the book) by buying the cheap ask and
 *     selling into the rich bid:
 *
 *   tx1: place_buy_taker(side, max_price = bestAsk) -> Position bought cheap
 *   tx2: place_sell_taker(side, min_price = bestAsk + 1) -> sold into rich bid
 *
 *   Profit per bite: (bestBid - bestAsk) bps * filledShares / 10000. With a
 *   small MAX_NUSDC against a deep level there is no resting leftover, so each
 *   tick takes one bounded bite and the spread grinds shut over several ticks.
 *
 * At most ONE action runs per market per tick, so two different opportunities
 * never race within a tick. A single-side-cross is still two sequential txs
 * (buy then sell); if the rich bid is taken in between, the sell aborts and the
 * position is kept rather than rested (see executeSingleSideCross).
 *
 * Environment variables:
 *   PREDICTION_ARB_PRIVATE_KEY   required  ed25519 hex or suiprivkey bech32
 *   PREDICTION_PACKAGE_ID        required  deployed prediction market package
 *   NASUN_RPC_URL                optional  default https://rpc.devnet.nasun.io
 *   PREDICTION_ARB_INTERVAL_MS   optional  poll interval (default 15000)
 *   PREDICTION_ARB_MAX_NUSDC     optional  NUSDC per arb cycle (default 10)
 *   PREDICTION_ARB_MIN_PROFIT_BPS optional minimum profit in bps (default 100)
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import { TOKENS_PACKAGE } from './lib/config.js';
import { discoverMarketIds } from './lib/prediction-market-discovery.js';
import { isTransientRpcError } from './lib/retry.js';

// ========================================
// Constants
// ========================================

const RPC_URL = process.env.NASUN_RPC_URL ?? 'https://rpc.devnet.nasun.io';
const FAUCET_URL = process.env.NASUN_FAUCET_URL ?? 'https://faucet.devnet.nasun.io';
const CLOCK_ID = '0x6';
const TOKEN_FAUCET = '0x7cc75ad1f00f65589074ba9a8f0ad4922b2be3bfef31c22c66d137bc8dbced92';
const MAX_PRICE_BPS = 10_000;
const NUSDC_DECIMALS = 6;
const NUSDC_TYPE = `${TOKENS_PACKAGE}::nusdc::NUSDC`;
const MARKET_STATUS_OPEN = 0;

const PACKAGE_ID = process.env.PREDICTION_PACKAGE_ID ?? '';
// Dual-scan support: see prediction-keeper.ts for the rationale.
const LEGACY_PACKAGE_IDS = (process.env.PREDICTION_PACKAGE_ID_LEGACY ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter((s) => /^0x[0-9a-f]{64}$/.test(s));
const DISCOVERY_PKGS: string | string[] =
  LEGACY_PACKAGE_IDS.length > 0 ? [PACKAGE_ID, ...LEGACY_PACKAGE_IDS] : PACKAGE_ID;

// Legacy family identity for the 2026-05-20 v5 fresh-publish cutover (see
// prediction-keeper.ts for full rationale). Both must be set together or
// both empty. Without this, every legacy market PTB aborts with TypeMismatch.
const LEGACY_ORIGINAL_RAW = (process.env.PREDICTION_PACKAGE_ID_LEGACY_ORIGINAL ?? '').toLowerCase();
const LEGACY_LATEST_RAW = (process.env.PREDICTION_PACKAGE_ID_LEGACY_LATEST ?? '').toLowerCase();
const LEGACY_ORIGINAL_ID = /^0x[0-9a-f]{64}$/.test(LEGACY_ORIGINAL_RAW) ? LEGACY_ORIGINAL_RAW : '';
const LEGACY_LATEST_PACKAGE_ID = /^0x[0-9a-f]{64}$/.test(LEGACY_LATEST_RAW) ? LEGACY_LATEST_RAW : '';
if (Boolean(LEGACY_ORIGINAL_ID) !== Boolean(LEGACY_LATEST_PACKAGE_ID)) {
  throw new Error(
    'PREDICTION_PACKAGE_ID_LEGACY_ORIGINAL and PREDICTION_PACKAGE_ID_LEGACY_LATEST must both be set (or both empty)',
  );
}

// Mirrors prediction-keeper.ts's buildPackageDispatch — kept inline because
// deploy scripts only rsync apps/pado/bots/ (no shared lib resolution).
function packageIdForMarketType(marketObjectType: string): string {
  if (marketObjectType.startsWith(`${PACKAGE_ID}::`)) return PACKAGE_ID;
  if (
    LEGACY_ORIGINAL_ID &&
    LEGACY_LATEST_PACKAGE_ID &&
    marketObjectType.startsWith(`${LEGACY_ORIGINAL_ID}::`)
  ) {
    return LEGACY_LATEST_PACKAGE_ID;
  }
  throw new Error(`Unknown prediction market package origin in type: ${marketObjectType}`);
}
const INTERVAL_MS = Number(process.env.PREDICTION_ARB_INTERVAL_MS ?? '15000');
const MAX_NUSDC_PER_ARB = Number(process.env.PREDICTION_ARB_MAX_NUSDC ?? '10');
const MIN_PROFIT_BPS = Number(process.env.PREDICTION_ARB_MIN_PROFIT_BPS ?? '100');
const DISCOVERY_INTERVAL_MS = 5 * 60 * 1000;
const MAX_CONSECUTIVE_ERRORS = 5;
// ECapacityExceeded (MoveAbort code 18) means the target price level already
// has MAX_FIFO_PER_LEVEL=20 fills. Re-trying every 15s just burns RPC --
// wait until enough fills age out / new levels open up. 10 min is the
// shortest pause that meaningfully reduces noise without missing real
// arb opportunities on heavily-traded markets.
const CAPACITY_COOLDOWN_MS = 10 * 60 * 1000;
// NOTE: use [\s\S]*? (lazy, crosses parens) rather than [^)]*. The MoveAbort
// string nests two ')' before the abort code, from Identifier("prediction_market")
// and Some("place_sell_taker"), so [^)]* can never reach the trailing ", 18)"
// and the cooldown silently never fired (legacy markets re-tried every tick).
const ECAPACITY_EXCEEDED_PATTERN = /MoveAbort\b[\s\S]*?prediction_market[\s\S]*?\}\s*,\s*18\s*\)/;
// ENoFillsAtMarketPrice (code 19): the single-side-cross buy targeted an ask
// that was taken between our fetch and our exec. A benign race -- skip the
// market this tick without bumping the suicide counter.
const ENO_FILLS_PATTERN = /MoveAbort\b[\s\S]*?prediction_market[\s\S]*?\}\s*,\s*19\s*\)/;

// Refill thresholds
const MIN_GAS_NASUN = Number(process.env.PREDICTION_ARB_MIN_GAS_NASUN ?? '50');
const MIN_NUSDC = Number(process.env.PREDICTION_ARB_MIN_NUSDC ?? '50');
const NUSDC_REFILL_ROUNDS = Number(process.env.PREDICTION_ARB_NUSDC_REFILL_ROUNDS ?? '50');

// ========================================
// Helpers
// ========================================

function nusdcToRaw(human: number): bigint {
  return BigInt(Math.round(human * 10 ** NUSDC_DECIMALS));
}

function parseKeypair(key: string): Ed25519Keypair {
  if (key.startsWith('suiprivkey')) {
    return Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(key).secretKey);
  }
  const hex = key.replace(/^0x/, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error('Invalid private key format');
  return Ed25519Keypair.fromSecretKey(Buffer.from(hex, 'hex'));
}

// Gas payment pinning. The arb wallet holds a single SUI gas coin, so every tx
// reuses it. After a tx lands the coin's version increments; the SDK's default
// gas selection then re-reads owned coins and may hit a lagging fullnode read
// replica, submitting the stale version. Validators reject that fast with
// "Object ... not available for consumption", which floods the logs and, worse,
// drops the second leg of a cross-market arb (mint lands, sell rejected ->
// YES+NO positions stranded). We instead carry the gas object reference forward
// from each tx's own effects (authoritative, no replica read) via setGasPayment.
let cachedGasRef: { objectId: string; version: string; digest: string } | null = null;

async function resolveGasRef(
  client: SuiClient,
  owner: string,
): Promise<{ objectId: string; version: string; digest: string }> {
  if (cachedGasRef) return cachedGasRef;
  const page = await client.getCoins({ owner, coinType: '0x2::sui::SUI' });
  const coins = page.data.sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)));
  if (coins.length === 0) throw new Error('arb wallet has no SUI gas coin');
  const c = coins[0];
  cachedGasRef = { objectId: c.coinObjectId, version: String(c.version), digest: c.digest };
  return cachedGasRef;
}

async function executeAndWait(
  client: SuiClient,
  keypair: Ed25519Keypair,
  tx: Transaction,
  label: string,
) {
  const owner = keypair.toSuiAddress();
  const gasRef = await resolveGasRef(client, owner);
  tx.setGasPayment([gasRef]);

  let result;
  try {
    result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showEffects: true, showObjectChanges: true },
    });
  } catch (err) {
    // Submission was rejected before execution (tx never ran, gas object
    // unchanged). Our pinned ref is the likely culprit -- an out-of-band
    // mutation left it stale. Drop the cache so the next call re-reads fresh.
    cachedGasRef = null;
    throw err;
  }

  // A landed tx (success OR MoveAbort) consumes gas and advances the coin
  // version. Carry the new reference forward so the next tx never reuses the
  // old version. On submission rejection above we never reach here.
  const g = result.effects?.gasObject?.reference;
  if (g) cachedGasRef = { objectId: g.objectId, version: String(g.version), digest: g.digest };

  if (result.effects?.status?.status !== 'success') {
    throw new Error(`[${label}] TX failed: ${result.effects?.status?.error ?? 'unknown'}`);
  }
  await client.waitForTransaction({ digest: result.digest });
  console.log(`[${label}] digest=${result.digest}`);
  return result;
}

// ========================================
// Market book fetch
// ========================================

interface MarketBook {
  status: number;
  closeTime: number;
  // Full Sui type tag — packageIdForMarketType() maps the originalPackageId
  // prefix to the correct moveCall target. v5-on-legacy or vice versa
  // produces CommandArgumentError{TypeMismatch} on dry-run (2026-05-20
  // prod regression: arb-bot looped on TypeMismatch until consecutiveErrors
  // hit MAX and the process exited).
  objectType: string;
  yesBestBid: number | null;
  noBestBid: number | null;
  yesBestAsk: number | null;
  noBestAsk: number | null;
}

async function fetchMarketBook(
  client: SuiClient,
  marketId: string,
): Promise<MarketBook | null> {
  try {
    const obj = await client.getObject({ id: marketId, options: { showContent: true, showType: true } });
    const fields = (obj.data?.content as { fields?: Record<string, unknown> } | undefined)?.fields;
    if (!fields) return null;

    const yesBids = (fields.yes_bid_prices as string[]) ?? [];
    const noBids = (fields.no_bid_prices as string[]) ?? [];
    const yesAsks = (fields.yes_ask_prices as string[]) ?? [];
    const noAsks = (fields.no_ask_prices as string[]) ?? [];

    return {
      status: Number(fields.status),
      closeTime: Number(fields.close_time),
      objectType: String(obj.data?.type ?? ''),
      // *_bid_prices sorted descending (highest first); *_ask_prices ascending
      // (lowest first). Head element is the best price on each side.
      yesBestBid: yesBids.length > 0 ? Number(yesBids[0]) : null,
      noBestBid: noBids.length > 0 ? Number(noBids[0]) : null,
      yesBestAsk: yesAsks.length > 0 ? Number(yesAsks[0]) : null,
      noBestAsk: noAsks.length > 0 ? Number(noAsks[0]) : null,
    };
  } catch {
    return null;
  }
}

// ========================================
// NUSDC coin fetch
// ========================================

interface CoinFunds {
  primary: string;
  extras: string[];
}

async function fetchNusdcFunds(
  client: SuiClient,
  owner: string,
  minRaw: bigint,
): Promise<CoinFunds | null> {
  const page = await client.getCoins({ owner, coinType: NUSDC_TYPE });
  const coins = page.data.sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)));
  if (coins.length === 0 || BigInt(coins[0].balance) < minRaw) return null;
  return {
    primary: coins[0].coinObjectId,
    extras: coins.slice(1).map((c) => c.coinObjectId),
  };
}

// ========================================
// Position discovery
// ========================================

interface Positions {
  yesId: string;
  noId: string;
}

// Retry getObject: executeAndWait returns when the executing fullnode has the
// tx, but a subsequent client.getObject can route to a different read replica
// that has not yet indexed the new owned object, returning content=null. This
// produced 32 "could not identify YES/NO" aborts between 14:59 and 15:06 UTC
// on 2026-05-18, each one stranding a position in the arb wallet.
async function fetchPositionFields(
  client: SuiClient,
  objectId: string,
): Promise<{ is_yes?: boolean } | undefined> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const obj = await client.getObject({ id: objectId, options: { showContent: true } });
    const fields = (obj.data?.content as { fields?: { is_yes?: boolean } } | undefined)?.fields;
    if (fields && typeof fields.is_yes === 'boolean') return fields;
    if (attempt < 4) await new Promise((r) => setTimeout(r, 300 * attempt));
  }
  return undefined;
}

// Sui anchors a struct's type tag to the publish that defined the struct, so a
// Position minted via the latest package id still carries the type prefix of
// the publish where Position was originally introduced (see prediction-lp-bot's
// stale-package guard). Accept any prefix from an upgrade-chain id we know.
function positionPrefixMatcher(
  packageId: string,
  legacyPackageIds: string[],
): (objectType?: string) => boolean {
  const prefixes = [packageId, ...legacyPackageIds].map(
    (p) => `${p}::prediction_market::Position`,
  );
  return (ot?: string) =>
    typeof ot === 'string' && prefixes.some((p) => ot.startsWith(p));
}

async function findMintedPositions(
  client: SuiClient,
  objectChanges: Array<{ type: string; objectType?: string; objectId: string }>,
  packageId: string,
  legacyPackageIds: string[] = [],
): Promise<Positions | null> {
  const matchesAnyPrefix = positionPrefixMatcher(packageId, legacyPackageIds);
  const created = objectChanges.filter(
    (c) => c.type === 'created' && matchesAnyPrefix(c.objectType),
  );
  if (created.length < 2) {
    console.error(`[arb] expected 2 created Positions, got ${created.length}`);
    return null;
  }

  const [aFields, bFields] = await Promise.all([
    fetchPositionFields(client, created[0].objectId),
    fetchPositionFields(client, created[1].objectId),
  ]);
  if (!aFields || !bFields) return null;

  return aFields.is_yes
    ? { yesId: created[0].objectId, noId: created[1].objectId }
    : { yesId: created[1].objectId, noId: created[0].objectId };
}

// Locate the single Position minted by a place_buy_taker fill, verifying it is
// the expected side. buy_taker mints exactly one Position for the filled
// portion (prediction_market.move:656), so we take the first created Position
// whose is_yes matches.
async function findSinglePosition(
  client: SuiClient,
  objectChanges: Array<{ type: string; objectType?: string; objectId: string }>,
  expectedIsYes: boolean,
  packageId: string,
  legacyPackageIds: string[] = [],
): Promise<string | null> {
  const matchesAnyPrefix = positionPrefixMatcher(packageId, legacyPackageIds);
  const created = objectChanges.filter(
    (c) => c.type === 'created' && matchesAnyPrefix(c.objectType),
  );
  for (const c of created) {
    const fields = await fetchPositionFields(client, c.objectId);
    if (fields && fields.is_yes === expectedIsYes) return c.objectId;
  }
  return null;
}

// ========================================
// Arbitrage execution
// ========================================

async function executeArb(
  client: SuiClient,
  keypair: Ed25519Keypair,
  marketId: string,
  marketPackageId: string,
  yesBid: number,
  noBid: number,
): Promise<void> {
  const arbAddress = keypair.toSuiAddress();
  const mintRaw = nusdcToRaw(MAX_NUSDC_PER_ARB);
  const profitBps = yesBid + noBid - MAX_PRICE_BPS;
  const profitNusdc = (MAX_NUSDC_PER_ARB * profitBps) / MAX_PRICE_BPS;

  console.log(
    `[arb] market=${marketId.slice(0, 16)}... yesBid=${yesBid}bps noBid=${noBid}bps` +
      ` profitBps=${profitBps} estimatedProfit=${profitNusdc.toFixed(4)} NUSDC`,
  );

  // tx1: mint YES+NO pair
  const funds = await fetchNusdcFunds(client, arbAddress, mintRaw);
  if (!funds) {
    console.warn('[arb] insufficient NUSDC balance, skipping');
    return;
  }

  const mintTx = new Transaction();
  if (funds.extras.length > 0) {
    mintTx.mergeCoins(
      mintTx.object(funds.primary),
      funds.extras.map((id) => mintTx.object(id)),
    );
  }
  const [mintCoin] = mintTx.splitCoins(mintTx.object(funds.primary), [
    mintTx.pure.u64(mintRaw),
  ]);
  mintTx.moveCall({
    target: `${marketPackageId}::prediction_market::mint_outcome_tokens`,
    arguments: [mintTx.object(marketId), mintCoin, mintTx.object(CLOCK_ID)],
  });

  const mintResult = await executeAndWait(client, keypair, mintTx, 'mint');

  // findMintedPositions's `packageId` arg is for the StructType-prefix filter,
  // not a moveCall target — its dual-prefix accept list already covers both v5
  // and legacy Position types, so passing the latest is fine.
  const positions = await findMintedPositions(
    client,
    (mintResult.objectChanges ?? []) as Array<{
      type: string;
      objectType?: string;
      objectId: string;
    }>,
    PACKAGE_ID,
    LEGACY_PACKAGE_IDS,
  );
  if (!positions) {
    console.error('[arb] aborting: could not identify YES/NO positions after mint');
    return;
  }

  // tx2: sell YES + sell NO in one PTB
  // min_price=1 = accept any positive price; rest_on_no_fill=true = don't abort if partial
  const sellTx = new Transaction();
  sellTx.moveCall({
    target: `${marketPackageId}::prediction_market::place_sell_taker`,
    arguments: [
      sellTx.object(marketId),
      sellTx.object(positions.yesId),
      sellTx.pure.u64(1),
      sellTx.pure.bool(true),
      sellTx.object(CLOCK_ID),
    ],
  });
  sellTx.moveCall({
    target: `${marketPackageId}::prediction_market::place_sell_taker`,
    arguments: [
      sellTx.object(marketId),
      sellTx.object(positions.noId),
      sellTx.pure.u64(1),
      sellTx.pure.bool(true),
      sellTx.object(CLOCK_ID),
    ],
  });

  await executeAndWait(client, keypair, sellTx, 'sell');
  console.log(`[arb] done. estimated profit: ${profitNusdc.toFixed(4)} NUSDC`);
}

// Capture + uncross a single-side cross (best_bid > best_ask on one side).
// Buys the cheapest ask level, then sells the bought shares into the rich bid.
async function executeSingleSideCross(
  client: SuiClient,
  keypair: Ed25519Keypair,
  marketId: string,
  marketPackageId: string,
  isYes: boolean,
  bestBid: number,
  bestAsk: number,
): Promise<void> {
  const arbAddress = keypair.toSuiAddress();
  const spendRaw = nusdcToRaw(MAX_NUSDC_PER_ARB);
  const spreadBps = bestBid - bestAsk;
  const side = isYes ? 'YES' : 'NO';

  console.log(
    `[arb] single-side ${side} cross market=${marketId.slice(0, 16)}...` +
      ` bid=${bestBid}bps ask=${bestAsk}bps spreadBps=${spreadBps}`,
  );

  const funds = await fetchNusdcFunds(client, arbAddress, spendRaw);
  if (!funds) {
    console.warn('[arb] insufficient NUSDC balance, skipping single-side cross');
    return;
  }

  // tx1: buy the cheapest ask level only (max_price = bestAsk = max margin).
  // rest_on_no_fill=false so if the ask vanished between fetch and exec the tx
  // aborts (ENoFillsAtMarketPrice, treated as benign in tick) rather than
  // resting our payment as a new bid. Against a deep level a small MAX_NUSDC
  // fully converts to shares with no resting leftover.
  const buyTx = new Transaction();
  if (funds.extras.length > 0) {
    buyTx.mergeCoins(
      buyTx.object(funds.primary),
      funds.extras.map((id) => buyTx.object(id)),
    );
  }
  const [buyCoin] = buyTx.splitCoins(buyTx.object(funds.primary), [
    buyTx.pure.u64(spendRaw),
  ]);
  buyTx.moveCall({
    target: `${marketPackageId}::prediction_market::place_buy_taker`,
    arguments: [
      buyTx.object(marketId),
      buyTx.pure.bool(isYes),
      buyTx.pure.u64(bestAsk),
      buyTx.pure.bool(false),
      buyCoin,
      buyTx.object(CLOCK_ID),
    ],
  });
  const buyResult = await executeAndWait(client, keypair, buyTx, `xclear-buy:${side}`);

  const positionId = await findSinglePosition(
    client,
    (buyResult.objectChanges ?? []) as Array<{
      type: string;
      objectType?: string;
      objectId: string;
    }>,
    isYes,
    PACKAGE_ID,
    LEGACY_PACKAGE_IDS,
  );
  if (!positionId) {
    console.error('[arb] single-side cross: no position minted, skipping sell');
    return;
  }

  // tx2: sell into the rich bid. min_price floors at the ask we paid + 1 so we
  // never realise a loss. rest_on_no_fill=FALSE is deliberate: if the rich bid
  // was taken between tx1 and tx2, the sell aborts (benign ENoFillsAtMarketPrice)
  // and the bought position stays in the wallet rather than resting as our OWN
  // ask. A rested ask would sit below any surviving higher bid, and
  // place_buy_taker self-skips our own orders, so we could never re-take it --
  // every later tick would re-detect the cross, abort, and burn gas forever
  // without clearing it. Stranding a small position (as the cross-market arb
  // already does on failure) is the safer outcome. A partial fill can still rest
  // a remainder; the repeated-no-fill cooldown in tick() backstops that case.
  const minSell = Math.min(bestAsk + 1, MAX_PRICE_BPS - 1);
  const sellTx = new Transaction();
  sellTx.moveCall({
    target: `${marketPackageId}::prediction_market::place_sell_taker`,
    arguments: [
      sellTx.object(marketId),
      sellTx.object(positionId),
      sellTx.pure.u64(minSell),
      sellTx.pure.bool(false),
      sellTx.object(CLOCK_ID),
    ],
  });
  await executeAndWait(client, keypair, sellTx, `xclear-sell:${side}`);
  console.log(`[arb] single-side ${side} cross: one bite taken (spreadBps=${spreadBps})`);
}

// ========================================
// Per-market check
// ========================================

async function checkMarket(
  client: SuiClient,
  keypair: Ed25519Keypair,
  marketId: string,
): Promise<void> {
  const book = await fetchMarketBook(client, marketId);
  if (!book) return;
  if (book.status !== MARKET_STATUS_OPEN) return;
  if (Date.now() >= book.closeTime) return;

  const { yesBestBid, noBestBid, yesBestAsk, noBestAsk } = book;

  // Score every available opportunity in bps, then act on the most profitable
  // one. Only one action runs per tick so the second leg never executes
  // against a stale book.
  const crossMarketBps =
    yesBestBid !== null && noBestBid !== null
      ? yesBestBid + noBestBid - MAX_PRICE_BPS
      : -Infinity;
  const yesCrossBps =
    yesBestBid !== null && yesBestAsk !== null ? yesBestBid - yesBestAsk : -Infinity;
  const noCrossBps =
    noBestBid !== null && noBestAsk !== null ? noBestBid - noBestAsk : -Infinity;

  const bestBps = Math.max(crossMarketBps, yesCrossBps, noCrossBps);
  if (bestBps < MIN_PROFIT_BPS) return;

  // Dispatch every moveCall by the market's type-tag originalPackageId.
  // Without this, a legacy market against a v5-only PACKAGE_ID fires
  // TypeMismatch every tick until consecutiveErrors hits MAX and the bot
  // crashes (2026-05-20 prod regression).
  let marketPackageId: string;
  try {
    marketPackageId = packageIdForMarketType(book.objectType);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[arb] skipping ${marketId.slice(0, 16)}: ${msg}`);
    return;
  }

  if (bestBps === crossMarketBps) {
    await executeArb(client, keypair, marketId, marketPackageId, yesBestBid!, noBestBid!);
  } else if (bestBps === yesCrossBps) {
    await executeSingleSideCross(
      client, keypair, marketId, marketPackageId, true, yesBestBid!, yesBestAsk!,
    );
  } else {
    await executeSingleSideCross(
      client, keypair, marketId, marketPackageId, false, noBestBid!, noBestAsk!,
    );
  }
}

// ========================================
// Auto-refill
// ========================================

async function ensureGas(address: string): Promise<void> {
  const res = await fetch(`${FAUCET_URL}/gas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ FixedAmountRequest: { recipient: address } }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => String(res.status));
    throw new Error(`gas faucet HTTP ${res.status}: ${text}`);
  }
}

async function ensureNusdc(
  client: SuiClient,
  keypair: Ed25519Keypair,
): Promise<void> {
  const tx = new Transaction();
  tx.setGasBudget(500_000_000);
  for (let i = 0; i < NUSDC_REFILL_ROUNDS; i++) {
    tx.moveCall({
      target: `${TOKENS_PACKAGE}::faucet::request_nusdc`,
      arguments: [tx.object(TOKEN_FAUCET)],
    });
  }
  await executeAndWait(client, keypair, tx, 'nusdc-refill');
}

async function checkAndRefill(
  client: SuiClient,
  keypair: Ed25519Keypair,
  address: string,
): Promise<void> {
  const [gasBalance, nusdcBalance] = await Promise.all([
    client.getBalance({ owner: address }).then((b) => Number(b.totalBalance) / 1e9),
    client.getBalance({ owner: address, coinType: NUSDC_TYPE })
      .then((b) => Number(b.totalBalance) / 10 ** NUSDC_DECIMALS),
  ]);

  if (gasBalance < MIN_GAS_NASUN) {
    console.log(`[refill] gas low (${gasBalance.toFixed(1)} NASUN), requesting from faucet`);
    try {
      await ensureGas(address);
      console.log('[refill] gas refilled');
    } catch (err) {
      console.warn('[refill] gas faucet failed:', (err as Error).message);
    }
  }

  if (nusdcBalance < MIN_NUSDC) {
    console.log(`[refill] NUSDC low (${nusdcBalance.toFixed(2)}), claiming ${NUSDC_REFILL_ROUNDS} rounds`);
    try {
      await ensureNusdc(client, keypair);
      const after = await client.getBalance({ owner: address, coinType: NUSDC_TYPE })
        .then((b) => Number(b.totalBalance) / 10 ** NUSDC_DECIMALS);
      console.log(`[refill] NUSDC refilled: ${nusdcBalance.toFixed(2)} -> ${after.toFixed(2)}`);
    } catch (err) {
      console.warn('[refill] NUSDC faucet failed:', (err as Error).message);
    }
  }
}

// ========================================
// Main loop
// ========================================

let isRunning = false;
let shuttingDown = false;
let consecutiveErrors = 0;

// Per-market cooldown: when a market hits a long-running condition that
// would just throw on every tick (ECapacityExceeded most commonly),
// skip it until cooldownUntil. Keyed by marketId.
const marketCooldown = new Map<string, number>();

// Consecutive ENoFillsAtMarketPrice per market. A one-off is a benign race
// (the level we targeted was taken between fetch and exec), but a sustained
// streak means our own resting order is the only thing crossing the book
// (place_buy_taker / place_sell_taker self-skip it), so we can never clear it
// by taking -- cool the market down rather than retry every tick forever. See
// executeSingleSideCross. Reset to zero on any non-throwing checkMarket.
const marketNoFillStreak = new Map<string, number>();
const MAX_NOFILL_STREAK = 3;

async function tick(
  client: SuiClient,
  keypair: Ed25519Keypair,
  address: string,
  markets: string[],
): Promise<void> {
  if (isRunning || shuttingDown) return;
  isRunning = true;
  try {
    await checkAndRefill(client, keypair, address);
    const now = Date.now();
    for (const marketId of markets) {
      if (shuttingDown) break;
      const cooldownUntil = marketCooldown.get(marketId);
      if (cooldownUntil && cooldownUntil > now) continue;
      try {
        await checkMarket(client, keypair, marketId);
        consecutiveErrors = 0;
        marketNoFillStreak.delete(marketId);
        if (cooldownUntil) marketCooldown.delete(marketId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (ECAPACITY_EXCEEDED_PATTERN.test(msg)) {
          // Price level is full -- arb-bot can't fix this, it just has to
          // wait for fills to age out. Cool down this market and move on
          // without bumping the suicide counter.
          marketCooldown.set(marketId, Date.now() + CAPACITY_COOLDOWN_MS);
          console.warn(
            `[tick] market=${marketId.slice(0, 16)}... ECapacityExceeded; cooldown ${CAPACITY_COOLDOWN_MS / 60_000}min`,
          );
          continue;
        }
        if (ENO_FILLS_PATTERN.test(msg)) {
          const streak = (marketNoFillStreak.get(marketId) ?? 0) + 1;
          if (streak >= MAX_NOFILL_STREAK) {
            // Persistent no-fill: almost certainly our own resting order is the
            // only thing crossing the book and we self-skip it. Cool down
            // instead of looping. Counter bump is suppressed (not a crash bug).
            marketCooldown.set(marketId, Date.now() + CAPACITY_COOLDOWN_MS);
            marketNoFillStreak.delete(marketId);
            console.warn(
              `[tick] market=${marketId.slice(0, 16)}... ${MAX_NOFILL_STREAK} consecutive no-fills` +
                ` (likely self-owned cross); cooldown ${CAPACITY_COOLDOWN_MS / 60_000}min`,
            );
          } else {
            marketNoFillStreak.set(marketId, streak);
            console.warn(
              `[tick] market=${marketId.slice(0, 16)}... no-fill race (ENoFillsAtMarketPrice)` +
                ` ${streak}/${MAX_NOFILL_STREAK}; skipping`,
            );
          }
          continue;
        }
        if (isTransientRpcError(err)) {
          // 503 / lock conflict -- next tick is the cure. No counter bump.
          console.warn(
            `[tick] market=${marketId.slice(0, 16)}... transient: ${msg}`,
          );
          continue;
        }
        consecutiveErrors++;
        console.error(
          `[tick] market=${marketId.slice(0, 16)}... error=${msg}`,
        );
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          console.error('[tick] too many consecutive errors, exiting');
          process.exit(1);
        }
      }
    }
  } finally {
    isRunning = false;
  }
}

async function main(): Promise<void> {
  const keyInput = process.env.PREDICTION_ARB_PRIVATE_KEY;
  if (!keyInput) throw new Error('PREDICTION_ARB_PRIVATE_KEY is required');
  if (!PACKAGE_ID) throw new Error('PREDICTION_PACKAGE_ID is required');
  // Contract caps a single payment at MAX_PAYMENT_AMOUNT = 100k NUSDC
  // (prediction_market.move:58). A larger MAX_NUSDC would make every buy/mint
  // abort with EInvalidInput (code 17) -- not a benign code -- crash-looping
  // the bot via consecutiveErrors. Fail fast at startup instead.
  if (!Number.isFinite(MAX_NUSDC_PER_ARB) || MAX_NUSDC_PER_ARB <= 0 || MAX_NUSDC_PER_ARB > 100_000) {
    throw new Error('PREDICTION_ARB_MAX_NUSDC must be a number in (0, 100000]');
  }

  const keypair = parseKeypair(keyInput);
  const client = new SuiClient({ url: RPC_URL });
  const arbAddress = keypair.toSuiAddress();

  console.log('[arb-bot] starting');
  console.log(`[arb-bot] address=${arbAddress}`);
  console.log(`[arb-bot] package=${PACKAGE_ID}`);
  console.log(
    `[arb-bot] legacy emitter packages (discovery)=${LEGACY_PACKAGE_IDS.length > 0 ? LEGACY_PACKAGE_IDS.join(',') : '(none)'}`,
  );
  console.log(
    `[arb-bot] legacy dispatch=${LEGACY_ORIGINAL_ID && LEGACY_LATEST_PACKAGE_ID ? `${LEGACY_ORIGINAL_ID} -> ${LEGACY_LATEST_PACKAGE_ID}` : '(none)'}`,
  );
  console.log(
    `[arb-bot] interval=${INTERVAL_MS}ms maxNusdc=${MAX_NUSDC_PER_ARB} minProfitBps=${MIN_PROFIT_BPS}`,
  );

  // Startup discovery with indefinite RPC retry. Without this, a sustained
  // 503 on startup hits process.exit, pm2 restarts, hits 503 again -- and
  // the restart count climbs past 100 in a single bad RPC hour.
  let markets: string[] = [];
  for (let attempt = 1; attempt <= 60; attempt++) {
    if (shuttingDown) process.exit(0);
    try {
      markets = await discoverMarketIds(client, DISCOVERY_PKGS);
      break;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!isTransientRpcError(err) || attempt === 60) {
        console.error(`[arb-bot] startup discovery failed (${attempt}/60): ${msg}`);
        throw err;
      }
      console.warn(`[arb-bot] startup discovery RPC error (${attempt}/60): ${msg}. Retrying in 30s...`);
      await new Promise((r) => setTimeout(r, 30_000));
    }
  }
  console.log(`[arb-bot] discovered ${markets.length} markets`);

  const runOnce = process.argv.includes('--once');
  await tick(client, keypair, arbAddress, markets);
  if (runOnce) return;

  process.on('SIGINT', () => {
    shuttingDown = true;
  });
  process.on('SIGTERM', () => {
    shuttingDown = true;
  });

  let lastDiscoveryAt = Date.now();

  while (!shuttingDown) {
    await new Promise<void>((resolve) => setTimeout(resolve, INTERVAL_MS));
    if (shuttingDown) break;

    if (Date.now() - lastDiscoveryAt >= DISCOVERY_INTERVAL_MS) {
      markets = await discoverMarketIds(client, DISCOVERY_PKGS);
      console.log(`[arb-bot] rediscovered ${markets.length} markets`);
      lastDiscoveryAt = Date.now();
    }

    await tick(client, keypair, arbAddress, markets);
  }

  console.log('[arb-bot] shutdown complete');
}

main().catch((err) => {
  console.error('[arb-bot] fatal:', err);
  process.exit(1);
});
