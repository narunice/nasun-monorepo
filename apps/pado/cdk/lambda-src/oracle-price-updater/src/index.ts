/**
 * Pado Oracle Price Updater Lambda
 *
 * Fetches BTC/ETH prices from CoinGecko/Binance and pushes them
 * to the DevOracle contract on Nasun Devnet via batch_update.
 *
 * Triggered by EventBridge every 1 minute.
 */

import { Handler } from 'aws-lambda';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

// ========================================
// Configuration (from Lambda environment)
// ========================================

const ORACLE_PACKAGE_ID = process.env.ORACLE_PACKAGE_ID || '';
const ORACLE_REGISTRY_ID = process.env.ORACLE_REGISTRY_ID || '';
const ADMIN_CAP_ID = process.env.ADMIN_CAP_ID || '';
const SUI_RPC_URL = process.env.SUI_RPC_URL || 'https://rpc.devnet.nasun.io';
const ORACLE_SECRET_NAME = process.env.ORACLE_SECRET_NAME || 'pado/oracle-admin-key';
const CLOCK_ID = '0x6';

const DECIMALS = 8;

// Symbol IDs (must match dev_oracle.move)
const BTCUSD = 1;
const ETHUSD = 2;
const NASUSD = 3;

// ========================================
// Secrets Manager (cached across invocations)
// ========================================

const secretsClient = new SecretsManagerClient({ region: 'ap-northeast-2' });
let cachedAdminKey: string | null = null;

async function getAdminKey(): Promise<string> {
  if (cachedAdminKey) return cachedAdminKey;

  const response = await secretsClient.send(
    new GetSecretValueCommand({ SecretId: ORACLE_SECRET_NAME })
  );

  if (!response.SecretString) {
    throw new Error('Oracle admin key secret is empty');
  }

  cachedAdminKey = response.SecretString;
  return cachedAdminKey;
}

// ========================================
// Price Helpers
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
  return toOraclePrice(usd * 0.001); // 0.1% confidence interval
}

// ========================================
// Price Fetching
// ========================================

async function fetchPrices(): Promise<{ BTC: number; ETH: number }> {
  // Primary: CoinGecko
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd',
      { signal: AbortSignal.timeout(5000) }
    );
    const data = await response.json();
    if (data.bitcoin?.usd && data.ethereum?.usd) {
      return { BTC: data.bitcoin.usd, ETH: data.ethereum.usd };
    }
    throw new Error('Invalid CoinGecko response');
  } catch (error) {
    console.log('CoinGecko failed, trying Binance...');
  }

  // Backup: Binance
  const [btcRes, ethRes] = await Promise.all([
    fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', {
      signal: AbortSignal.timeout(5000),
    }),
    fetch('https://api.binance.com/api/v3/ticker/price?symbol=ETHUSDT', {
      signal: AbortSignal.timeout(5000),
    }),
  ]);
  const btcData = await btcRes.json();
  const ethData = await ethRes.json();
  return {
    BTC: parseFloat(btcData.price),
    ETH: parseFloat(ethData.price),
  };
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

  tx.moveCall({
    target: `${ORACLE_PACKAGE_ID}::dev_oracle::batch_update`,
    arguments: [
      tx.object(ADMIN_CAP_ID),
      tx.object(ORACLE_REGISTRY_ID),
      tx.pure.vector('u64', prices.map((p) => p.symbol)),
      tx.pure.vector('u128', prices.map((p) => p.price)),
      tx.pure.vector('u128', prices.map((p) => p.confidence)),
      tx.object(CLOCK_ID),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });

  if (result.effects?.status?.status !== 'success') {
    throw new Error(`Transaction failed: ${result.effects?.status?.error}`);
  }

  return result.digest;
}

// ========================================
// Lambda Handler
// ========================================

export const handler: Handler = async () => {
  const startTime = Date.now();

  try {
    // 1. Get admin key from Secrets Manager
    const adminKeyHex = await getAdminKey();
    const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(adminKeyHex, 'hex'));
    const client = new SuiClient({ url: SUI_RPC_URL });

    // 2. Fetch prices
    const apiPrices = await fetchPrices();

    // 3. Build price updates
    const prices: PriceUpdate[] = [
      { symbol: BTCUSD, price: toOraclePrice(apiPrices.BTC), confidence: toConfidence(apiPrices.BTC) },
      { symbol: ETHUSD, price: toOraclePrice(apiPrices.ETH), confidence: toConfidence(apiPrices.ETH) },
      { symbol: NASUSD, price: toOraclePrice(1.0), confidence: toOraclePrice(0.001) },
    ];

    // 4. Push to on-chain oracle
    const digest = await updatePrices(client, keypair, prices);

    const elapsed = Date.now() - startTime;
    console.log(JSON.stringify({
      status: 'success',
      digest: digest.slice(0, 16),
      btc: apiPrices.BTC,
      eth: apiPrices.ETH,
      elapsed_ms: elapsed,
    }));

    return { statusCode: 200, body: JSON.stringify({ digest, btc: apiPrices.BTC, eth: apiPrices.ETH }) };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ status: 'error', message, elapsed_ms: elapsed }));

    return { statusCode: 500, body: JSON.stringify({ error: message }) };
  }
};
