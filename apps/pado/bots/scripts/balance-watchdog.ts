/**
 * Balance Watchdog
 *
 * Monitors LP bot wallet balances and auto-refills via batched legacy faucet
 * when tokens drop below threshold. Runs as a PM2 process alongside LP bots.
 *
 * This replaces the bot's own faucet calls (LP_DISABLE_TOKEN_FAUCET=true)
 * to avoid shared object contention with user faucet claims.
 * Batched refills (1 TX per market, every ~10 min) have negligible contention
 * compared to the bot's old approach (1 TX per cycle, every 10 seconds).
 *
 * Usage:
 *   npx tsx scripts/balance-watchdog.ts
 *
 * Environment:
 *   LP_PRIVATE_KEY (or LP_PRIVATE_KEY_NBTC/NETH/NSOL)
 *   WATCHDOG_INTERVAL_MS  - check interval (default: 600000 = 10 min)
 *   WATCHDOG_REFILL_ROUNDS - faucet rounds per refill (default: 50)
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

// ===== Configuration =====

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
const INTERVAL_MS = parseInt(process.env.WATCHDOG_INTERVAL_MS || '600000', 10); // 10 min
const REFILL_ROUNDS = parseInt(process.env.WATCHDOG_REFILL_ROUNDS || '50', 10);
const FAUCET_URL = process.env.FAUCET_URL || 'https://faucet.devnet.nasun.io';

// Contract addresses
const TOKENS_PACKAGE = '0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731';
const TOKEN_FAUCET = '0x7cc75ad1f00f65589074ba9a8f0ad4922b2be3bfef31c22c66d137bc8dbced92';
const TOKENS_V2_FAUCET_PACKAGE = '0xd3256ab6c7013402f258870188e15e69bd881c534e913c1ee7d991f4f9e6ab0f';
const TOKEN_FAUCET_V2 = '0x39d18f61b17942dd6823d11a09393937e526619af2f7f707f6afc5c9453c75f2';
const NETH_PACKAGE = '0xe672843fd6e5388ca1248200059c6ef50e82a68689f42f7b9efb3e70dcabdf31';
const NETH_FAUCET_PACKAGE = '0xbf33cac7b8ccb22d398a6dedc3e159ed68bc1804bf0726516360e7e0b9dcb474';
const NETH_FAUCET_V2 = '0x8654e80b3e978aa0d5dca457f6b891e2c6cdbda4531d8c2ee7ab4e1251a0e50e';

// Token type strings for balance queries
const TOKEN_TYPES = {
  NBTC: `${TOKENS_PACKAGE}::nbtc::NBTC`,
  NUSDC: `${TOKENS_PACKAGE}::nusdc::NUSDC`,
  NETH: '0xe672843fd6e5388ca1248200059c6ef50e82a68689f42f7b9efb3e70dcabdf31::neth::NETH',
  NSOL: '0xcc65166f76b0aed75f8c94527405cec82bb4b416483c7bcdd7725490179601b2::nsol::NSOL',
} as const;

// Per-market thresholds and faucet config
const MARKETS = {
  NBTC: {
    baseType: TOKEN_TYPES.NBTC,
    baseDecimals: 8,
    baseThreshold: 15,     // Refill when < 15 NBTC in wallet
    quoteThreshold: 500_000, // Refill when < 500K NUSDC
    faucetType: 'v1' as const,
    basePerRound: 0.01,    // 0.01 NBTC per faucet call
    quotePerRound: 100_000, // 100K NUSDC per faucet call
  },
  NETH: {
    baseType: TOKEN_TYPES.NETH,
    baseDecimals: 8,
    baseThreshold: 500,     // Refill when < 500 NETH
    quoteThreshold: 500_000,
    faucetType: 'v2' as const,
    faucetV2Package: NETH_FAUCET_PACKAGE,
    faucetV2Object: NETH_FAUCET_V2,
    basePerRound: 2.5,     // 2.5 NETH per faucet call
    quotePerRound: 100_000,
  },
  NSOL: {
    baseType: TOKEN_TYPES.NSOL,
    baseDecimals: 9,
    baseThreshold: 8000,    // Refill when < 8000 NSOL
    quoteThreshold: 500_000,
    faucetType: 'v2' as const,
    faucetV2Package: TOKENS_V2_FAUCET_PACKAGE,
    faucetV2Object: TOKEN_FAUCET_V2,
    faucetV2Function: 'request_nsol',
    basePerRound: 50,      // 50 NSOL per faucet call
    quotePerRound: 100_000,
  },
} as const;

// ===== Helpers =====

function timestamp(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

function loadKeypair(market: string): Ed25519Keypair {
  const keyStr = process.env[`LP_PRIVATE_KEY_${market}`] || process.env.LP_PRIVATE_KEY;
  if (!keyStr) throw new Error(`Set LP_PRIVATE_KEY_${market} or LP_PRIVATE_KEY`);
  try {
    const { secretKey } = decodeSuiPrivateKey(keyStr);
    return Ed25519Keypair.fromSecretKey(secretKey);
  } catch {
    return Ed25519Keypair.fromSecretKey(Buffer.from(keyStr, 'hex'));
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

async function requestGas(address: string): Promise<boolean> {
  try {
    const res = await fetch(`${FAUCET_URL}/gas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ FixedAmountRequest: { recipient: address } }),
    });
    if (!res.ok) return false;
    console.log(`[${timestamp()}] Gas refilled from faucet`);
    await new Promise((r) => setTimeout(r, 3000));
    return true;
  } catch {
    return false;
  }
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

// ===== Main Loop =====

async function checkAndRefill(client: SuiClient): Promise<void> {
  // Deduplicate keypairs (all markets may share the same key)
  const keypairsByAddress = new Map<string, { keypair: Ed25519Keypair; markets: string[] }>();

  for (const market of Object.keys(MARKETS)) {
    const keypair = loadKeypair(market);
    const address = keypair.getPublicKey().toSuiAddress();
    const existing = keypairsByAddress.get(address);
    if (existing) {
      existing.markets.push(market);
    } else {
      keypairsByAddress.set(address, { keypair, markets: [market] });
    }
  }

  for (const [address, { keypair, markets }] of keypairsByAddress) {
    // Check gas first
    const gas = await getGasBalance(client, address);
    if (gas < 1) {
      console.log(`[${timestamp()}] Low gas (${gas.toFixed(2)} NASUN) for ${address.slice(0, 10)}..., requesting...`);
      await requestGas(address);
    }

    // Check NUSDC (shared across all markets for this address)
    const nusdc = await getTokenBalance(client, address, TOKEN_TYPES.NUSDC, 6);

    for (const marketName of markets) {
      const config = MARKETS[marketName as keyof typeof MARKETS];
      const base = await getTokenBalance(client, address, config.baseType, config.baseDecimals);

      const needBase = base < config.baseThreshold;
      const needQuote = nusdc < config.quoteThreshold;

      if (needBase || needQuote) {
        console.log(
          `[${timestamp()}] ${marketName} LOW: ` +
          `${base.toFixed(2)} ${marketName} (threshold: ${config.baseThreshold}), ` +
          `${nusdc.toLocaleString()} NUSDC (threshold: ${config.quoteThreshold.toLocaleString()})`
        );

        try {
          const tx = buildBatchedRefillTx(marketName as keyof typeof MARKETS, REFILL_ROUNDS);
          const result = await client.signAndExecuteTransaction({
            signer: keypair,
            transaction: tx,
            options: { showEffects: true },
          });

          if (result.effects?.status?.status === 'success') {
            const mintedBase = config.basePerRound * REFILL_ROUNDS;
            const mintedQuote = config.quotePerRound * REFILL_ROUNDS;
            console.log(
              `[${timestamp()}] ${marketName} REFILLED: ` +
              `+${mintedBase.toLocaleString()} ${marketName}, +${mintedQuote.toLocaleString()} NUSDC ` +
              `(tx: ${result.digest.slice(0, 12)}...)`
            );
            await client.waitForTransaction({ digest: result.digest });
          } else {
            console.error(`[${timestamp()}] ${marketName} refill TX failed:`, result.effects?.status?.error);
          }
        } catch (err) {
          console.error(`[${timestamp()}] ${marketName} refill error:`, err instanceof Error ? err.message : err);
        }
      } else {
        console.log(
          `[${timestamp()}] ${marketName} OK: ${base.toFixed(2)} ${marketName}, ${nusdc.toLocaleString()} NUSDC`
        );
      }
    }
  }
}

async function main() {
  const client = new SuiClient({ url: RPC_URL });

  console.log('=== Balance Watchdog ===');
  console.log(`RPC: ${RPC_URL}`);
  console.log(`Check interval: ${INTERVAL_MS / 1000}s`);
  console.log(`Refill rounds: ${REFILL_ROUNDS}`);
  console.log('');

  // Initial check
  await checkAndRefill(client);

  // Periodic checks
  setInterval(async () => {
    try {
      await checkAndRefill(client);
    } catch (err) {
      console.error(`[${timestamp()}] Watchdog error:`, err instanceof Error ? err.message : err);
    }
  }, INTERVAL_MS);
}

main().catch((err) => {
  console.error('Watchdog fatal error:', err);
  process.exit(1);
});
