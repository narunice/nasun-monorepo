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
 * Stateless: re-reads on-chain status each tick. Single-instance enforced
 * by env (run on prod only). Gas top-up delegated to keeper-gas-watchdog.
 *
 * Env vars:
 *   PREDICTION_RESOLVER_KEY        Private key (hex or suiprivkey) of the
 *                                  resolver wallet. Must match market.resolver.
 *   PREDICTION_KEEPER_MARKETS      Comma-separated market object IDs.
 *   PREDICTION_KEEPER_INTERVAL_MS  Polling interval (default 60000).
 *   PREDICTION_PACKAGE_ID          Deployed prediction-market package id (required).
 *   NASUN_RPC_URL                  RPC endpoint (default devnet).
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

// ========================================
// Configuration
// ========================================

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
const CLOCK_ID = '0x6';
const DEFAULT_INTERVAL_MS = 60_000;
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

// Per-market log-once flags so deadline / resolver-mismatch warnings don't spam
// every tick. Reset only when the bot restarts (acceptable: alerts are sticky).
type AlertKind = 'deadline' | 'resolver' | 'criteria' | 'price';
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

  if (now > market.resolveDeadline) {
    logOnce(
      marketId,
      'deadline',
      `[${timestamp()}] ${marketId}: deadline passed, manual cancel_expired_market required`,
    );
    return;
  }

  if (market.resolver !== resolverAddress) {
    logOnce(
      marketId,
      'resolver',
      `[${timestamp()}] ${marketId}: resolver=${market.resolver} does not match keeper=${resolverAddress}, skipping`,
    );
    return;
  }

  const criteria = parseResolutionCriteria(market.resolutionCriteria);
  if (!criteria) {
    logOnce(
      marketId,
      'criteria',
      `[${timestamp()}] ${marketId}: non-standard resolution criteria, manual resolve required`,
    );
    return;
  }

  let price: number;
  try {
    price = await fetchPriceWithFallback(criteria.symbol);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Wrap so the tick loop can distinguish transient upstream price failures
    // from chain errors (which should bump the consecutive-error counter).
    throw new PriceFetchError(msg);
  }

  const outcome = evaluateOutcome(criteria, price);
  console.log(
    `[${timestamp()}] ${marketId}: price=${price} ${criteria.comparison} threshold=${criteria.threshold} -> outcome=${outcome ? 'YES' : 'NO'}`,
  );

  // Wrap the resolve call in a status re-check so an RPC drop after a successful
  // tx doesn't trigger a double-resolve on retry. If the market is already
  // RESOLVED, the second submit would revert with EMarketAlreadyResolved anyway,
  // but this preempts the wasted gas + log noise.
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

  const marketsRaw = process.env.PREDICTION_KEEPER_MARKETS || '';
  const markets = marketsRaw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (markets.length === 0) {
    console.error('PREDICTION_KEEPER_MARKETS must list at least one market id');
    process.exit(1);
  }

  const intervalMs = parseInt(
    process.env.PREDICTION_KEEPER_INTERVAL_MS || String(DEFAULT_INTERVAL_MS),
    10,
  );
  if (!Number.isFinite(intervalMs) || intervalMs < 5_000) {
    console.error('PREDICTION_KEEPER_INTERVAL_MS must be >= 5000');
    process.exit(1);
  }

  const keypair = parseKeypair(keyInput);
  const resolverAddress = keypair.toSuiAddress();
  const client = new SuiClient({ url: RPC_URL });

  console.log(`[${timestamp()}] Prediction Keeper starting`);
  console.log(`[${timestamp()}] Resolver: ${resolverAddress}`);
  console.log(`[${timestamp()}] RPC: ${RPC_URL}`);
  console.log(`[${timestamp()}] Package: ${packageId}`);
  console.log(`[${timestamp()}] Markets (${markets.length}): ${markets.join(', ')}`);
  console.log(`[${timestamp()}] Interval: ${intervalMs}ms`);

  // Interruptible sleep: shutdown signal cancels the wait immediately.
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
  if (runOnce) {
    process.exit(0);
  }

  while (!shuttingDown) {
    await sleep(intervalMs);
    if (shuttingDown) break;
    await tick(client, keypair, packageId, markets, resolverAddress);
  }
}

main().catch((err) => {
  console.error(`[${timestamp()}] Fatal error:`, err);
  process.exit(1);
});
