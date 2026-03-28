/**
 * Seed Leisure Pools (NumberMatch + ScratchCard)
 *
 * Checks pool balances and funds them if below POOL_MIN_BALANCE (500 NUSDC).
 * Idempotent: safe to run multiple times.
 *
 * Usage:
 *   cd apps/pado/scripts
 *   npx tsx seed-leisure-pools.ts
 *
 * Prerequisites:
 *   - Contracts deployed on V7+
 *   - Sui CLI configured with active address owning AdminCaps
 *   - Admin address has NUSDC for funding
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import {
  NUMBERMATCH_PACKAGE_ID,
  NUMBERMATCH_POOL,
  NUMBERMATCH_ADMIN_CAP,
  SCRATCHCARD_PACKAGE_ID,
  SCRATCHCARD_POOL,
  SCRATCHCARD_ADMIN_CAP,
  NUSDC_TYPE,
} from '@nasun/devnet-config';
import { getKeypairFromSuiConfig } from './lib/keystore';

const RPC_URL = 'https://rpc.devnet.nasun.io';
const POOL_MIN_BALANCE = 500_000_000n; // 500 NUSDC
const FUND_AMOUNT = 2000_000_000n; // 2000 NUSDC (generous buffer)
const NUSDC_DECIMALS = 6;

interface PoolConfig {
  name: string;
  packageId: string;
  moduleName: string;
  poolId: string;
  adminCapId: string;
}

const POOLS: PoolConfig[] = [
  {
    name: 'NumberMatch',
    packageId: NUMBERMATCH_PACKAGE_ID,
    moduleName: 'numbermatch',
    poolId: NUMBERMATCH_POOL,
    adminCapId: NUMBERMATCH_ADMIN_CAP,
  },
  {
    name: 'ScratchCard',
    packageId: SCRATCHCARD_PACKAGE_ID,
    moduleName: 'scratchcard',
    poolId: SCRATCHCARD_POOL,
    adminCapId: SCRATCHCARD_ADMIN_CAP,
  },
];

async function getPoolBalance(
  client: SuiClient,
  poolId: string,
): Promise<bigint> {
  const obj = await client.getObject({
    id: poolId,
    options: { showContent: true },
  });
  const fields = (obj.data?.content as any)?.fields;
  if (!fields) throw new Error(`Cannot read pool ${poolId}`);
  return BigInt(fields.pool || '0');
}

async function findNusdcCoin(
  client: SuiClient,
  owner: string,
  minBalance: bigint,
): Promise<string> {
  const coins = await client.getCoins({ owner, coinType: NUSDC_TYPE });
  for (const coin of coins.data) {
    if (BigInt(coin.balance) >= minBalance) {
      return coin.coinObjectId;
    }
  }
  const total = coins.data.reduce((s, c) => s + BigInt(c.balance), 0n);
  throw new Error(
    `Insufficient NUSDC. Need ${minBalance}, have ${total} across ${coins.data.length} coins.`,
  );
}

async function main() {
  console.log('=== Seed Leisure Pools ===\n');

  const client = new SuiClient({ url: RPC_URL });
  const keypair = getKeypairFromSuiConfig();
  const senderAddress = keypair.getPublicKey().toSuiAddress();

  console.log(`Admin: ${senderAddress}`);
  console.log(
    `Min balance: ${Number(POOL_MIN_BALANCE) / 10 ** NUSDC_DECIMALS} NUSDC`,
  );
  console.log(
    `Fund amount: ${Number(FUND_AMOUNT) / 10 ** NUSDC_DECIMALS} NUSDC\n`,
  );

  for (const pool of POOLS) {
    console.log(`--- ${pool.name} ---`);

    const balance = await getPoolBalance(client, pool.poolId);
    const balanceNusdc = Number(balance) / 10 ** NUSDC_DECIMALS;
    console.log(`  Current balance: ${balanceNusdc} NUSDC`);

    if (balance >= POOL_MIN_BALANCE) {
      console.log('  Sufficient. Skipping.\n');
      continue;
    }

    console.log(`  Below minimum. Funding ${Number(FUND_AMOUNT) / 10 ** NUSDC_DECIMALS} NUSDC...`);

    const nusdcCoinId = await findNusdcCoin(client, senderAddress, FUND_AMOUNT);

    const tx = new Transaction();
    const [fundCoin] = tx.splitCoins(tx.object(nusdcCoinId), [
      tx.pure.u64(FUND_AMOUNT),
    ]);
    tx.moveCall({
      target: `${pool.packageId}::${pool.moduleName}::fund_pool`,
      arguments: [
        tx.object(pool.adminCapId),
        tx.object(pool.poolId),
        fundCoin,
      ],
    });

    try {
      const result = await client.signAndExecuteTransaction({
        transaction: tx,
        signer: keypair,
        options: { showEffects: true },
      });
      console.log(`  TX: ${result.digest}`);

      const newBalance = await getPoolBalance(client, pool.poolId);
      console.log(
        `  New balance: ${Number(newBalance) / 10 ** NUSDC_DECIMALS} NUSDC\n`,
      );
    } catch (error) {
      console.error(
        `  Failed:`,
        error instanceof Error ? error.message : error,
      );
      console.log('');
    }
  }

  console.log('Done.');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
