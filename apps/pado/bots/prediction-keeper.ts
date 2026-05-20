/**
 * Prediction Market Keeper Bot
 *
 * Auto-resolves binary prediction markets after their close time using
 * a structured resolution_criteria block embedded in the market metadata.
 *
 * Lifecycle (per market, per tick):
 *   OPEN + now < close_time              -> idle
 *   OPEN + close_time <= now <= deadline -> fetch price, evaluate, resolve_market
 *   OPEN + now > deadline                -> log warn (window expired)
 *   RESOLVED / CANCELLED                 -> skip
 *   non-standard criteria                -> log warn, skip (manual resolve path)
 *
 * Market discovery:
 *   If PREDICTION_KEEPER_MARKETS is set, those IDs are pinned (static list).
 *   Otherwise, markets are discovered from on-chain MarketCreated events and
 *   refreshed every PREDICTION_KEEPER_DISCOVER_INTERVAL_MS (default 10 min).
 *   Both modes can be combined: pinned IDs are merged with discovered ones.
 *
 * Stateless: re-reads on-chain status each tick. Single-instance enforced
 * by env (run on prod only). Gas top-up delegated to keeper-gas-watchdog.
 *
 * Env vars:
 *   PREDICTION_RESOLVER_KEY                 Private key (hex or suiprivkey).
 *   PREDICTION_KEEPER_MARKETS               Optional comma-separated market IDs (static pin).
 *   PREDICTION_KEEPER_INTERVAL_MS           Polling interval (default 60000).
 *   PREDICTION_KEEPER_DISCOVER_INTERVAL_MS  Market list refresh interval (default 600000).
 *   PREDICTION_PACKAGE_ID                   Deployed package id (required).
 *   NASUN_RPC_URL                           RPC endpoint (default devnet).
 *
 * Usage:
 *   node --env-file=.env --import tsx prediction-keeper.ts
 *   node --env-file=.env --import tsx prediction-keeper.ts --once
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import { withRetry } from './lib/retry.js';
import {
  parseResolutionCriteria,
  evaluateOutcome,
  BINANCE_SYMBOL_TO_COINGECKO,
  type ResolutionCriteria,
} from './lib/prediction-criteria.js';
import { discoverMarketIds } from './lib/prediction-market-discovery.js';
import {
  fetchStockDailyClose,
  inferMarket as inferStockMarket,
  PriceFetchError as StockPriceFetchError,
  PriceIntegrityError,
  type StockQuote,
} from './lib/stock-price.js';
import { localDateString, sessionCloseUtc } from './lib/market-holidays.js';
import { EXPIRE_GRACE_MS, detectKind, type ResolveResult } from './lib/resolvers/types.js';
import { parseSpaceCriteria, resolveSpace, SpaceParseError } from './lib/resolvers/space.js';
import { parseMusicCriteria, resolveMusic, MusicParseError } from './lib/resolvers/music.js';
import { parseSportsCriteria, resolveSports, SportsParseError } from './lib/resolvers/sports.js';
import { parseWeatherCriteria, resolveWeather, WeatherParseError } from './lib/resolvers/weather.js';
import { parseUfcCriteria, resolveUfc, UfcParseError } from './lib/resolvers/ufc.js';

// ========================================
// Configuration
// ========================================

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
const CLOCK_ID = '0x6';
const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_DISCOVER_INTERVAL_MS = 10 * 60_000;
const MAX_CONSECUTIVE_ERRORS = 10;

// On-chain status enum (mirrors Move STATUS_*).
const STATUS_OPEN = 0;
const STATUS_RESOLVED = 2;
const STATUS_CANCELLED = 3;

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
): Promise<{ digest: string }> {
  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });
  if (result.effects?.status?.status !== 'success') {
    throw new Error(`${label} TX failed: ${result.effects?.status?.error || 'unknown'}`);
  }
  console.log(`[${timestamp()}] ${label} TX: ${result.digest}`);
  await client.waitForTransaction({ digest: result.digest });
  return { digest: result.digest };
}

// ========================================
// Market fetch
// ========================================

interface PredictionMarket {
  id: string;
  status: number;
  closeTime: number;
  resolveDeadline: number;
  resolver: string;
  resolutionCriteria: string;
}

async function fetchMarket(client: SuiClient, marketId: string): Promise<PredictionMarket | null> {
  const obj = await client.getObject({
    id: marketId,
    options: { showContent: true },
  });
  if (!obj.data?.content || obj.data.content.dataType !== 'moveObject') return null;
  const fields = obj.data.content.fields as Record<string, unknown>;
  return {
    id: marketId,
    status: Number(fields.status ?? 0),
    closeTime: Number(fields.close_time ?? 0),
    resolveDeadline: Number(fields.resolve_deadline ?? 0),
    resolver: String(fields.resolver ?? ''),
    resolutionCriteria: String(fields.resolution_criteria ?? ''),
  };
}

function statusLabel(status: number): string {
  if (status === STATUS_OPEN) return 'OPEN';
  if (status === STATUS_RESOLVED) return 'RESOLVED';
  if (status === STATUS_CANCELLED) return 'CANCELLED';
  return `UNKNOWN(${status})`;
}

// ========================================
// Resolution criteria parser
// ========================================

// ========================================
// Price fetch (Binance -> CoinGecko fallback)
// ========================================

async function fetchBinancePrice(symbol: string): Promise<number> {
  const url = `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Binance HTTP ${response.status}`);
  }
  const data = (await response.json()) as { symbol?: string; price?: string };
  const price = parseFloat(data.price ?? '');
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`Binance returned invalid price: ${data.price}`);
  }
  return price;
}

async function fetchCoinGeckoPrice(symbol: string): Promise<number> {
  const id = BINANCE_SYMBOL_TO_COINGECKO[symbol];
  if (!id) throw new Error(`No CoinGecko mapping for ${symbol}`);
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`;
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`CoinGecko HTTP ${response.status}`);
  }
  const data = (await response.json()) as Record<string, { usd?: number }>;
  const price = data[id]?.usd;
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    throw new Error(`CoinGecko returned invalid price for ${id}`);
  }
  return price;
}

async function fetchPriceWithFallback(symbol: string): Promise<number> {
  try {
    return await fetchBinancePrice(symbol);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[${timestamp()}] Binance fetch failed (${msg}), falling back to CoinGecko`);
    return await fetchCoinGeckoPrice(symbol);
  }
}

// ========================================
// Stock daily-close cache + dispatcher
// ========================================

// Daily close prices never change after the session is finalized, so we cache
// per (symbol, sessionDateLocal). Cache survives the keeper process lifetime
// only — restarts re-fetch, which is safe. Map is bounded by # of finance
// markets * recent sessions, which stays well under 1000 entries in practice.
const stockQuoteCache = new Map<string, StockQuote>();

function stockCacheKey(symbol: string, sessionDateLocal: string): string {
  return `${symbol}@${sessionDateLocal}`;
}

/**
 * Resolve a stock daily close for the criteria's reading-time session.
 *
 * Reading time in the criteria block is the regular-session close in UTC.
 * We derive the session's local-date label (YYYY-MM-DD in the exchange's
 * timezone) and require:
 *   - now >= session UTC close + 5 min grace (else: session in progress)
 *   - cached or freshly fetched candle whose date matches the session
 */
