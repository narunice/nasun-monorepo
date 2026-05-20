/**
 * Custom batch (2026-05-15):
 *   8 trending crypto + 8 stock prediction markets (4 US, 4 KR).
 *   Close horizons spread from 1 to 7 days out.
 *
 *   Balance intent: biasPct sized to horizon-implied vol so the YES/NO
 *   probability at creation hovers near 50/50. Signs alternate so neither
 *   side is uniformly favored across the book.
 *
 *   Approx biasPct envelopes (alternated +/-):
 *     - crypto: scales from ~1.5% (1d) up to ~4.5% (7d)
 *     - stocks: scales from ~0.8% (1d) up to ~2.5% (7d)
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
const DEFAULT_ADMIN_CAP = '0xd90ae72defe2c4e2b149611c72885a1ebf679ae7bda778b35644f0e3946aedf8';
const HEX_64 = /^0x[0-9a-fA-F]{64}$/;

const CRYPTO_RESOLVE_BUFFER_MS = 2 * 60 * 60_000;
const STOCK_RESOLVE_BUFFER_MS = 7 * 24 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

interface CryptoSpec {
  kind: 'crypto';
  symbol: string;
  binanceSymbol: string;
  displayName: string;
  decimals: number;
  daysOut: number;
  biasPct: number;
  label: string;
}

interface StockSpec {
  kind: 'stock';
  ticker: string;
  market: Market;
  currency: 'USD' | 'KRW';
  displayName: string;
  daysOut: number;
  biasPct: number;
  label: string;
}

type Spec = CryptoSpec | StockSpec;

// Sign convention:
//   positive biasPct => threshold above live (NO is no-move default)
//   negative biasPct => threshold below live (YES is no-move default)
// Magnitudes are kept small relative to horizon vol so the prior is near 50/50.
const SPECS: Spec[] = [
  // ---------- Crypto (8) ----------
  { kind: 'crypto', symbol: 'BTC',   binanceSymbol: 'BTCUSDT',   displayName: 'Bitcoin',     decimals: 0, daysOut: 1, biasPct: +1.5, label: 'BTC 1d up' },
  { kind: 'crypto', symbol: 'ETH',   binanceSymbol: 'ETHUSDT',   displayName: 'Ethereum',    decimals: 2, daysOut: 2, biasPct: -2.0, label: 'ETH 2d down' },
  { kind: 'crypto', symbol: 'SOL',   binanceSymbol: 'SOLUSDT',   displayName: 'Solana',      decimals: 2, daysOut: 3, biasPct: +2.5, label: 'SOL 3d up' },
  { kind: 'crypto', symbol: 'XRP',   binanceSymbol: 'XRPUSDT',   displayName: 'XRP',         decimals: 4, daysOut: 4, biasPct: -3.0, label: 'XRP 4d down' },
  { kind: 'crypto', symbol: 'BNB',   binanceSymbol: 'BNBUSDT',   displayName: 'BNB',         decimals: 2, daysOut: 5, biasPct: +3.5, label: 'BNB 5d up' },
  { kind: 'crypto', symbol: 'DOGE',  binanceSymbol: 'DOGEUSDT',  displayName: 'Dogecoin',    decimals: 5, daysOut: 6, biasPct: -4.0, label: 'DOGE 6d down' },
  { kind: 'crypto', symbol: 'ADA',   binanceSymbol: 'ADAUSDT',   displayName: 'Cardano',     decimals: 4, daysOut: 7, biasPct: +4.5, label: 'ADA 7d up' },
  { kind: 'crypto', symbol: 'AVAX',  binanceSymbol: 'AVAXUSDT',  displayName: 'Avalanche',   decimals: 2, daysOut: 2, biasPct: +2.0, label: 'AVAX 2d up' },

  // ---------- US Stocks (4, NYSE/NASDAQ via Yahoo) ----------
  { kind: 'stock', ticker: 'NVDA', market: 'NYSE', currency: 'USD', displayName: 'NVIDIA Corporation', daysOut: 1, biasPct: -0.8, label: 'NVDA 1d-close down' },
  { kind: 'stock', ticker: 'TSLA', market: 'NYSE', currency: 'USD', displayName: 'Tesla, Inc.',       daysOut: 3, biasPct: +1.5, label: 'TSLA 3d-close up' },
  { kind: 'stock', ticker: 'AAPL', market: 'NYSE', currency: 'USD', displayName: 'Apple Inc.',        daysOut: 5, biasPct: -2.0, label: 'AAPL 5d-close down' },
  { kind: 'stock', ticker: 'MSFT', market: 'NYSE', currency: 'USD', displayName: 'Microsoft Corp.',   daysOut: 7, biasPct: +2.5, label: 'MSFT 7d-close up' },

  // ---------- KR Stocks (4, KRX via Yahoo .KS) ----------
  { kind: 'stock', ticker: '005930.KS', market: 'KRX', currency: 'KRW', displayName: 'Samsung Electronics', daysOut: 2, biasPct: +1.2, label: 'Samsung 2d-close up' },
  { kind: 'stock', ticker: '000660.KS', market: 'KRX', currency: 'KRW', displayName: 'SK Hynix',            daysOut: 4, biasPct: -1.8, label: 'SK Hynix 4d-close down' },
  { kind: 'stock', ticker: '035420.KS', market: 'KRX', currency: 'KRW', displayName: 'NAVER Corporation',   daysOut: 6, biasPct: +2.3, label: 'NAVER 6d-close up' },
  { kind: 'stock', ticker: '035720.KS', market: 'KRX', currency: 'KRW', displayName: 'Kakao Corp.',         daysOut: 7, biasPct: -2.5, label: 'Kakao 7d-close down' },
];

if (process.env.RETRY_ONLY) {
  const keep = new Set(process.env.RETRY_ONLY.split(',').map((s) => s.trim()));
  for (let i = SPECS.length - 1; i >= 0; i--) {
    const lbl = (SPECS[i] as { label: string }).label;
    if (!keep.has(lbl)) SPECS.splice(i, 1);
  }
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
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=10d`;
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

function formatThresholdHuman(threshold: number, currency: string): string {
  if (currency === 'KRW') {
    return `${threshold.toLocaleString('en-US', { maximumFractionDigits: 0 })} KRW`;
  }
  return `${threshold.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
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
  const sourceUrl = t.market === 'KRX'
    ? `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t.ticker)}`
    : `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(t.ticker)}&interval=1day`;
  const thresholdHuman = formatThresholdHuman(threshold, t.currency);
  const liveHuman = formatThresholdHuman(livePrice, t.currency);
  const likely = livePrice > threshold
    ? `YES (last close ${liveHuman} already above threshold)`
    : `NO (last close ${liveHuman} below threshold)`;
  const sourceDescription = t.market === 'KRX'
    ? `Price is read from Yahoo Finance (Twelve Data free tier does not list KRX). `
    : `Price is read from Twelve Data with Yahoo Finance as a cross-source check (5 % agreement required). `;
  return {
    question: `Will ${t.displayName} (${t.ticker}) close above ${thresholdHuman} on ${sessionDate}?`,
    description:
      `Daily-close prediction. Resolves YES if the regular-session close of ${t.ticker} on ${sessionDate} ` +
      `(${t.market}) is > ${thresholdHuman}; NO otherwise. ${sourceDescription}` +
      `Pre-market and after-hours prices are not used. Last available close at market creation: ` +
      `${liveHuman} (expected: ${likely}).`,
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
        closeTimeMs = now + spec.daysOut * DAY_MS;
        resolveDeadlineMs = closeTimeMs + CRYPTO_RESOLVE_BUFFER_MS;
      } else {
        livePrice = await fetchYahooLastClose(spec.ticker);
        const targetDate = new Date(now + spec.daysOut * DAY_MS);
        const tradingDay = nextTradingDay(spec.market, targetDate);
        closeTimeMs = sessionCloseUtc(spec.market, tradingDay);
        resolveDeadlineMs = closeTimeMs + STOCK_RESOLVE_BUFFER_MS;
      }

      let threshold = livePrice * (1 + spec.biasPct / 100);
      if (spec.kind === 'crypto') {
        threshold = roundToDecimals(threshold, spec.decimals);
      } else if (spec.currency === 'KRW') {
        threshold = Math.round(threshold);
      } else {
        threshold = roundToDecimals(threshold, 2);
      }

      built.push({ spec, closeTimeMs, resolveDeadlineMs, threshold, livePrice });
      console.log(`  ${spec.label}: live=${livePrice} threshold=${threshold} close=${new Date(closeTimeMs).toISOString()}`);
    } catch (err) {
      console.warn(`  ${spec.label}: FAILED ${err instanceof Error ? err.message : String(err)}`);
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
      await new Promise((r) => setTimeout(r, 8000));
    } catch (err) {
      console.log(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log('');
  console.log(`Created ${created.length}/${built.length} markets`);
  if (created.length > 0) {
    console.log('\nIDs:');
    console.log(`  ${created.map((m) => m.objectId).join(',')}`);
  }
}

main().catch((err) => { console.error('Fatal error:', err); process.exit(1); });
