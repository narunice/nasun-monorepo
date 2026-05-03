/**
 * Create Crypto Batch Prediction Markets (real markets, not E2E)
 *
 * 5 tokens x 3 horizons = 15 binary markets resolving against the Binance
 * spot price ticker at the close time. Thresholds are computed at script
 * launch as `current_price * (1 + bias%)` rounded to the token's display
 * decimals so the on-chain numbers stay legible. The bias varies per
 * (token, horizon) so the lineup mixes likely-YES, ~50/50, and bullish
 * markets rather than all defaulting to one side.
 *
 * Crypto trades 24/7 -- close_time can be set freely and resolve_deadline
 * is short (2 h post close) since there are no exchange holidays to absorb.
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
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';

if (RPC_URL.includes('mainnet')) {
  console.error('This script must not run against mainnet. Aborting.');
  process.exit(1);
}

const CLOCK_ID = '0x6';
const DEFAULT_ADMIN_CAP = '0x63ddeb9b82df1b7ef373a421920623a07c9e64b0eea5fc6d7f9fcaa742b06fc8';
const HEX_64 = /^0x[0-9a-fA-F]{64}$/;

// 2 h after close_time: keeper has plenty of time to fetch + resolve, and
// since crypto trades 24/7 there are no closure days to absorb.
const RESOLVE_BUFFER_MS = 2 * 60 * 60_000;

interface Horizon {
  label: string;        // "1d", "1w", "1m", "3m"
  hours: number;        // close_time = now + hours
  biasPct: number;      // threshold = current * (1 + biasPct/100); '>' op
}

interface CryptoTemplate {
  symbol: string;          // "BTC"
  binanceSymbol: string;   // "BTCUSDT"
  displayName: string;     // "Bitcoin"
  decimals: number;        // threshold rounding precision
  horizons: Horizon[];
}

// Bias mix: each token spans easy / medium / hard so the lineup is not
// uniformly bullish. Negative bias = "will price stay above X% below
// current?" i.e. defensive YES bet.
const TEMPLATES: CryptoTemplate[] = [
  {
    symbol: 'BTC',
    binanceSymbol: 'BTCUSDT',
    displayName: 'Bitcoin',
    decimals: 0,
    horizons: [
      { label: '1d', hours: 24,      biasPct:  1 },
      { label: '1w', hours: 24 * 7,  biasPct:  5 },
      { label: '1m', hours: 24 * 30, biasPct: 15 },
    ],
  },
  {
    symbol: 'ETH',
    binanceSymbol: 'ETHUSDT',
    displayName: 'Ethereum',
    decimals: 2,
    horizons: [
      { label: '1d', hours: 24,      biasPct: -1 },
      { label: '1w', hours: 24 * 7,  biasPct:  3 },
      { label: '1m', hours: 24 * 30, biasPct: 10 },
    ],
  },
  {
    symbol: 'SOL',
    binanceSymbol: 'SOLUSDT',
    displayName: 'Solana',
    decimals: 2,
    horizons: [
      { label: '1d', hours: 24,      biasPct:  0 },
      { label: '1w', hours: 24 * 7,  biasPct:  8 },
      { label: '1m', hours: 24 * 30, biasPct: 20 },
    ],
  },
  {
    symbol: 'BNB',
    binanceSymbol: 'BNBUSDT',
    displayName: 'BNB',
    decimals: 2,
    horizons: [
      { label: '1w', hours: 24 * 7,  biasPct:  3 },
      { label: '1m', hours: 24 * 30, biasPct:  8 },
      { label: '3m', hours: 24 * 90, biasPct: 20 },
    ],
  },
  {
    symbol: 'XRP',
    binanceSymbol: 'XRPUSDT',
    displayName: 'XRP',
    decimals: 4,
    horizons: [
      { label: '1d', hours: 24,      biasPct:  2 },
      { label: '1w', hours: 24 * 7,  biasPct: 10 },
      { label: '1m', hours: 24 * 30, biasPct: -5 },
    ],
  },
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

async function fetchBinancePrice(symbol: string): Promise<number> {
  const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
  if (!r.ok) throw new Error(`Binance HTTP ${r.status} for ${symbol}`);
  const j = (await r.json()) as { price: string };
  const p = parseFloat(j.price);
  if (!Number.isFinite(p) || p <= 0) throw new Error(`Bad price for ${symbol}: ${j.price}`);
  return p;
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

function formatThresholdHuman(threshold: number, decimals: number): string {
  return threshold.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

interface MarketSpec {
  template: CryptoTemplate;
  horizon: Horizon;
  closeTimeMs: number;
  resolveDeadlineMs: number;
  threshold: number;
  livePrice: number;
}

function buildMarketMeta(spec: MarketSpec): {
  question: string;
  description: string;
  resolutionSource: string;
  resolutionCriteria: string;
  category: string;
} {
  const { template: t, horizon: h, closeTimeMs, threshold, livePrice } = spec;
  const readingTime = formatReadingTime(closeTimeMs);
  const sourceUrl = `https://api.binance.com/api/v3/ticker/price?symbol=${t.binanceSymbol}`;
  const thresholdHuman = formatThresholdHuman(threshold, t.decimals);
  const liveHuman = formatThresholdHuman(livePrice, t.decimals);
  const likelyOutcome = livePrice > threshold
    ? `YES (live $${liveHuman} already above threshold)`
    : `NO (live $${liveHuman} below threshold)`;

  const question =
    `Will ${t.displayName} (${t.symbol}/USDT) close above $${thresholdHuman} ` +
    `on Binance at ${readingTime}?`;

  const description =
    `Binary spot-price prediction. Resolves YES if the Binance ticker for ` +
    `${t.binanceSymbol} reports a price > ${thresholdHuman} USDT at the ` +
    `reading time; NO otherwise. Reference price at market creation: ` +
    `$${liveHuman} (expected outcome at creation: ${likelyOutcome}). ` +
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
    category: 'crypto',
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
  if (!marketChange) throw new Error(`Market object not in objectChanges. Digest: ${result.digest}`);
  return marketChange.objectId;
}

// ========================================
// Main
// ========================================

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  console.log('Fetching live Binance prices...');
  const livePrices: Record<string, number> = {};
  for (const t of TEMPLATES) {
    livePrices[t.binanceSymbol] = await fetchBinancePrice(t.binanceSymbol);
    console.log(`  ${t.symbol}: $${livePrices[t.binanceSymbol]}`);
  }
  console.log('');

  const now = Date.now();
  const specs: MarketSpec[] = [];
  for (const template of TEMPLATES) {
    const livePrice = livePrices[template.binanceSymbol];
    for (const horizon of template.horizons) {
      const closeTimeMs = now + horizon.hours * 60 * 60_000;
      const threshold = roundToDecimals(
        livePrice * (1 + horizon.biasPct / 100),
        template.decimals,
      );
      specs.push({
        template,
        horizon,
        closeTimeMs,
        resolveDeadlineMs: closeTimeMs + RESOLVE_BUFFER_MS,
        threshold,
        livePrice,
      });
    }
  }

  if (dryRun) {
    console.log(`[DRY RUN] Would create ${specs.length} crypto markets:\n`);
    for (const spec of specs) {
      const meta = buildMarketMeta(spec);
      console.log(`--- ${spec.template.symbol} ${spec.horizon.label} (bias ${spec.horizon.biasPct >= 0 ? '+' : ''}${spec.horizon.biasPct}%) ---`);
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
    console.error(`AdminCap ${adminCap} is owned by ${capOwner ?? 'unknown'}, not ${adminAddress}. Aborting.`);
    process.exit(1);
  }

  console.log(`Creating ${specs.length} crypto markets`);
  console.log(`  Package:  ${packageId}`);
  console.log(`  AdminCap: ${adminCap}`);
  console.log(`  Creator:  ${adminAddress}`);
  console.log(`  Resolver: ${resolverAddress}`);
  console.log('');

  const created: { spec: MarketSpec; objectId: string }[] = [];
  for (const spec of specs) {
    const meta = buildMarketMeta(spec);
    process.stdout.write(`  [${spec.template.symbol} ${spec.horizon.label}] Creating... `);
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
  console.log('Auto-discovery (10 min interval) on prod EC2 keeper will pick these up automatically.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
