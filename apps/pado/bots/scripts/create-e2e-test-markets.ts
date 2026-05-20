/**
 * Create E2E Test Prediction Markets (BTC / ETH / SOL, multiple close times)
 *
 * Creates 9 markets for end-to-end automation testing:
 *   BTC, ETH, SOL × (+15 min, +1 h, +3 h from now)
 *
 * Resolution thresholds are chosen relative to the live Binance price at
 * script start time so that ~half the markets should resolve YES.
 *
 * After running, add all printed market IDs to PREDICTION_KEEPER_MARKETS
 * and ensure prediction-keeper is running with the correct PREDICTION_PACKAGE_ID.
 *
 * Required env vars:
 *   PREDICTION_ADMIN_KEY          ed25519 / suiprivkey of AdminCap holder
 *   PREDICTION_RESOLVER_ADDRESS   0x-prefixed 32-byte resolver address
 *   PREDICTION_PACKAGE_ID         Deployed prediction package id (required)
 *   PREDICTION_ADMIN_CAP          AdminCap object id (optional; uses default)
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
const DEFAULT_ADMIN_CAP = '0x06f263829f9f84951280e2fa16d32d2729c28aca2600e4e77ec54a86d00f8fa1';
const HEX_64 = /^0x[0-9a-fA-F]{64}$/;

// Close time offsets from now (ms)
const OFFSETS_MS = [15 * 60_000, 60 * 60_000, 3 * 60 * 60_000];
const OFFSET_LABELS = ['15min', '1h', '3h'];
// Give keeper 2 h after close to fetch price + resolve
const RESOLVE_BUFFER_MS = 2 * 60 * 60_000;

interface TokenSpec {
  symbol: string;
  binanceSymbol: string;
  category: string;
  thresholdAbove: number; // "will exceed" threshold for >=, likely YES
  thresholdBelow: number; // "will NOT exceed" threshold for >=, likely NO
}

const TOKENS: TokenSpec[] = [
  {
    symbol: 'BTC',
    binanceSymbol: 'BTCUSDT',
    category: 'crypto',
    thresholdAbove: 75_000,
    thresholdBelow: 82_000,
  },
  {
    symbol: 'ETH',
    binanceSymbol: 'ETHUSDT',
    category: 'crypto',
    thresholdAbove: 2_200,
    thresholdBelow: 2_400,
  },
  {
    symbol: 'SOL',
    binanceSymbol: 'SOLUSDT',
    category: 'crypto',
    thresholdAbove: 80,
    thresholdBelow: 90,
  },
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

async function fetchPrice(symbol: string): Promise<number> {
  const url = `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Binance HTTP ${res.status} for ${symbol}`);
  const data = (await res.json()) as { price: string };
  const price = parseFloat(data.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`Bad price for ${symbol}: ${data.price}`);
  return price;
}

function formatReadingTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`
  );
}

interface MarketSpec {
  token: TokenSpec;
  offsetLabel: string;
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
} {
  const { token, threshold, livePrice, closeTimeMs } = spec;
  const url = `https://api.binance.com/api/v3/ticker/price?symbol=${token.binanceSymbol}`;
  const readingTime = formatReadingTime(closeTimeMs);
  const likelyOutcome = livePrice >= threshold ? 'YES (above threshold at script start)' : 'NO (below threshold at script start)';

  const question = `Will ${token.symbol}/USDT price be >= $${threshold.toLocaleString('en-US')} on Binance at ${readingTime}?`;
  const description =
    `E2E test market. Binary resolution against Binance spot ticker for ${token.binanceSymbol} ` +
    `at the specified reading time. YES if price >= ${threshold.toLocaleString('en-US')} USDT; NO otherwise. ` +
    `Live price at market creation: $${livePrice.toFixed(2)} (expected outcome: ${likelyOutcome}).`;
  const resolutionSource = url;
  const resolutionCriteria =
    `Source: ${url}\n` +
    `Reading time: ${readingTime}\n` +
    `Comparison: price >= ${threshold}\n` +
    `Tie-breaking: YES`;

  return { question, description, resolutionSource, resolutionCriteria };
}

async function createMarket(
  client: SuiClient,
  adminKp: Ed25519Keypair,
  packageId: string,
  adminCap: string,
  resolverAddress: string,
  spec: MarketSpec,
): Promise<string> {
  const { question, description, resolutionSource, resolutionCriteria } = buildMarketMeta(spec);
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::prediction_market::create_market`,
    arguments: [
      tx.object(adminCap),
      tx.pure.string(question),
      tx.pure.string(description),
      tx.pure.string(spec.token.category),
      tx.pure.string(resolutionSource),
      tx.pure.string(resolutionCriteria),
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

async function main(): Promise<void> {
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

  console.log('Fetching live prices from Binance...');
  const prices: Record<string, number> = {};
  for (const token of TOKENS) {
    prices[token.binanceSymbol] = await fetchPrice(token.binanceSymbol);
    console.log(`  ${token.symbol}: $${prices[token.binanceSymbol].toFixed(2)}`);
  }
  console.log('');

  const now = Date.now();

  // Build market specs: each token × 3 offsets, alternating above/below threshold
  const specs: MarketSpec[] = [];
  for (const token of TOKENS) {
    const livePrice = prices[token.binanceSymbol];
    for (let i = 0; i < OFFSETS_MS.length; i++) {
      const closeTimeMs = now + OFFSETS_MS[i];
      const resolveDeadlineMs = closeTimeMs + RESOLVE_BUFFER_MS;
      // Alternate: offset 0 = thresholdAbove (likely YES), 1 = mid, 2 = thresholdBelow (likely NO)
      const threshold = i === 0 ? token.thresholdAbove : i === 2 ? token.thresholdBelow : livePrice;
      specs.push({
        token,
        offsetLabel: OFFSET_LABELS[i],
        closeTimeMs,
        resolveDeadlineMs,
        threshold: i === 1 ? Math.round(livePrice / 10) * 10 : threshold,
        livePrice,
      });
    }
  }

  console.log(`Creating ${specs.length} markets`);
  console.log(`  Package:  ${packageId}`);
  console.log(`  AdminCap: ${adminCap}`);
  console.log(`  Creator:  ${adminAddress}`);
  console.log(`  Resolver: ${resolverAddress}`);
  console.log('');

  const createdMarkets: { spec: MarketSpec; objectId: string }[] = [];

  for (const spec of specs) {
    const { question } = buildMarketMeta(spec);
    process.stdout.write(`  [${spec.token.symbol} +${spec.offsetLabel}] Creating... `);
    try {
      const objectId = await createMarket(client, adminKp, packageId, adminCap, resolverAddress, spec);
      console.log(`${objectId}`);
      createdMarkets.push({ spec, objectId });
    } catch (err) {
      console.log(`FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (createdMarkets.length === 0) {
    console.error('\nAll market creations failed.');
    process.exit(1);
  }

  console.log('');
  console.log(`Created ${createdMarkets.length}/${specs.length} markets`);
  console.log('');
  console.log('Market summary:');
  for (const { spec, objectId } of createdMarkets) {
    const closeIso = new Date(spec.closeTimeMs).toISOString();
    const likelyYes = spec.livePrice >= spec.threshold;
    console.log(
      `  ${spec.token.symbol} +${spec.offsetLabel}  close=${closeIso}  threshold=${spec.threshold.toLocaleString('en-US')}  live=$${spec.livePrice.toFixed(2)}  likely=${likelyYes ? 'YES' : 'NO'}  id=${objectId}`,
    );
  }

  const marketIds = createdMarkets.map((m) => m.objectId).join(',');
  console.log('');
  console.log('Add to bots/.env (append to existing PREDICTION_KEEPER_MARKETS):');
  console.log(`  PREDICTION_KEEPER_MARKETS=${marketIds}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Update PREDICTION_KEEPER_MARKETS in bots/.env with the IDs above');
  console.log('  2. Ensure PREDICTION_PACKAGE_ID in bots/.env matches the package used here:');
  console.log(`       PREDICTION_PACKAGE_ID=${packageId}`);
  console.log('  3. pm2 startOrRestart ecosystem.config.cjs (fresh env)');
  console.log('  4. Mint NUSDC on the frontend, place YES/NO bets, then wait for auto-resolve');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
