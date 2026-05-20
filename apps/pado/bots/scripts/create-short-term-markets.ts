/**
 * Create Short-Term Prediction Markets (1d / 2d / 3d / 4d horizons)
 *
 * Spawns 6 assets x 4 horizons = 24 binary daily-close prediction markets:
 *   crypto: BTC, ETH, SOL    (Binance spot, 24/7)
 *   stocks: AAPL, NVDA,
 *           005930.KS Samsung (next-trading-day session close)
 *
 * Thresholds are picked off live prices at script launch with a small bias
 * that grows with the horizon, mixed direction across assets so the lineup
 * is not uniformly bullish.
 *
 * Usage:
 *   --dry-run   Print specs only; no on-chain tx
 *
 * Required env vars (when not --dry-run):
 *   PREDICTION_ADMIN_KEY          ed25519 / suiprivkey of AdminCap holder
 *   PREDICTION_RESOLVER_ADDRESS   0x-prefixed 32-byte resolver address
 *   PREDICTION_PACKAGE_ID         Deployed prediction package id
 *   PREDICTION_ADMIN_CAP          AdminCap object id (optional default)
 *   NASUN_RPC_URL                 RPC endpoint (default devnet)
 *   TWELVE_DATA_API_KEY           Required for AAPL / NVDA live close lookup
 *
 * After creation, the prediction keeper auto-discovers markets every 10 min.
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import {
  nextTradingDay,
  sessionCloseUtc,
  localDateString,
  type Market,
} from '../lib/market-holidays.js';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';

if (RPC_URL.includes('mainnet')) {
  console.error('This script must not run against mainnet. Aborting.');
  process.exit(1);
}

const CLOCK_ID = '0x6';
const DEFAULT_ADMIN_CAP = '0xd90ae72defe2c4e2b149611c72885a1ebf679ae7bda778b35644f0e3946aedf8';
const HEX_64 = /^0x[0-9a-fA-F]{64}$/;

// Crypto: 2 h after close. Stock: 7 d to absorb holidays / source outages.
const CRYPTO_RESOLVE_BUFFER_MS = 2 * 60 * 60_000;
const STOCK_RESOLVE_BUFFER_MS = 7 * 24 * 60 * 60_000;

type AssetKind = 'crypto' | 'stock';

interface CryptoTemplate {
  kind: 'crypto';
  symbol: string;            // "BTC"
  binanceSymbol: string;     // "BTCUSDT"
  displayName: string;       // "Bitcoin"
  decimals: number;
}

interface StockTemplate {
  kind: 'stock';
  ticker: string;            // "AAPL", "005930.KS"
  market: Market;            // 'NYSE' | 'KRX'
  currency: 'USD' | 'KRW';
  displayName: string;       // "Apple Inc."
}

type Template = CryptoTemplate | StockTemplate;

// Bias schedule per horizon. Index 0 = 1d, 1 = 2d, etc. The asset-level
// `direction` flips so half the lineup tilts up and half tilts down.
const HORIZON_DAYS = [1, 2, 3, 4] as const;
const HORIZON_BIAS_PCT = [0, 0.5, 1.0, 1.5] as const; // magnitude only
const HORIZON_LABELS = ['1d', '2d', '3d', '4d'] as const;

// Direction sign per asset (alternates so the lineup mixes bullish/bearish
// thresholds rather than every market defaulting to "above current price").
const ASSET_DIRECTION: Record<string, 1 | -1> = {
  BTC: +1,
  ETH: -1,
  SOL: +1,
  AAPL: -1,
  NVDA: +1,
  '005930.KS': -1,
};

const CRYPTO_TEMPLATES: CryptoTemplate[] = [
  { kind: 'crypto', symbol: 'BTC', binanceSymbol: 'BTCUSDT', displayName: 'Bitcoin', decimals: 0 },
  { kind: 'crypto', symbol: 'ETH', binanceSymbol: 'ETHUSDT', displayName: 'Ethereum', decimals: 2 },
  { kind: 'crypto', symbol: 'SOL', binanceSymbol: 'SOLUSDT', displayName: 'Solana', decimals: 2 },
];

const STOCK_TEMPLATES: StockTemplate[] = [
  { kind: 'stock', ticker: 'AAPL',      market: 'NYSE', currency: 'USD', displayName: 'Apple Inc.' },
  { kind: 'stock', ticker: 'NVDA',      market: 'NYSE', currency: 'USD', displayName: 'NVIDIA Corporation' },
  { kind: 'stock', ticker: '005930.KS', market: 'KRX',  currency: 'KRW', displayName: 'Samsung Electronics' },
];

// ========================================
// Helpers
// ========================================

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

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`${name} environment variable is required`);
    process.exit(1);
  }
  return v;
}

function requireHex64(name: string, value: string): string {
  if (!HEX_64.test(value)) {
    console.error(`${name} must be a 0x-prefixed 32-byte hex string (got: ${value})`);
    process.exit(1);
  }
  return value.toLowerCase();
}

function roundToDecimals(value: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(value * f) / f;
}

function formatReadingTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`
  );
}

async function fetchBinancePrice(symbol: string): Promise<number> {
  const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
  if (!r.ok) throw new Error(`Binance HTTP ${r.status} for ${symbol}`);
  const j = (await r.json()) as { price: string };
  const p = parseFloat(j.price);
  if (!Number.isFinite(p) || p <= 0) throw new Error(`Bad price for ${symbol}: ${j.price}`);
  return p;
}

// Yahoo daily-bar fallback. Used for KRX (Twelve Data free tier excludes KRX)
// and as a no-API-key path for NYSE when TWELVE_DATA_API_KEY isn't set.
async function fetchYahooLastClose(ticker: string): Promise<number> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
  const r = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; nasun-prediction-bot/1.0)' },
  });
  if (!r.ok) throw new Error(`Yahoo HTTP ${r.status} for ${ticker}`);
  const j = (await r.json()) as {
    chart?: { result?: Array<{ indicators?: { quote?: Array<{ close?: Array<number | null> }> } }> };
  };
  const closes = j.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
  for (let i = closes.length - 1; i >= 0; i--) {
    const c = closes[i];
    if (typeof c === 'number' && Number.isFinite(c) && c > 0) return c;
  }
  throw new Error(`Yahoo: no usable close for ${ticker}`);
}

async function fetchStockLastClose(t: StockTemplate): Promise<number> {
  // KRX: Yahoo only. NYSE: Yahoo (no key required) — works without Twelve Data.
  return fetchYahooLastClose(t.ticker);
}

interface MarketSpec {
  template: Template;
  horizonIdx: number;
  closeTimeMs: number;
  resolveDeadlineMs: number;
  threshold: number;
  livePrice: number;
}

function buildCryptoMeta(spec: MarketSpec & { template: CryptoTemplate }) {
  const { template: t, closeTimeMs, threshold, livePrice } = spec;
  const readingTime = formatReadingTime(closeTimeMs);
  const sourceUrl = `https://api.binance.com/api/v3/ticker/price?symbol=${t.binanceSymbol}`;
  const fmt = (v: number) => v.toLocaleString('en-US', {
    minimumFractionDigits: t.decimals,
    maximumFractionDigits: t.decimals,
  });
  const likely = livePrice > threshold
    ? `YES (live $${fmt(livePrice)} already above threshold)`
    : `NO (live $${fmt(livePrice)} below threshold)`;
  const question =
    `Will ${t.displayName} (${t.symbol}/USDT) close above $${fmt(threshold)} ` +
    `on Binance at ${readingTime}?`;
  const description =
    `Binary spot-price prediction. Resolves YES if the Binance ticker for ` +
    `${t.binanceSymbol} reports a price > ${fmt(threshold)} USDT at the ` +
    `reading time; NO otherwise. Reference price at market creation: ` +
    `$${fmt(livePrice)} (expected outcome at creation: ${likely}). ` +
    `CoinGecko is used as a fallback price source if Binance is unavailable.`;
  return {
    question,
    description,
    resolutionSource: sourceUrl,
    resolutionCriteria:
      `Source: ${sourceUrl}\n` +
      `Reading time: ${readingTime}\n` +
      `Comparison: price > ${threshold}\n` +
      `Tie-breaking: NO`,
    category: 'crypto' as const,
  };
}

function buildStockMeta(spec: MarketSpec & { template: StockTemplate }) {
  const { template: t, closeTimeMs, threshold, livePrice } = spec;
  const readingTime = formatReadingTime(closeTimeMs);
  const sessionDate = localDateString(t.market, new Date(closeTimeMs));
  const sourceUrl = t.market === 'KRX'
    ? `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t.ticker)}`
    : `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(t.ticker)}&interval=1day`;
  const fmtThreshold = t.currency === 'KRW'
    ? threshold.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : threshold.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtLive = t.currency === 'KRW'
    ? livePrice.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : livePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const direction = livePrice > threshold ? 'above' : 'above';
  const question =
    `Will ${t.displayName} (${t.ticker}) close ${direction} ${fmtThreshold} ${t.currency} ` +
    `on ${sessionDate}?`;
  const sourceDescription = t.market === 'KRX'
    ? `Price is read from Yahoo Finance (Twelve Data free tier does not list KRX). `
    : `Price is read from Twelve Data with Yahoo Finance as a cross-source check (5 % agreement required). `;
  const likely = livePrice > threshold
    ? `YES (last close ${fmtLive} ${t.currency} already above threshold)`
    : `NO (last close ${fmtLive} ${t.currency} below threshold)`;
  const description =
    `Daily-close prediction. Resolves YES if the regular-session close of ` +
    `${t.ticker} on ${sessionDate} (${t.market}) is > ${fmtThreshold} ${t.currency}; ` +
    `NO otherwise. ${sourceDescription}` +
    `Pre-market and after-hours prices are not used. ` +
    `Last available close at market creation: ${fmtLive} ${t.currency} (expected: ${likely}).`;
  return {
    question,
    description,
    resolutionSource: sourceUrl,
    resolutionCriteria:
      `Source: ${sourceUrl}\n` +
      `Symbol: ${t.ticker}\n` +
      `Currency: ${t.currency}\n` +
      `Reading time: ${readingTime}\n` +
      `Comparison: close > ${threshold}\n` +
      `Tie-breaking: NO`,
    category: 'finance' as const,
  };
}

function buildMeta(spec: MarketSpec): {
  question: string;
  description: string;
  resolutionSource: string;
  resolutionCriteria: string;
  category: AssetKind extends 'crypto' ? 'crypto' : 'finance' | 'crypto';
} {
  if (spec.template.kind === 'crypto') {
    return buildCryptoMeta(spec as MarketSpec & { template: CryptoTemplate });
  }
  return buildStockMeta(spec as MarketSpec & { template: StockTemplate });
}

async function createMarket(
  client: SuiClient,
  adminKp: Ed25519Keypair,
  packageId: string,
  adminCap: string,
  resolverAddress: string,
  spec: MarketSpec,
): Promise<string> {
  const meta = buildMeta(spec);
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::prediction_market::create_market`,
    arguments: [
      tx.object(adminCap),
      tx.pure.string(meta.question),
      tx.pure.string(meta.description),
      tx.pure.string(meta.category),
      tx.pure.string(meta.resolutionSource),
      tx.pure.string(meta.resolutionCriteria),
      tx.pure.u64(BigInt(spec.closeTimeMs)),
      tx.pure.u64(BigInt(spec.resolveDeadlineMs)),
      tx.pure.address(resolverAddress),
      tx.object(CLOCK_ID),
    ],
  });
  const result = await client.signAndExecuteTransaction({
    signer: adminKp,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });
  if (result.effects?.status?.status !== 'success') {
    throw new Error(`TX failed: ${result.effects?.status?.error || 'unknown'}`);
  }
  await client.waitForTransaction({ digest: result.digest });
  const MARKET_TYPE_SUFFIX = '::prediction_market::Market';
  const marketChange = result.objectChanges?.find(
    (c): c is { type: 'created'; objectType: string; objectId: string } =>
      c.type === 'created' &&
      typeof (c as { objectType?: string }).objectType === 'string' &&
      (c as { objectType: string }).objectType.endsWith(MARKET_TYPE_SUFFIX),
  );
  if (!marketChange) throw new Error(`Market object not in objectChanges. Digest: ${result.digest}`);
  return marketChange.objectId;
}

// ========================================
// Spec generation
// ========================================

function specKey(t: Template): string {
  return t.kind === 'crypto' ? t.symbol : t.ticker;
}

function buildSpecs(
  templates: Template[],
  livePrices: Record<string, number>,
  now: number,
): MarketSpec[] {
  const specs: MarketSpec[] = [];
  for (const template of templates) {
    const key = specKey(template);
    const live = livePrices[key];
    if (!Number.isFinite(live) || live <= 0) {
      console.warn(`Skipping ${key}: no live price`);
      continue;
    }
    const direction = ASSET_DIRECTION[key] ?? 1;
    for (let i = 0; i < HORIZON_DAYS.length; i++) {
      const days = HORIZON_DAYS[i];
      const biasMag = HORIZON_BIAS_PCT[i];
      const biasPct = direction * biasMag;

      let closeTimeMs: number;
      let resolveDeadlineMs: number;
      if (template.kind === 'crypto') {
        closeTimeMs = now + days * 24 * 60 * 60_000;
        resolveDeadlineMs = closeTimeMs + CRYPTO_RESOLVE_BUFFER_MS;
      } else {
        const targetMs = now + days * 24 * 60 * 60_000;
        const tradingDay = nextTradingDay(template.market, new Date(targetMs));
        closeTimeMs = sessionCloseUtc(template.market, tradingDay);
        resolveDeadlineMs = closeTimeMs + STOCK_RESOLVE_BUFFER_MS;
      }

      let threshold = live * (1 + biasPct / 100);
      if (template.kind === 'crypto') {
        threshold = roundToDecimals(threshold, template.decimals);
      } else if (template.currency === 'KRW') {
        // KRW threshold must be integer per existing finance-market lint.
        threshold = Math.round(threshold);
      } else {
        threshold = roundToDecimals(threshold, 2);
      }

      specs.push({
        template,
        horizonIdx: i,
        closeTimeMs,
        resolveDeadlineMs,
        threshold,
        livePrice: live,
      });
    }
  }
  return specs;
}

// ========================================
// Main
// ========================================

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const allTemplates: Template[] = [...CRYPTO_TEMPLATES, ...STOCK_TEMPLATES];

  console.log('Fetching live prices...');
  const livePrices: Record<string, number> = {};
  for (const t of CRYPTO_TEMPLATES) {
    try {
      livePrices[t.symbol] = await fetchBinancePrice(t.binanceSymbol);
      console.log(`  ${t.symbol}: $${livePrices[t.symbol]}`);
    } catch (err) {
      console.warn(`  ${t.symbol}: FAILED — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  for (const t of STOCK_TEMPLATES) {
    try {
      livePrices[t.ticker] = await fetchStockLastClose(t);
      console.log(`  ${t.ticker}: ${livePrices[t.ticker]} ${t.currency}`);
    } catch (err) {
      console.warn(`  ${t.ticker}: FAILED — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log('');

  const specs = buildSpecs(allTemplates, livePrices, Date.now());

  if (dryRun) {
    console.log(`[DRY RUN] Would create ${specs.length} short-term markets:\n`);
    for (const spec of specs) {
      const meta = buildMeta(spec);
      const key = specKey(spec.template);
      console.log(`--- ${key} ${HORIZON_LABELS[spec.horizonIdx]} ---`);
      console.log(`  close_time:       ${new Date(spec.closeTimeMs).toISOString()}`);
      console.log(`  threshold:        ${spec.threshold}  (live: ${spec.livePrice})`);
      console.log(`  question:         ${meta.question}`);
      console.log('');
    }
    return;
  }

  const adminKeyInput = requireEnv('PREDICTION_ADMIN_KEY');
  const packageId = requireHex64('PREDICTION_PACKAGE_ID', requireEnv('PREDICTION_PACKAGE_ID'));
  const adminCap = requireHex64(
    'PREDICTION_ADMIN_CAP',
    process.env.PREDICTION_ADMIN_CAP || DEFAULT_ADMIN_CAP,
  );
  const resolverAddress = requireHex64(
    'PREDICTION_RESOLVER_ADDRESS',
    requireEnv('PREDICTION_RESOLVER_ADDRESS'),
  );

  const adminKp = parseKeypair(adminKeyInput);
  const adminAddress = adminKp.toSuiAddress().toLowerCase();
  if (adminAddress === resolverAddress) {
    console.error('Admin wallet must differ from resolver wallet (ECreatorIsResolver).');
    process.exit(1);
  }

  const client = new SuiClient({ url: RPC_URL });
  const capObj = await client.getObject({ id: adminCap, options: { showOwner: true } });
  const capOwner = (capObj.data?.owner as { AddressOwner?: string } | undefined)?.AddressOwner;
  if (!capOwner || capOwner.toLowerCase() !== adminAddress) {
    console.error(
      `AdminCap ${adminCap} is owned by ${capOwner ?? 'unknown'}, not ${adminAddress}. Aborting.`,
    );
    process.exit(1);
  }

  console.log(`Creating ${specs.length} short-term markets`);
  console.log(`  Package:  ${packageId}`);
  console.log(`  AdminCap: ${adminCap}`);
  console.log(`  Creator:  ${adminAddress}`);
  console.log(`  Resolver: ${resolverAddress}`);
  console.log('');

  const created: { spec: MarketSpec; objectId: string }[] = [];
  for (const spec of specs) {
    const key = specKey(spec.template);
    const label = HORIZON_LABELS[spec.horizonIdx];
    process.stdout.write(`  [${key} ${label}] Creating... `);
    try {
      const objectId = await createMarket(client, adminKp, packageId, adminCap, resolverAddress, spec);
      console.log(`${objectId}`);
      created.push({ spec, objectId });
    } catch (err) {
      console.log(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (created.length === 0) {
    console.error('\nAll market creations failed.');
    process.exit(1);
  }

  console.log('');
  console.log(`Created ${created.length}/${specs.length} markets`);
  const ids = created.map((m) => m.objectId).join(',');
  console.log('');
  console.log('Auto-discovery (10 min) on prod will pick these up. Or append to');
  console.log('PREDICTION_KEEPER_MARKETS / PREDICTION_LP_MARKETS in apps/pado/bots/.env:');
  console.log(`  ${ids}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
