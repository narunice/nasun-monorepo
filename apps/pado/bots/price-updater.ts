/**
 * Price Updater Bot
 *
 * Updates DevOracle prices periodically using CoinGecko/Binance API
 *
 * Usage:
 *   pnpm price-updater          # Run continuously (30s interval)
 *   pnpm price-updater:once     # Run once and exit
 *
 * Environment Variables:
 *   ORACLE_ADMIN_KEY    - Hex-encoded private key for AdminCap owner
 *   NASUN_RPC_URL       - RPC endpoint (default: https://rpc.devnet.nasun.io)
 *
 * @version 0.2.0
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { withRetry } from './lib/retry.js';

// ========================================
// Configuration
// ========================================

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';

// Contract addresses (Devnet V7 - 2026-02-04, overridable via env)
const ORACLE_PACKAGE_ID = process.env.ORACLE_PACKAGE_ID || '0x8a0acb40e5546a01e276a367e583df32b134306ebce6118cc01d9e164edf4c1c';
const ORACLE_REGISTRY_ID = process.env.ORACLE_REGISTRY_ID || '0xdd4b9ac16342bb2b4d8cd7ad3556f025122914a69450f72563e733d4a477e7f1';
const ADMIN_CAP_ID = process.env.ORACLE_ADMIN_CAP_ID || '0x335a8e50cca47f993cb2eee7221791bac67be0a9a71ac69708a28d174a746bec';
const CLOCK_ID = '0x6';

const DECIMALS = 8;
const UPDATE_INTERVAL_MS = 30_000; // 30 seconds

// Symbol IDs (must match dev_oracle.move)
const BTCUSD = 1;
const ETHUSD = 2;
const NASUSD = 3;
const SOLUSD = 4;

// ========================================
// Helpers
// ========================================

interface PriceUpdate {
  symbol: number;
  price: bigint;
  confidence: bigint;
}

function toOraclePrice(usd: number): bigint {
  return BigInt(Math.round(usd * Math.pow(10, DECIMALS)));
}

function toConfidence(usd: number): bigint {
  // 0.1% confidence interval
  return toOraclePrice(usd * 0.001);
}

// ========================================
// Price Fetching
// ========================================

interface FetchedPrices {
  BTC: number;
  ETH: number;
  SOL: number;
}

async function fetchPrices(): Promise<FetchedPrices> {
  // Primary: CoinGecko
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd',
      { signal: AbortSignal.timeout(5000) }
    );
    const data = await response.json() as Record<string, Record<string, number>>;
    const btc = data.bitcoin?.usd;
    const eth = data.ethereum?.usd;
    const sol = data.solana?.usd;
    if (typeof btc === 'number' && typeof eth === 'number' && typeof sol === 'number') {
      return { BTC: btc, ETH: eth, SOL: sol };
    }
    throw new Error('Invalid CoinGecko response');
  } catch (error) {
    console.log('⚠️  CoinGecko failed, trying Binance...');
  }

  // Backup: Binance (fetch all in parallel)
  try {
    const [btcRes, ethRes, solRes] = await Promise.all([
      fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', { signal: AbortSignal.timeout(5000) }),
      fetch('https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT', { signal: AbortSignal.timeout(5000) }),
      fetch('https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT', { signal: AbortSignal.timeout(5000) }),
    ]);
    const [btcData, ethData, solData] = await Promise.all([btcRes.json(), ethRes.json(), solRes.json()]) as { price: string }[];
    const btc = parseFloat(btcData.price);
    const eth = parseFloat(ethData.price);
    const sol = parseFloat(solData.price);
    if (isNaN(btc) || isNaN(eth) || isNaN(sol) || btc <= 0 || eth <= 0 || sol <= 0) {
      throw new Error(`Invalid Binance prices: BTC=${btcData.price} ETH=${ethData.price} SOL=${solData.price}`);
    }
    return { BTC: btc, ETH: eth, SOL: sol };
  } catch (error) {
    console.error('❌ Both APIs failed');
    throw error;
  }
}

// ========================================
// On-chain Update
// ========================================

async function updatePrices(
  client: SuiClient,
  keypair: Ed25519Keypair,
  prices: PriceUpdate[]
): Promise<string> {
  const tx = new Transaction();

  const symbols = prices.map((p) => p.symbol);
  const priceValues = prices.map((p) => p.price);
  const confidences = prices.map((p) => p.confidence);

  tx.moveCall({
    target: `${ORACLE_PACKAGE_ID}::dev_oracle::batch_update`,
    arguments: [
      tx.object(ADMIN_CAP_ID),
      tx.object(ORACLE_REGISTRY_ID),
      tx.pure.vector('u64', symbols),
      tx.pure.vector('u128', priceValues),
      tx.pure.vector('u128', confidences),
      tx.object(CLOCK_ID),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
    requestType: 'WaitForLocalExecution',
  });

  if (result.effects?.status?.status !== 'success') {
    throw new Error(`Transaction failed: ${result.effects?.status?.error}`);
  }

  return result.digest;
}

// ========================================
// Main
// ========================================

async function main() {
  console.log('🚀 Oracle Price Updater Bot');
  console.log(`   RPC: ${RPC_URL}`);
  console.log(`   Package: ${ORACLE_PACKAGE_ID.slice(0, 16)}...`);
  console.log(`   Registry: ${ORACLE_REGISTRY_ID.slice(0, 16)}...`);
  console.log(`   Symbols: BTC(1), ETH(2), NASUN(3), SOL(4)`);
  console.log(`   Interval: ${UPDATE_INTERVAL_MS / 1000}s\n`);

  // Get admin key from environment or use default (for testing only)
  const adminKeyHex = process.env.ORACLE_ADMIN_KEY;
  if (!adminKeyHex) {
    console.error('❌ ORACLE_ADMIN_KEY environment variable not set');
    console.log('   Export your admin private key: export ORACLE_ADMIN_KEY=<hex>');
    console.log('   You can get it from: sui keytool export --key-identity <alias>');
    process.exit(1);
  }

  const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(adminKeyHex, 'hex'));
  const client = new SuiClient({ url: RPC_URL });

  console.log(`   Admin: ${keypair.getPublicKey().toSuiAddress().slice(0, 16)}...\n`);

  const runOnce = process.argv.includes('--once');

  const update = async () => {
    try {
      const apiPrices = await withRetry(() => fetchPrices(), { label: 'fetchPrices' });

      const prices: PriceUpdate[] = [
        { symbol: BTCUSD, price: toOraclePrice(apiPrices.BTC), confidence: toConfidence(apiPrices.BTC) },
        { symbol: ETHUSD, price: toOraclePrice(apiPrices.ETH), confidence: toConfidence(apiPrices.ETH) },
        { symbol: NASUSD, price: toOraclePrice(1.0), confidence: toOraclePrice(0.001) }, // NASUN = $1 (fixed)
        { symbol: SOLUSD, price: toOraclePrice(apiPrices.SOL), confidence: toConfidence(apiPrices.SOL) },
      ];

      const digest = await withRetry(
        () => updatePrices(client, keypair, prices),
        { label: 'updatePrices' }
      );

      const now = new Date().toISOString().slice(11, 19);
      console.log(`[${now}] ✅ Updated prices (tx: ${digest.slice(0, 10)}...)`);
      console.log(`         BTC: $${apiPrices.BTC.toLocaleString()} | ETH: $${apiPrices.ETH.toLocaleString()} | SOL: $${apiPrices.SOL.toLocaleString()}`);
    } catch (error) {
      console.error('❌ Update failed after retries:', error instanceof Error ? error.message : error);
    }
  };

  // Run immediately
  await update();

  if (runOnce) {
    console.log('\n✅ Single update complete');
    process.exit(0);
  }

  // Run periodically
  console.log(`\n⏰ Running every ${UPDATE_INTERVAL_MS / 1000}s... (Ctrl+C to stop)\n`);
  setInterval(update, UPDATE_INTERVAL_MS);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
