/**
 * Create Finance Prediction Markets (stock daily close)
 *
 * v1 first batch: AAPL × 3 horizons (~1 week / ~1 month / ~3 months).
 * Resolution: Twelve Data daily close (Yahoo Finance cross-check).
 *
 * Usage:
 *   --dry-run   Print specs and resolution_criteria text only; no on-chain tx
 *
 * Required env vars (when not --dry-run):
 *   PREDICTION_ADMIN_KEY          ed25519 / suiprivkey of AdminCap holder
 *   PREDICTION_RESOLVER_ADDRESS   0x-prefixed 32-byte resolver address
 *   PREDICTION_PACKAGE_ID         Deployed prediction package id
 *   PREDICTION_ADMIN_CAP          AdminCap object id (optional default)
 *   NASUN_RPC_URL                 RPC endpoint (default devnet)
 *
 * After running, append printed market IDs to PREDICTION_KEEPER_MARKETS in
 * apps/pado/bots/.env and `pm2 startOrRestart ecosystem.config.cjs` so the
 * keeper picks them up.
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
const DEFAULT_ADMIN_CAP = '0x63ddeb9b82df1b7ef373a421920623a07c9e64b0eea5fc6d7f9fcaa742b06fc8';
const HEX_64 = /^0x[0-9a-fA-F]{64}$/;

// Keeper resolution buffer: 7 days after close to absorb multi-day holiday
// closures and any upstream API outage.
const RESOLVE_BUFFER_MS = 7 * 24 * 60 * 60_000;

type Comparator = '>' | '<';

interface Horizon {
  label: string;          // "1w", "1m", "3m"
  daysFromNow: number;    // intended target; will be shifted to next trading day
  threshold: number;      // explicit; no auto ±%
  op: Comparator;         // '>' or '<' to avoid integer-tie ambiguity
}

interface FinanceTemplate {
  ticker: string;         // e.g. "AAPL", "005930.KS"
  market: Market;         // 'NYSE' | 'KRX'
  currency: 'USD' | 'KRW';
  displayName: string;    // "Apple Inc."
  horizons: Horizon[];
}

// v1: AAPL + NVDA (Twelve Data primary) + 005930.KS Samsung (Yahoo primary —
// Twelve Data free tier does not include KRX listings, so KR markets run on
// Yahoo alone with no cross-source agreement). Thresholds are picked off the
// 2026-05-01 close as a mix of likely-YES (1w), ~50/50 (1m), and bullish (3m).
const FINANCE_TEMPLATES: FinanceTemplate[] = [
  {
    ticker: 'AAPL',
    market: 'NYSE',
    currency: 'USD',
    displayName: 'Apple Inc.',
    horizons: [
      { label: '1w', daysFromNow: 7,  threshold: 270, op: '>' },
      { label: '1m', daysFromNow: 30, threshold: 290, op: '>' },
      { label: '3m', daysFromNow: 90, threshold: 320, op: '>' },
    ],
  },
  {
    ticker: 'NVDA',
    market: 'NYSE',
    currency: 'USD',
    displayName: 'NVIDIA Corporation',
    horizons: [
      { label: '1w', daysFromNow: 7,  threshold: 195, op: '>' },
      { label: '1m', daysFromNow: 30, threshold: 210, op: '>' },
      { label: '3m', daysFromNow: 90, threshold: 240, op: '>' },
    ],
  },
  {
    ticker: '005930.KS',
    market: 'KRX',
    currency: 'KRW',
    displayName: 'Samsung Electronics',
    horizons: [
      { label: '1w', daysFromNow: 7,  threshold: 215_000, op: '>' },
      { label: '1m', daysFromNow: 30, threshold: 230_000, op: '>' },
      { label: '3m', daysFromNow: 90, threshold: 260_000, op: '>' },
    ],
  },
];

// ========================================
// Lint
// ========================================

/**
 * Stocks settle at integer (KRW) or 2-decimal (USD) prices. An integer
 * threshold combined with `>=` / `<=` makes exact ties statistically real,
 * which the tie-break field has to override one way or the other and feels
 * unfair to the losing side. We require `>` or `<` to remove the ambiguity
 * up front, regardless of tie-break setting.
 */
function lintHorizon(t: FinanceTemplate, h: Horizon): void {
  if (h.op !== '>' && h.op !== '<') {
    throw new Error(
      `lint: ${t.ticker} ${h.label}: op must be '>' or '<' (got ${h.op}); '>='/'<' encourages integer-tie ambiguity`,
    );
  }
  if (!Number.isFinite(h.threshold) || h.threshold <= 0) {
    throw new Error(`lint: ${t.ticker} ${h.label}: threshold must be a positive number`);
  }
  if (t.currency === 'KRW' && !Number.isInteger(h.threshold)) {
    throw new Error(`lint: ${t.ticker} ${h.label}: KRW threshold must be an integer`);
  }
}

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

function formatReadingTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`
  );
}

function formatThresholdHuman(threshold: number, currency: string): string {
  const formatted = currency === 'KRW'
    ? threshold.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : threshold.toLocaleString('en-US');
  return `${formatted} ${currency}`;
}

interface MarketSpec {
  template: FinanceTemplate;
  horizon: Horizon;
  closeTimeMs: number;
  resolveDeadlineMs: number;
}

function resolveCloseTime(template: FinanceTemplate, horizon: Horizon, fromMs: number): number {
  const targetMs = fromMs + horizon.daysFromNow * 24 * 60 * 60_000;
  const tradingDay = nextTradingDay(template.market, new Date(targetMs));
  return sessionCloseUtc(template.market, tradingDay);
}

function primarySourceUrl(t: FinanceTemplate): string {
  // Twelve Data free tier does not include KRX listings, so KR markets use
  // Yahoo Finance as the primary source and run without a cross-source check.
  if (t.market === 'KRX') {
    return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(t.ticker)}`;
  }
  return `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(t.ticker)}&interval=1day`;
}

function buildMarketMeta(spec: MarketSpec): {
  question: string;
  description: string;
  resolutionSource: string;
  resolutionCriteria: string;
  category: string;
} {
  const { template: t, horizon: h, closeTimeMs } = spec;
  const readingTime = formatReadingTime(closeTimeMs);
  const sessionDate = localDateString(t.market, new Date(closeTimeMs));
  const sourceUrl = primarySourceUrl(t);
  const thresholdHuman = formatThresholdHuman(h.threshold, t.currency);
  const direction = h.op === '>' ? 'above' : 'below';

  const question =
    `Will ${t.displayName} (${t.ticker}) close ${direction} ${thresholdHuman} ` +
    `on ${sessionDate}?`;

  const sourceDescription = t.market === 'KRX'
    ? `Price is read from Yahoo Finance (Twelve Data free tier does not list KRX). `
    : `Price is read from Twelve Data with Yahoo Finance as a cross-source check (5 % agreement required). `;

  const description =
    `Daily-close prediction. Resolves YES if the regular-session close of ` +
    `${t.ticker} on ${sessionDate} (${t.market}) is ${h.op} ${thresholdHuman}; ` +
    `NO otherwise. ${sourceDescription}` +
    `Pre-market and after-hours prices are not used.`;

  const resolutionSource = sourceUrl;
  const resolutionCriteria =
    `Source: ${sourceUrl}\n` +
    `Symbol: ${t.ticker}\n` +
    `Currency: ${t.currency}\n` +
    `Reading time: ${readingTime}\n` +
    `Comparison: close ${h.op} ${h.threshold}\n` +
    `Tie-breaking: NO`;

  return {
    question,
    description,
    resolutionSource,
    resolutionCriteria,
    category: 'finance',
  };
}

async function createMarket(
  client: SuiClient,
  adminKp: Ed25519Keypair,
  packageId: string,
  adminCap: string,
  resolverAddress: string,
  spec: MarketSpec,
): Promise<string> {
  const meta = buildMarketMeta(spec);
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

  if (!marketChange) {
    throw new Error(`Market object not in objectChanges. Digest: ${result.digest}`);
  }
  return marketChange.objectId;
}

// ========================================
// Main
// ========================================

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  // Build specs first (works without env vars; --dry-run produces useful output).
  const now = Date.now();
  const specs: MarketSpec[] = [];
  for (const template of FINANCE_TEMPLATES) {
    for (const horizon of template.horizons) {
      lintHorizon(template, horizon);
      const closeTimeMs = resolveCloseTime(template, horizon, now);
      specs.push({
        template,
        horizon,
        closeTimeMs,
        resolveDeadlineMs: closeTimeMs + RESOLVE_BUFFER_MS,
      });
    }
  }

  if (dryRun) {
    console.log(`[DRY RUN] Would create ${specs.length} finance markets:\n`);
    for (const spec of specs) {
      const meta = buildMarketMeta(spec);
      console.log(`--- ${spec.template.ticker} ${spec.horizon.label} ---`);
      console.log(`  close_time:       ${new Date(spec.closeTimeMs).toISOString()}`);
      console.log(`  resolve_deadline: ${new Date(spec.resolveDeadlineMs).toISOString()}`);
      console.log(`  category:         ${meta.category}`);
      console.log(`  question:         ${meta.question}`);
      console.log(`  resolution_criteria:`);
      for (const line of meta.resolutionCriteria.split('\n')) {
        console.log(`    ${line}`);
      }
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

  console.log(`Creating ${specs.length} finance markets`);
  console.log(`  Package:  ${packageId}`);
  console.log(`  AdminCap: ${adminCap}`);
  console.log(`  Creator:  ${adminAddress}`);
  console.log(`  Resolver: ${resolverAddress}`);
  console.log('');

  const created: { spec: MarketSpec; objectId: string }[] = [];
  for (const spec of specs) {
    const meta = buildMarketMeta(spec);
    process.stdout.write(`  [${spec.template.ticker} ${spec.horizon.label}] Creating... `);
    try {
      const objectId = await createMarket(client, adminKp, packageId, adminCap, resolverAddress, spec);
      console.log(`${objectId}`);
      created.push({ spec, objectId });
      console.log(`    question: ${meta.question}`);
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
  console.log('Append to PREDICTION_KEEPER_MARKETS in apps/pado/bots/.env:');
  console.log(`  ${ids}`);
  console.log('');
  console.log('Then: pm2 startOrRestart ecosystem.config.cjs');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