async function fetchStockPriceForCriteria(
  criteria: ResolutionCriteria,
  closeTimeMs: number,
): Promise<number> {
  const market = inferStockMarket(criteria.symbol);
  const sessionDateLocal = localDateString(market, new Date(closeTimeMs));
  const sessionUtcClose = sessionCloseUtc(market, new Date(closeTimeMs));
  const grace = 5 * 60 * 1000;
  if (Date.now() < sessionUtcClose + grace) {
    throw new StockPriceFetchError(
      `session ${sessionDateLocal} not yet finalized (closes at ${new Date(sessionUtcClose).toISOString()})`,
    );
  }

  const key = stockCacheKey(criteria.symbol, sessionDateLocal);
  const cached = stockQuoteCache.get(key);
  if (cached) return cached.price;

  const quote = await fetchStockDailyClose(criteria, sessionDateLocal);
  stockQuoteCache.set(key, quote);
  return quote.price;
}

// ========================================
// Resolve market
// ========================================

function buildResolveTx(packageId: string, marketId: string, outcome: boolean): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::prediction_market::resolve_market`,
    arguments: [tx.object(marketId), tx.pure.bool(outcome), tx.object(CLOCK_ID)],
  });
  return tx;
}

function buildCancelExpiredTx(packageId: string, marketId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::prediction_market::cancel_expired_market`,
    arguments: [tx.object(marketId), tx.object(CLOCK_ID)],
  });
  return tx;
}

