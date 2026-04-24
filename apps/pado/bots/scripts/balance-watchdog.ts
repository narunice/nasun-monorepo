/**
 * Balance Watchdog
 *
 * Monitors LP bot wallet token balances and auto-refills via batched faucet.
 * Also auto-refills NASUN gas via HTTP faucet when balance drops below threshold.
 *
 * Usage:
 *   npx tsx scripts/balance-watchdog.ts
 *
 * Environment:
 *   LP_PRIVATE_KEY_NBTC/NETH/NSOL (required, must be unique addresses)
 *   LP_PRIVATE_KEY              - fallback if per-market key not set
 *   WATCHDOG_INTERVAL_MS        - check interval (default: 300000 = 5 min)
 *   WATCHDOG_REFILL_ROUNDS      - faucet rounds per refill (default: 50)
 *   WATCHDOG_GAS_WARNING        - warn when gas drops below this (NASUN, default: 1500)
 *   WATCHDOG_GAS_AUTO_REFILL    - auto-refill threshold (NASUN, default: 5000)
 *   NASUN_FAUCET_URL            - faucet base URL (default: https://faucet.devnet.nasun.io)
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { readBalanceManagerId, queryBalanceManagerBalances } from '../lib/balance-manager.js';

// ===== Configuration =====

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
const INTERVAL_MS = parseInt(process.env.WATCHDOG_INTERVAL_MS || '300000', 10);
const REFILL_ROUNDS = parseInt(process.env.WATCHDOG_REFILL_ROUNDS || '50', 10);
// Warn when gas drops below 1500 NASUN (above bot's 1000 NASUN skip threshold)
const GAS_WARNING_THRESHOLD = parseFloat(process.env.WATCHDOG_GAS_WARNING || '1500');
// Auto-refill via HTTP faucet when gas drops below this threshold
const GAS_AUTO_REFILL_THRESHOLD = parseFloat(process.env.WATCHDOG_GAS_AUTO_REFILL || '5000');
const FAUCET_URL = process.env.NASUN_FAUCET_URL || 'https://faucet.devnet.nasun.io';

// Auto-refill via HTTP faucet when gas drops below this threshold

// Contract addresses
const TOKENS_PACKAGE = '0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731';
const TOKEN_FAUCET = '0x7cc75ad1f00f65589074ba9a8f0ad4922b2be3bfef31c22c66d137bc8dbced92';
// Upgraded package (v7) — adds request_neth (no cooldown)
const TOKENS_V2_FAUCET_PACKAGE = '0xa26189900ac82fbb581579a346e0557905f1c7c9958e9d4dd460f421a43fc9ae';
const TOKEN_FAUCET_V2 = '0x39d18f61b17942dd6823d11a09393937e526619af2f7f707f6afc5c9453c75f2';
const NETH_FAUCET_PACKAGE = '0xbf33cac7b8ccb22d398a6dedc3e159ed68bc1804bf0726516360e7e0b9dcb474';
const NETH_FAUCET_V2 = '0x8654e80b3e978aa0d5dca457f6b891e2c6cdbda4531d8c2ee7ab4e1251a0e50e';

const TOKEN_TYPES = {
  NBTC: `${TOKENS_PACKAGE}::nbtc::NBTC`,
  NUSDC: `${TOKENS_PACKAGE}::nusdc::NUSDC`,
  NETH: '0xe672843fd6e5388ca1248200059c6ef50e82a68689f42f7b9efb3e70dcabdf31::neth::NETH',
  NSOL: '0xcc65166f76b0aed75f8c94527405cec82bb4b416483c7bcdd7725490179601b2::nsol::NSOL',
} as const;

const MARKETS = {
  NBTC: {
    baseType: TOKEN_TYPES.NBTC,
    baseDecimals: 8,
    baseThreshold: 15,
    quoteThreshold: 500_000,
    faucetType: 'v1' as const,
    basePerRound: 0.01,
    quotePerRound: 100_000,
  },
  NETH: {
    baseType: TOKEN_TYPES.NETH,
    baseDecimals: 8,
    baseThreshold: 500,
    quoteThreshold: 500_000,
    faucetType: 'v2' as const,
    faucetV2Package: TOKENS_V2_FAUCET_PACKAGE,
    faucetV2Object: TOKEN_FAUCET_V2,
    faucetV2Function: 'request_neth',
    basePerRound: 8.0,
    quotePerRound: 100_000,
  },
  NSOL: {
    baseType: TOKEN_TYPES.NSOL,
    baseDecimals: 9,
    baseThreshold: 8000,
    quoteThreshold: 500_000,
    faucetType: 'v2' as const,
    faucetV2Package: TOKENS_V2_FAUCET_PACKAGE,
    faucetV2Object: TOKEN_FAUCET_V2,
    faucetV2Function: 'request_nsol',
    basePerRound: 50,
    quotePerRound: 100_000,
  },
} as const;

// ===== Helpers =====

function timestamp(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

function loadKeypairSafe(market: string): Ed25519Keypair | null {
  const keyStr = process.env[`LP_PRIVATE_KEY_${market}`] || process.env.LP_PRIVATE_KEY;
  if (!keyStr) return null;
  try {
    const { secretKey } = decodeSuiPrivateKey(keyStr);
    return Ed25519Keypair.fromSecretKey(secretKey);
  } catch {
    try {
      return Ed25519Keypair.fromSecretKey(Buffer.from(keyStr, 'hex'));
    } catch {
      return null;
    }
  }
}

async function getTokenBalance(
  client: SuiClient,
  owner: string,
  coinType: string,
  decimals: number,
): Promise<number> {
  const balance = await client.getBalance({ owner, coinType });
  return Number(balance.totalBalance) / (10 ** decimals);
}


async function getGasBalance(client: SuiClient, owner: string): Promise<number> {
  const balance = await client.getBalance({ owner });
  return Number(balance.totalBalance) / 1e9;
}

function buildBatchedRefillTx(market: keyof typeof MARKETS, rounds: number): Transaction {
  const config = MARKETS[market];
  const tx = new Transaction();
  tx.setGasBudget(500_000_000);

  if (config.faucetType === 'v1') {
    for (let i = 0; i < rounds; i++) {
      tx.moveCall({
        target: `${TOKENS_PACKAGE}::faucet::request_tokens`,
        arguments: [tx.object(TOKEN_FAUCET)],
      });
    }
  } else {
    const pkg = 'faucetV2Package' in config ? config.faucetV2Package : '';
    const obj = 'faucetV2Object' in config ? config.faucetV2Object : '';
    const fn = ('faucetV2Function' in config ? config.faucetV2Function : 'request_tokens') as string;

    for (let i = 0; i < rounds; i++) {
      tx.moveCall({
        target: `${pkg}::faucet_v2::${fn}`,
        arguments: [tx.object(obj)],
      });
      tx.moveCall({
        target: `${TOKENS_PACKAGE}::faucet::request_nusdc`,
        arguments: [tx.object(TOKEN_FAUCET)],
      });
    }
  }

  return tx;
}

// ===== Market Check =====

async function checkMarket(client: SuiClient, market: keyof typeof MARKETS): Promise<void> {
  const keypair = loadKeypairSafe(market);
  if (!keypair) {
    console.warn(`[${timestamp()}] [${market}] Skipping: LP_PRIVATE_KEY_${market} not set`);
    return;
  }

  const address = keypair.getPublicKey().toSuiAddress();
  const config = MARKETS[market];

  // Auto-refill gas via HTTP faucet when below threshold
  const gas = await getGasBalance(client, address);
  if (gas < GAS_AUTO_REFILL_THRESHOLD) {
    console.log(`[${timestamp()}] [${market}] Gas low (${gas.toFixed(0)} NASUN), requesting from faucet...`);
    try {
      const body = JSON.stringify({ FixedAmountRequest: { recipient: address } });
      const res = await fetch(`${FAUCET_URL}/v1/gas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        console.log(`[${timestamp()}] [${market}] Gas refilled via faucet`);
      } else {
        const text = await res.text().catch(() => res.status.toString());
        console.error(`[${timestamp()}] [${market}] Gas faucet FAILED: ${text}`);
      }
    } catch (err) {
      console.error(`[${timestamp()}] [${market}] Gas faucet error:`, err instanceof Error ? err.message : err);
    }
  }

  // lp-bot depositAll moves wallet tokens into BalanceManager each cycle, so wallet alone is ~0.
  // Check wallet + BalanceManager combined to avoid false LOW triggers.
  const bmId = readBalanceManagerId(market, address);
  const [walletBase, walletNusdc, bmBal] = await Promise.all([
    getTokenBalance(client, address, config.baseType, config.baseDecimals),
    getTokenBalance(client, address, TOKEN_TYPES.NUSDC, 6),
    bmId
      ? queryBalanceManagerBalances(client, bmId, config.baseType, config.baseDecimals, TOKEN_TYPES.NUSDC, 6).catch(() => {
          console.warn(`[${timestamp()}] [${market}] BalanceManager query failed, using wallet balance only`);
          return { base: 0, quote: 0 };
        })
      : Promise.resolve({ base: 0, quote: 0 }),
  ]);

  const bmBase = bmBal.base;
  const bmNusdc = bmBal.quote;

  const totalBase = walletBase + bmBase;
  const totalNusdc = walletNusdc + bmNusdc;
  const needBase = totalBase < config.baseThreshold;
  const needQuote = totalNusdc < config.quoteThreshold;

  if (needBase || needQuote) {
    console.log(
      `[${timestamp()}] [${market}] LOW: ` +
      `${totalBase.toFixed(2)} ${market} (wallet=${walletBase.toFixed(2)}, bm=${bmBase.toFixed(2)}, threshold=${config.baseThreshold}), ` +
      `${totalNusdc.toLocaleString()} NUSDC (wallet=${walletNusdc.toLocaleString()}, bm=${bmNusdc.toLocaleString()}, threshold=${config.quoteThreshold.toLocaleString()})`
    );

    try {
      const tx = buildBatchedRefillTx(market, REFILL_ROUNDS);
      const result = await client.signAndExecuteTransaction({
        signer: keypair,
        transaction: tx,
        options: { showEffects: true },
      });

      if (result.effects?.status?.status === 'success') {
        const mintedBase = config.basePerRound * REFILL_ROUNDS;
        const mintedQuote = config.quotePerRound * REFILL_ROUNDS;
        console.log(
          `[${timestamp()}] [${market}] REFILLED: ` +
          `+${mintedBase.toLocaleString()} ${market}, +${mintedQuote.toLocaleString()} NUSDC ` +
          `(tx: ${result.digest.slice(0, 12)}...)`
        );
        await client.waitForTransaction({ digest: result.digest });
      } else {
        console.error(`[${timestamp()}] [${market}] Refill TX failed:`, result.effects?.status?.error);
      }
    } catch (err) {
      console.error(`[${timestamp()}] [${market}] Refill error:`, err instanceof Error ? err.message : err);
    }
  } else {
    console.log(
      `[${timestamp()}] [${market}] OK: ` +
      `${totalBase.toFixed(2)} ${market} (wallet=${walletBase.toFixed(2)}, bm=${bmBase.toFixed(2)}), ` +
      `${totalNusdc.toLocaleString()} NUSDC, ${gas.toFixed(0)} NASUN gas`
    );
  }
}

// ===== Startup Assertion =====

function assertUniqueWallets(): void {
  const entries = (['NBTC', 'NETH', 'NSOL'] as const).map((market) => {
    const keypair = loadKeypairSafe(market);
    return keypair ? keypair.getPublicKey().toSuiAddress() : null;
  }).filter((addr): addr is string => addr !== null);

  if (new Set(entries).size < entries.length) {
    console.error('FATAL: LP bot wallets are not unique. Check LP_PRIVATE_KEY_NBTC/NETH/NSOL');
    process.exit(1);
  }
  console.log(`[${timestamp()}] Wallet uniqueness check passed (${entries.length} wallets)`);
}

// ===== Main Loop =====

async function checkAll(client: SuiClient): Promise<void> {
  // Check watchdog's own gas (it spends ~0.5 NASUN per batch TX)
  const selfKeypair = loadKeypairSafe('NBTC') || loadKeypairSafe('NETH') || loadKeypairSafe('NSOL');
  if (selfKeypair) {
    // Watchdog runs as one of the bot keypairs; its own gas is the same wallet
    // The per-market check above covers this. Log separately if needed.
  }

  // Run all 3 market checks in parallel (safe because wallets are unique per assertion)
  await Promise.allSettled([
    checkMarket(client, 'NBTC'),
    checkMarket(client, 'NETH'),
    checkMarket(client, 'NSOL'),
  ]);
}

async function main() {
  const client = new SuiClient({ url: RPC_URL });

  console.log('=== Balance Watchdog ===');
  console.log(`RPC: ${RPC_URL}`);
  console.log(`Check interval: ${INTERVAL_MS / 1000}s`);
  console.log(`Refill rounds: ${REFILL_ROUNDS}`);
  console.log(`Gas warning threshold: ${GAS_WARNING_THRESHOLD} NASUN`);
  console.log('');

  assertUniqueWallets();

  await checkAll(client);

  const scheduleNext = () => setTimeout(async () => {
    try {
      await checkAll(client);
    } catch (err) {
      console.error(`[${timestamp()}] Watchdog error:`, err instanceof Error ? err.message : err);
    } finally {
      scheduleNext();
    }
  }, INTERVAL_MS);
  scheduleNext();
}

main().catch((err) => {
  console.error('Watchdog fatal error:', err);
  process.exit(1);
});
