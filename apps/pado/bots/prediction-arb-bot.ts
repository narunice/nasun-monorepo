/**
 * Prediction Market Arbitrage Bot
 *
 * Monitors all open prediction markets for crossed orderbook states where
 * (best_yes_bid + best_no_bid) > 10000 bps, capturing risk-free profit via:
 *
 *   tx1: mint_outcome_tokens(amount NUSDC) -> YES + NO positions sent to wallet
 *   tx2: place_sell_taker(YES) + place_sell_taker(NO) in one PTB
 *
 * Profit per arb: (yesBid + noBid - 10000) bps * mintAmount / 10000
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

async function executeAndWait(
  client: SuiClient,
  keypair: Ed25519Keypair,
  tx: Transaction,
  label: string,
) {
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });
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
}

async function fetchMarketBook(
  client: SuiClient,
  marketId: string,
): Promise<MarketBook | null> {
  try {
    const obj = await client.getObject({ id: marketId, options: { showContent: true, showType: true } });
    const fields = (obj.data?.content as { fields?: Record<string, unknown> } | undefined)?.fields;
    if (!fields) return null;

    const yesPrices = (fields.yes_bid_prices as string[]) ?? [];
    const noPrices = (fields.no_bid_prices as string[]) ?? [];

    return {
      status: Number(fields.status),
      closeTime: Number(fields.close_time),
      objectType: String(obj.data?.type ?? ''),
      // yes_bid_prices is sorted descending (highest first)
      yesBestBid: yesPrices.length > 0 ? Number(yesPrices[0]) : null,
      noBestBid: noPrices.length > 0 ? Number(noPrices[0]) : null,
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

async function findMintedPositions(
  client: SuiClient,
  objectChanges: Array<{ type: string; objectType?: string; objectId: string }>,
  packageId: string,
  legacyPackageIds: string[] = [],
): Promise<Positions | null> {
  // Sui anchors a struct's type tag to the publish that defined the struct,
  // so a Position object minted via the latest package id still carries the
  // type prefix of the publish where Position was originally introduced
  // (see prediction-lp-bot's stale-package guard). Accept any prefix that
  // matches an upgrade-chain id we know about.
  const positionPrefixes = [packageId, ...legacyPackageIds].map(
    (p) => `${p}::prediction_market::Position`,
  );
  const matchesAnyPrefix = (ot?: string): boolean =>
    typeof ot === 'string' && positionPrefixes.some((p) => ot.startsWith(p));
  const created = objectChanges.filter(
    (c) => c.type === 'created' && matchesAnyPrefix(c.objectType),
  );
  if (created.length < 2) {
    console.error(`[arb] expected 2 created Positions, got ${created.length}`);
    return null;
  }

  // Retry getObject: executeAndWait returns when the executing fullnode has the
  // tx, but a subsequent client.getObject can route to a different read replica
  // that has not yet indexed the new owned object, returning content=null. This
  // produced 32 "could not identify YES/NO" aborts between 14:59 and 15:06 UTC
  // on 2026-05-18, each one stranding a YES+NO pair in the arb wallet until the
  // market resolves.
  const fetchWithRetry = async (objectId: string) => {
    for (let attempt = 1; attempt <= 4; attempt++) {
      const obj = await client.getObject({ id: objectId, options: { showContent: true } });
      const fields = (obj.data?.content as { fields?: { is_yes?: boolean } } | undefined)?.fields;
      if (fields && typeof fields.is_yes === 'boolean') return fields;
      if (attempt < 4) await new Promise((r) => setTimeout(r, 300 * attempt));
    }
    return undefined;
  };

  const [aFields, bFields] = await Promise.all([
    fetchWithRetry(created[0].objectId),
    fetchWithRetry(created[1].objectId),
  ]);
  if (!aFields || !bFields) return null;

  return aFields.is_yes
    ? { yesId: created[0].objectId, noId: created[1].objectId }
    : { yesId: created[1].objectId, noId: created[0].objectId };
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

  const { yesBestBid, noBestBid } = book;
  if (yesBestBid === null || noBestBid === null) return;

  const profitBps = yesBestBid + noBestBid - MAX_PRICE_BPS;
  if (profitBps < MIN_PROFIT_BPS) return;

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

  await executeArb(client, keypair, marketId, marketPackageId, yesBestBid, noBestBid);
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
    for (const marketId of markets) {
      if (shuttingDown) break;
      try {
        await checkMarket(client, keypair, marketId);
        consecutiveErrors = 0;
      } catch (err) {
        consecutiveErrors++;
        console.error(
          `[tick] market=${marketId.slice(0, 16)}... error=${(err as Error).message}`,
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

  let markets = await discoverMarketIds(client, DISCOVERY_PKGS);
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