// Stderr-only operator alert. `pm2 logs prediction-keeper --err` is the
// current channel until a Telegram client is wired in. Per-market dedupe
// is handled by the surrounding logOnce() helper.
function alertOps(message: string): void {
  console.error(`[ALERT] ${new Date().toISOString()} ${message}`);
}

const DRY_RUN = process.env.PREDICTION_KEEPER_DRY_RUN === 'true';

// Per-market log-once flags so deadline / resolver-mismatch warnings don't spam
// every tick. Reset only when the bot restarts (acceptable: alerts are sticky).
type AlertKind = 'deadline' | 'resolver' | 'criteria' | 'price' | 'pending-near-deadline' | 'expired-cancelled' | 'parse-error';
const alertedOnce = new Map<string, Set<AlertKind>>();

function logOnce(marketId: string, kind: AlertKind, message: string): void {
  let set = alertedOnce.get(marketId);
  if (!set) {
    set = new Set();
    alertedOnce.set(marketId, set);
  }
  if (set.has(kind)) return;
  set.add(kind);
  console.warn(message);
}

function clearAlerts(marketId: string): void {
  alertedOnce.delete(marketId);
}

class PriceFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PriceFetchError';
  }
}

async function processMarket(
  client: SuiClient,
  keypair: Ed25519Keypair,
  packageId: string,
  marketId: string,
  resolverAddress: string,
): Promise<void> {
  const market = await fetchMarket(client, marketId);
  if (!market) {
    console.warn(`[${timestamp()}] ${marketId}: not found, skipping`);
    return;
  }

  const label = statusLabel(market.status);
  console.log(
    `[${timestamp()}] ${marketId}: status=${label} close=${new Date(market.closeTime).toISOString()} deadline=${new Date(market.resolveDeadline).toISOString()}`,
  );

  if (market.status !== STATUS_OPEN) {
    // Once a market is RESOLVED/CANCELLED, downstream alerts no longer apply.
    clearAlerts(marketId);
    return;
  }

  const now = Date.now();
  if (now < market.closeTime) return;

  if (market.resolver !== resolverAddress) {
    logOnce(
      marketId,
      'resolver',
      `[${timestamp()}] ${marketId}: resolver=${market.resolver} does not match keeper=${resolverAddress}, skipping`,
    );
    return;
  }

  // Deadline elapsed: keeper auto-calls permissionless cancel_expired_market.
  // The Move side asserts `now > resolve_deadline` strictly; EXPIRE_GRACE_MS
  // absorbs RPC clock skew so the first attempt does not abort.
  if (now > market.resolveDeadline + EXPIRE_GRACE_MS) {
    if (DRY_RUN) {
      logOnce(marketId, 'expired-cancelled',
        `[${timestamp()}] [DRY_RUN] ${marketId}: would call cancel_expired_market`);
      return;
    }
    try {
      await withRetry(
        async () => {
          const fresh = await fetchMarket(client, marketId);
          if (fresh && fresh.status !== STATUS_OPEN) {
            return { digest: 'noop' };
          }
          return executeAndWait(client, keypair, buildCancelExpiredTx(packageId, marketId), 'cancel_expired_market');
        },
        { label: `cancel_expired_market(${marketId})` },
      );
      alertOps(`${marketId} expired past deadline, auto-cancelled`);
      clearAlerts(marketId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logOnce(marketId, 'expired-cancelled',
        `[${timestamp()}] ${marketId}: cancel_expired_market failed: ${msg}`);
    }
    return;
  }

  // Dispatch to a resolver. Try the new Kind:-based path first; otherwise
  // fall back to the legacy crypto/stock parser (host-based classification).
  let result: ResolveResult;
  try {
    result = await dispatchResolve(market, now);
  } catch (err) {
    if (err instanceof PriceIntegrityError) throw err;     // hard escalation
    if (err instanceof PriceFetchError) throw err;          // transient warn
    const msg = err instanceof Error ? err.message : String(err);
    logOnce(marketId, 'parse-error',
      `[${timestamp()}] ${marketId}: criteria parse/dispatch error: ${msg}`);
    return;
  }

  if (result.state === 'pending') {
    // Quiet log: pending is normal flow, do not bump consecutiveErrors.
    console.log(`[${timestamp()}] ${marketId}: pending (${result.reason})`);
    if (now > market.resolveDeadline - 3600_000) {
      logOnce(marketId, 'pending-near-deadline',
        `${marketId} still pending within 1h of resolve_deadline: ${result.reason}`);
      alertOps(`${marketId} pending within 1h of deadline: ${result.reason}`);
    }
    return;
  }

  const outcome = result.outcome;
  console.log(`[${timestamp()}] ${marketId}: ${result.evidence} -> outcome=${outcome ? 'YES' : 'NO'}`);

  if (DRY_RUN) {
    logOnce(marketId, 'deadline', `[${timestamp()}] [DRY_RUN] ${marketId}: would resolve as ${outcome ? 'YES' : 'NO'}`);
    return;
  }

  // Wrap the resolve call in a status re-check so an RPC drop after a successful
  // tx doesn't trigger a double-resolve on retry.
  await withRetry(
    async () => {
      const fresh = await fetchMarket(client, marketId);
      if (fresh && fresh.status !== STATUS_OPEN) {
        console.log(
          `[${timestamp()}] ${marketId}: status changed to ${statusLabel(fresh.status)} during retry, skipping resubmit`,
        );
        return { digest: 'noop' };
      }
      return executeAndWait(client, keypair, buildResolveTx(packageId, marketId, outcome), 'resolve_market');
    },
    { label: `resolve_market(${marketId})` },
  );
  console.log(`[${timestamp()}] ${marketId}: resolved as ${outcome ? 'YES' : 'NO'}`);
  clearAlerts(marketId);
}

interface MarketLite {
  resolutionCriteria: string;
  closeTime: number;
}

async function dispatchResolve(market: MarketLite, now: number): Promise<ResolveResult> {
  const text = market.resolutionCriteria;
  const kind = detectKind(text);

  if (kind === 'space') {
    const criteria = parseSpaceCriteria(text);
    return await resolveSpace(criteria, now);
  }
  if (kind === 'music') {
    const criteria = parseMusicCriteria(text);
    return await resolveMusic(criteria, now);
  }
  if (kind === 'sports') {
    const criteria = parseSportsCriteria(text);
    return await resolveSports(criteria, now);
  }
  if (kind === 'weather') {
    const criteria = parseWeatherCriteria(text);
    return await resolveWeather(criteria, now);
  }
  if (kind === 'ufc') {
    const criteria = parseUfcCriteria(text);
    return await resolveUfc(criteria, now);
  }

  // Legacy path: crypto/stock via existing parseResolutionCriteria + evaluateOutcome.
  const legacy = parseResolutionCriteria(text);
  if (!legacy) {
    return { state: 'pending', reason: 'non-standard resolution criteria (no Kind: and no recognised Source)' };
  }
  let price: number;
  try {
    if (legacy.kind === 'stock') {
      price = await fetchStockPriceForCriteria(legacy, market.closeTime);
    } else {
      price = await fetchPriceWithFallback(legacy.symbol);
    }
  } catch (err) {
    if (err instanceof PriceIntegrityError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new PriceFetchError(msg);
  }
  const outcome = evaluateOutcome(legacy, price);
  return {
    state: 'resolved',
    outcome,
    evidence: `price=${price} ${legacy.comparison} threshold=${legacy.threshold}`,
  };
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
  resolverAddress: string,
): Promise<void> {
  if (isRunning || shuttingDown) return;
  isRunning = true;
  try {
    for (const marketId of markets) {
      if (shuttingDown) break;
      try {
        await processMarket(client, keypair, packageId, marketId, resolverAddress);
        consecutiveErrors = 0;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (err instanceof PriceFetchError) {
          // Upstream API failure -- transient, do not bump the chain-error counter.
          // pm2 restart wouldn't recover Binance/CoinGecko, so just warn.
          console.warn(`[${timestamp()}] [PRICE WARN] ${marketId}: ${msg}`);
          continue;
        }
        consecutiveErrors++;
        const prefix = consecutiveErrors >= 5 ? '[PREDICTION CRITICAL]' : '[PREDICTION ERROR]';
        console.error(
          `[${timestamp()}] ${prefix} ${marketId}: ${msg} (consecutive: ${consecutiveErrors})`,
        );
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          console.error(
            `[${timestamp()}] [PREDICTION CRITICAL] ${MAX_CONSECUTIVE_ERRORS} consecutive errors. Exiting for pm2 restart.`,
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

async function main(): Promise<void> {
  const keyInput = process.env.PREDICTION_RESOLVER_KEY;
  if (!keyInput) {
    console.error('PREDICTION_RESOLVER_KEY environment variable is required');
    process.exit(1);
  }

  const packageIdRaw = process.env.PREDICTION_PACKAGE_ID;
  if (!packageIdRaw || !/^0x[0-9a-fA-F]{64}$/.test(packageIdRaw)) {
    console.error('PREDICTION_PACKAGE_ID environment variable is required (0x-prefixed 32-byte hex)');
    process.exit(1);
  }
  const packageId = packageIdRaw.toLowerCase();

  // Optional: previous publish id(s) for dual-scan of MarketCreated events
  // across an upgrade boundary. Sui pins event type tags to the emitter package
  // id, so markets created before the most recent upgrade can only be found by
  // querying their original publish. Multiple legacy ids are comma-separated.
  const legacyPackageIds = (process.env.PREDICTION_PACKAGE_ID_LEGACY || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^0x[0-9a-f]{64}$/.test(s));

  // Pinned markets (optional): merged with auto-discovered list.
  const pinnedMarkets = (process.env.PREDICTION_KEEPER_MARKETS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^0x[0-9a-f]{64}$/.test(s));

  const intervalMs = parseInt(
    process.env.PREDICTION_KEEPER_INTERVAL_MS || String(DEFAULT_INTERVAL_MS),
    10,
  );
  if (!Number.isFinite(intervalMs) || intervalMs < 5_000) {
    console.error('PREDICTION_KEEPER_INTERVAL_MS must be >= 5000');
    process.exit(1);
  }

  const discoverIntervalMs = parseInt(
    process.env.PREDICTION_KEEPER_DISCOVER_INTERVAL_MS || String(DEFAULT_DISCOVER_INTERVAL_MS),
    10,
  );

  const keypair = parseKeypair(keyInput);
  const resolverAddress = keypair.toSuiAddress();
  const client = new SuiClient({ url: RPC_URL });

  console.log(`[${timestamp()}] Prediction Keeper starting`);
  console.log(`[${timestamp()}] Resolver: ${resolverAddress}`);
  console.log(`[${timestamp()}] RPC: ${RPC_URL}`);
  console.log(`[${timestamp()}] Package: ${packageId}`);
  console.log(`[${timestamp()}] Legacy packages: ${legacyPackageIds.length > 0 ? legacyPackageIds.join(', ') : '(none)'}`);
  console.log(`[${timestamp()}] Pinned markets: ${pinnedMarkets.length > 0 ? pinnedMarkets.join(', ') : '(none)'}`);
  console.log(`[${timestamp()}] Tick interval: ${intervalMs}ms  Discover interval: ${discoverIntervalMs}ms`);
  console.log(`[${timestamp()}] DRY_RUN: ${DRY_RUN ? 'ENABLED (no on-chain writes)' : 'disabled (live)'}`);
  console.log(`[${timestamp()}] Resolvers: space=${process.env.SPACE_RESOLVER_DISABLED === 'true' ? 'OFF' : 'on'} music=${process.env.MUSIC_RESOLVER_DISABLED === 'true' ? 'OFF' : 'on'} sports=${process.env.SPORTS_RESOLVER_DISABLED === 'true' ? 'OFF' : 'on'} weather=${process.env.WEATHER_RESOLVER_DISABLED === 'true' ? 'OFF' : 'on'}`);

  // Initial market discovery.
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

  await tick(client, keypair, packageId, markets, resolverAddress);
  if (runOnce) process.exit(0);

  while (!shuttingDown) {
    await sleep(intervalMs);
    if (shuttingDown) break;

    // Periodically refresh market list.
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

    await tick(client, keypair, packageId, markets, resolverAddress);
  }
}

main().catch((err) => {
  console.error(`[${timestamp()}] Fatal error:`, err);
  process.exit(1);
});
