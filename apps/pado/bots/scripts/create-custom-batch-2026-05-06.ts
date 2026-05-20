/**
 * One-off custom batch (2026-05-06):
 *   - 2 crypto markets closing in ~4h  (BTC, ETH)
 *   - 2 crypto markets closing in ~8h  (SOL, ETH)
 *   - 2 US stock markets closing at next NYSE regular-session close (AAPL, NVDA)
 *
 * Reuses the same on-chain create_market signature and metadata format as
 * create-short-term-markets.ts so prediction-keeper auto-discovers them.
 *
 * Usage:
 *   --dry-run   Print specs only; no on-chain tx
 *
 * Required env (non-dry-run):
 *   PREDICTION_ADMIN_KEY, PREDICTION_RESOLVER_ADDRESS, PREDICTION_PACKAGE_ID
 *   PREDICTION_ADMIN_CAP (optional, defaulted)
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
const DEFAULT_ADMIN_CAP = '0x06f263829f9f84951280e2fa16d32d2729c28aca2600e4e77ec54a86d00f8fa1';
const HEX_64 = /^0x[0-9a-fA-F]{64}$/;

const CRYPTO_RESOLVE_BUFFER_MS = 2 * 60 * 60_000;
const STOCK_RESOLVE_BUFFER_MS = 7 * 24 * 60 * 60_000;

interface CryptoSpec {
  kind: 'crypto';
  symbol: string;
  binanceSymbol: string;
  displayName: string;
  decimals: number;
  hoursOut: number;
  biasPct: number;       // signed, applied to live price
  label: string;         // for logging
}

interface StockSpec {
  kind: 'stock';
  ticker: string;
  market: Market;
  currency: 'USD';
  displayName: string;
  biasPct: number;
  label: string;
}

type Spec = CryptoSpec | StockSpec;

const SPECS: Spec[] = [
  { kind: 'crypto', symbol: 'BTC', binanceSymbol: 'BTCUSDT', displayName: 'Bitcoin',  decimals: 0, hoursOut: 4, biasPct: +0.3, label: 'BTC 4h' },
  { kind: 'crypto', symbol: 'ETH', binanceSymbol: 'ETHUSDT', displayName: 'Ethereum', decimals: 2, hoursOut: 4, biasPct: -0.3, label: 'ETH 4h' },
  { kind: 'crypto', symbol: 'SOL', binanceSymbol: 'SOLUSDT', displayName: 'Solana',   decimals: 2, hoursOut: 8, biasPct: +0.5, label: 'SOL 8h' },
  { kind: 'crypto', symbol: 'ETH', binanceSymbol: 'ETHUSDT', displayName: 'Ethereum', decimals: 2, hoursOut: 8, biasPct: -0.5, label: 'ETH 8h' },
  { kind: 'stock',  ticker: 'AAPL', market: 'NYSE', currency: 'USD', displayName: 'Apple Inc.',         biasPct: +0.5, label: 'AAPL next-close' },
  { kind: 'stock',  ticker: 'NVDA', market: 'NYSE', currency: 'USD', displayName: 'NVIDIA Corporation', biasPct: -0.5, label: 'NVDA next-close' },
];

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
  if (!v) { console.error(`${name} is required`); process.exit(1); }
  return v;
}

function requireHex64(name: string, value: string): string {
  if (!HEX_64.test(value)) {
    console.error(`${name} must be 0x-prefixed 32-byte hex (got: ${value})`);
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

async function fetchYahooLastClose(ticker: string): Promise<number> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=5d`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; nasun-prediction-bot/1.0)' } });
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

interface BuiltSpec {
  spec: Spec;
  closeTimeMs: number;
  resolveDeadlineMs: number;
  threshold: number;
  livePrice: number;
}

function buildCryptoMeta(b: BuiltSpec & { spec: CryptoSpec }) {
  const { spec: t, closeTimeMs, threshold, livePrice } = b;
  const readingTime = formatReadingTime(closeTimeMs);
  const sourceUrl = `https://api.binance.com/api/v3/ticker/price?symbol=${t.binanceSymbol}`;
  const fmt = (v: number) => v.toLocaleString('en-US', {
    minimumFractionDigits: t.decimals, maximumFractionDigits: t.decimals,
  });
  const likely = livePrice > threshold
    ? `YES (live $${fmt(livePrice)} already above threshold)`
    : `NO (live $${fmt(livePrice)} below threshold)`;
  return {
    question: `Will ${t.displayName} (${t.symbol}/USDT) close above $${fmt(threshold)} on Binance at ${readingTime}?`,
    description:
      `Binary spot-price prediction. Resolves YES if the Binance ticker for ${t.binanceSymbol} ` +
      `reports a price > ${fmt(threshold)} USDT at the reading time; NO otherwise. ` +
      `Reference price at market creation: $${fmt(livePrice)} (expected: ${likely}). ` +
      `CoinGecko is used as a fallback price source if Binance is unavailable.`,
    resolutionSource: sourceUrl,
    resolutionCriteria:
      `Source: ${sourceUrl}\nReading time: ${readingTime}\nComparison: price > ${threshold}\nTie-breaking: NO`,
    category: 'crypto' as const,
  };
}

function buildStockMeta(b: BuiltSpec & { spec: StockSpec }) {
  const { spec: t, closeTimeMs, threshold, livePrice } = b;
  const readingTime = formatReadingTime(closeTimeMs);
  const sessionDate = localDateString(t.market, new Date(closeTimeMs));
  const sourceUrl = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(t.ticker)}&interval=1day`;
  const fmtThreshold = threshold.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtLive = livePrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const likely = livePrice > threshold
    ? `YES (last close ${fmtLive} ${t.currency} already above threshold)`
    : `NO (last close ${fmtLive} ${t.currency} below threshold)`;
  return {
    question: `Will ${t.displayName} (${t.ticker}) close above ${fmtThreshold} ${t.currency} on ${sessionDate}?`,
    description:
      `Daily-close prediction. Resolves YES if the regular-session close of ${t.ticker} on ${sessionDate} ` +
      `(${t.market}) is > ${fmtThreshold} ${t.currency}; NO otherwise. Price is read from Twelve Data ` +
      `with Yahoo Finance as a cross-source check (5 % agreement required). Pre-market and after-hours ` +
      `prices are not used. Last available close at market creation: ${fmtLive} ${t.currency} (expected: ${likely}).`,
    resolutionSource: sourceUrl,
    resolutionCriteria:
      `Source: ${sourceUrl}\nSymbol: ${t.ticker}\nCurrency: ${t.currency}\n` +
      `Reading time: ${readingTime}\nComparison: close > ${threshold}\nTie-breaking: NO`,
    category: 'finance' as const,
  };
}

function buildMeta(b: BuiltSpec) {
  return b.spec.kind === 'crypto'
    ? buildCryptoMeta(b as BuiltSpec & { spec: CryptoSpec })
    : buildStockMeta(b as BuiltSpec & { spec: StockSpec });
}

async function createMarket(
  client: SuiClient, adminKp: Ed25519Keypair, packageId: string, adminCap: string,
  resolverAddress: string, b: BuiltSpec,
): Promise<string> {
  const meta = buildMeta(b);
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
      tx.pure.u64(BigInt(b.closeTimeMs)),
      tx.pure.u64(BigInt(b.resolveDeadlineMs)),
      tx.pure.address(resolverAddress),
      tx.object(CLOCK_ID),
    ],
  });
  const result = await client.signAndExecuteTransaction({
    signer: adminKp, transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });
  if (result.effects?.status?.status !== 'success') {
    throw new Error(`TX failed: ${result.effects?.status?.error || 'unknown'}`);
  }
  await client.waitForTransaction({ digest: result.digest });
  const created = result.objectChanges?.find(
    (c): c is { type: 'created'; objectType: string; objectId: string } =>
      c.type === 'created' &&
      typeof (c as { objectType?: string }).objectType === 'string' &&
      (c as { objectType: string }).objectType.endsWith('::prediction_market::Market'),
  );
  if (!created) throw new Error(`Market object not in objectChanges. Digest: ${result.digest}`);
  return created.objectId;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const now = Date.now();

  console.log('Fetching live prices...');
  const built: BuiltSpec[] = [];
  for (const spec of SPECS) {
    try {
      let livePrice: number;
      let closeTimeMs: number;
      let resolveDeadlineMs: number;

      if (spec.kind === 'crypto') {
        livePrice = await fetchBinancePrice(spec.binanceSymbol);
        closeTimeMs = now + spec.hoursOut * 60 * 60_000;
        resolveDeadlineMs = closeTimeMs + CRYPTO_RESOLVE_BUFFER_MS;
      } else {
        livePrice = await fetchYahooLastClose(spec.ticker);
        const tradingDay = nextTradingDay(spec.market, new Date(now));
        closeTimeMs = sessionCloseUtc(spec.market, tradingDay);
        resolveDeadlineMs = closeTimeMs + STOCK_RESOLVE_BUFFER_MS;
      }

      let threshold = livePrice * (1 + spec.biasPct / 100);
      if (spec.kind === 'crypto') threshold = roundToDecimals(threshold, spec.decimals);
      else threshold = roundToDecimals(threshold, 2);

      built.push({ spec, closeTimeMs, resolveDeadlineMs, threshold, livePrice });
      console.log(`  ${spec.label}: live=${livePrice} threshold=${threshold} close=${new Date(closeTimeMs).toISOString()}`);
    } catch (err) {
      console.warn(`  ${spec.label}: FAILED — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log('');

  if (dryRun) {
    console.log(`[DRY RUN] Would create ${built.length} markets.`);
    for (const b of built) {
      const meta = buildMeta(b);
      console.log(`--- ${b.spec.label} ---`);
      console.log(`  ${meta.question}`);
      console.log('');
    }
    return;
  }

  const adminKeyInput = requireEnv('PREDICTION_ADMIN_KEY');
  const packageId = requireHex64('PREDICTION_PACKAGE_ID', requireEnv('PREDICTION_PACKAGE_ID'));
  const adminCap = requireHex64('PREDICTION_ADMIN_CAP', process.env.PREDICTION_ADMIN_CAP || DEFAULT_ADMIN_CAP);
  const resolverAddress = requireHex64('PREDICTION_RESOLVER_ADDRESS', requireEnv('PREDICTION_RESOLVER_ADDRESS'));

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
    console.error(`AdminCap ${adminCap} owned by ${capOwner ?? 'unknown'}, not ${adminAddress}. Aborting.`);
    process.exit(1);
  }

  console.log(`Creating ${built.length} markets`);
  console.log(`  Package:  ${packageId}`);
  console.log(`  AdminCap: ${adminCap}`);
  console.log(`  Creator:  ${adminAddress}`);
  console.log(`  Resolver: ${resolverAddress}\n`);

  const created: { spec: Spec; objectId: string }[] = [];
  for (const b of built) {
    process.stdout.write(`  [${b.spec.label}] Creating... `);
    try {
      const objectId = await createMarket(client, adminKp, packageId, adminCap, resolverAddress, b);
      console.log(`${objectId}`);
      created.push({ spec: b.spec, objectId });
    } catch (err) {
      console.log(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log('');
  console.log(`Created ${created.length}/${built.length} markets`);
  if (created.length > 0) {
    console.log('\nIDs:');
    console.log(`  ${created.map((m) => m.objectId).join(',')}`);
    console.log('\nAuto-discovery (10 min) on prod will pick these up.');
  }
}

main().catch((err) => { console.error('Fatal error:', err); process.exit(1); });
