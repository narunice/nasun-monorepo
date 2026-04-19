/**
 * cancel-and-sweep.ts
 *
 * One-shot script to:
 * 1. Cancel all open orders from old wallet in NBTC/NETH/NSOL markets
 * 2. Withdraw all tokens from old wallet's BalanceManagers
 * 3. Transfer all tokens to the new bot wallets
 *
 * Usage:
 *   LP_PRIVATE_KEY=<old_key> \
 *   LP_PRIVATE_KEY_NBTC=<new_nbtc_key> \
 *   LP_PRIVATE_KEY_NETH=<new_neth_key> \
 *   LP_PRIVATE_KEY_NSOL=<new_nsol_key> \
 *   pnpm tsx scripts/cancel-and-sweep.ts
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';

// Contract addresses
const DEEPBOOK_PACKAGE = '0xb4a100f26550fe84d8134e9e97ef1569e8f2e63cd864adf4774249ee05178134';
const CLOCK_ID = '0x6';
const TOKENS_PACKAGE = '0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731';
const NETH_PACKAGE = '0xe672843fd6e5388ca1248200059c6ef50e82a68689f42f7b9efb3e70dcabdf31';
const TOKENS_V2_PACKAGE = '0xcc65166f76b0aed75f8c94527405cec82bb4b416483c7bcdd7725490179601b2';

const MARKETS = {
  NBTC: {
    baseType: `${TOKENS_PACKAGE}::nbtc::NBTC`,
    quoteType: `${TOKENS_PACKAGE}::nusdc::NUSDC`,
    poolId: '0xa2b755aebb88f9d249e22d58f7ac5e2e003ce53f4d5bbb30c03be50966d01cd0',
    baseDecimals: 8,
    // Old wallet's BalanceManager for this market
    oldBalanceManager: '0xcaa08c7faec0ee4f9d207c2243c6c675441b1d63c885440a29b52c6e608b28f7',
  },
  NETH: {
    baseType: `${NETH_PACKAGE}::neth::NETH`,
    quoteType: `${TOKENS_PACKAGE}::nusdc::NUSDC`,
    poolId: '0xb6c960985711cf5a9cc5063cec8c7ad148794e4cb3c1ad1cea224911cd68e7b7',
    baseDecimals: 8,
    oldBalanceManager: '0x0a929f5607d6c000fe54841af865a4590f9e948e775b0c62bb3cd071fec3cb21',
  },
  NSOL: {
    baseType: `${TOKENS_V2_PACKAGE}::nsol::NSOL`,
    quoteType: `${TOKENS_PACKAGE}::nusdc::NUSDC`,
    poolId: '0x577f81bb5dae12aac57103ed0231aae200af3ac1c5db3d523b679b09ac88c769',
    baseDecimals: 9,
    oldBalanceManager: '0xd0d7bf0675e5d5aa415c217a93225c63dbeaf7692417674057c867d4ee1e0ad1',
  },
} as const;

function loadKeypair(envKey: string): Ed25519Keypair {
  const keyStr = process.env[envKey];
  if (!keyStr) throw new Error(`${envKey} not set`);
  try {
    const { secretKey } = decodeSuiPrivateKey(keyStr);
    return Ed25519Keypair.fromSecretKey(secretKey);
  } catch {
    return Ed25519Keypair.fromSecretKey(Buffer.from(keyStr, 'hex'));
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function getTokenBalance(client: SuiClient, owner: string, coinType: string): Promise<bigint> {
  const bal = await client.getBalance({ owner, coinType });
  return BigInt(bal.totalBalance);
}

async function cancelAllOrdersForMarket(
  client: SuiClient,
  keypair: Ed25519Keypair,
  market: keyof typeof MARKETS,
): Promise<void> {
  const cfg = MARKETS[market];
  const address = keypair.getPublicKey().toSuiAddress();

  console.log(`\n[${market}] Cancelling all orders...`);
  console.log(`  Pool: ${cfg.poolId.slice(0, 16)}...`);
  console.log(`  BalanceManager: ${cfg.oldBalanceManager.slice(0, 16)}...`);

  const tx = new Transaction();
  tx.setGasBudget(500_000_000);

  const tradeProof = tx.moveCall({
    target: `${DEEPBOOK_PACKAGE}::balance_manager::generate_proof_as_owner`,
    arguments: [tx.object(cfg.oldBalanceManager)],
  });

  tx.moveCall({
    target: `${DEEPBOOK_PACKAGE}::pool::cancel_all_orders`,
    typeArguments: [cfg.baseType, cfg.quoteType],
    arguments: [
      tx.object(cfg.poolId),
      tx.object(cfg.oldBalanceManager),
      tradeProof,
      tx.object(CLOCK_ID),
    ],
  });

  try {
    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showEffects: true },
    });

    if (result.effects?.status?.status === 'success') {
      console.log(`  [${market}] cancel_all_orders OK (tx: ${result.digest.slice(0, 12)}...)`);
      await client.waitForTransaction({ digest: result.digest });
    } else {
      console.error(`  [${market}] cancel_all_orders failed:`, result.effects?.status?.error);
    }
  } catch (err) {
    console.error(`  [${market}] cancel_all_orders error:`, err instanceof Error ? err.message : err);
  }
}

async function withdrawFromBalanceManager(
  client: SuiClient,
  keypair: Ed25519Keypair,
  market: keyof typeof MARKETS,
): Promise<void> {
  const cfg = MARKETS[market];

  console.log(`\n[${market}] Withdrawing from BalanceManager...`);

  // withdraw_all returns a Coin object that must be transferred (not dropped)
  const address = keypair.getPublicKey().toSuiAddress();
  const tx = new Transaction();
  tx.setGasBudget(200_000_000);

  const baseCoin = tx.moveCall({
    target: `${DEEPBOOK_PACKAGE}::balance_manager::withdraw_all`,
    typeArguments: [cfg.baseType],
    arguments: [tx.object(cfg.oldBalanceManager)],
  });
  tx.transferObjects([baseCoin], address);

  const quoteCoin = tx.moveCall({
    target: `${DEEPBOOK_PACKAGE}::balance_manager::withdraw_all`,
    typeArguments: [cfg.quoteType],
    arguments: [tx.object(cfg.oldBalanceManager)],
  });
  tx.transferObjects([quoteCoin], address);

  try {
    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showEffects: true },
    });

    if (result.effects?.status?.status === 'success') {
      console.log(`  [${market}] withdraw_all OK (tx: ${result.digest.slice(0, 12)}...)`);
      await client.waitForTransaction({ digest: result.digest });
    } else {
      console.error(`  [${market}] withdraw_all failed:`, result.effects?.status?.error);
    }
  } catch (err) {
    console.error(`  [${market}] withdraw_all error:`, err instanceof Error ? err.message : err);
  }
}

async function sweepTokens(
  client: SuiClient,
  oldKeypair: Ed25519Keypair,
  newNbtcAddr: string,
  newNethAddr: string,
  newNsolAddr: string,
): Promise<void> {
  const oldAddress = oldKeypair.getPublicKey().toSuiAddress();

  console.log('\n=== Sweeping all tokens from old wallet ===');

  // Collect all coin types present in old wallet
  const coinTypes = [
    { type: MARKETS.NBTC.baseType, label: 'NBTC', dest: newNbtcAddr },
    { type: MARKETS.NBTC.quoteType, label: 'NUSDC', dest: newNbtcAddr },
    { type: MARKETS.NETH.baseType, label: 'NETH', dest: newNethAddr },
    { type: MARKETS.NSOL.baseType, label: 'NSOL', dest: newNsolAddr },
  ];

  for (const { type, label, dest } of coinTypes) {
    const coins = await client.getCoins({ owner: oldAddress, coinType: type });
    if (coins.data.length === 0) {
      console.log(`  ${label}: 0 coins, skipping`);
      continue;
    }

    const totalRaw = coins.data.reduce((s, c) => s + BigInt(c.balance), 0n);
    console.log(`  ${label}: ${coins.data.length} coins, total raw=${totalRaw}`);

    const tx = new Transaction();
    tx.setGasBudget(50_000_000);

    const coinIds = coins.data.map((c) => c.coinObjectId);
    let primary: ReturnType<typeof tx.object>;

    if (coinIds.length === 1) {
      primary = tx.object(coinIds[0]);
    } else {
      const [first, ...rest] = coinIds;
      primary = tx.object(first);
      tx.mergeCoins(primary, rest.map((id) => tx.object(id)));
    }

    tx.transferObjects([primary], dest);

    try {
      const result = await client.signAndExecuteTransaction({
        signer: oldKeypair,
        transaction: tx,
        options: { showEffects: true },
      });

      if (result.effects?.status?.status === 'success') {
        console.log(`  ${label}: transferred to ${dest.slice(0, 12)}... (tx: ${result.digest.slice(0, 12)}...)`);
        await client.waitForTransaction({ digest: result.digest });
      } else {
        console.error(`  ${label}: transfer failed:`, result.effects?.status?.error);
      }
    } catch (err) {
      console.error(`  ${label}: transfer error:`, err instanceof Error ? err.message : err);
    }

    await sleep(1000);
  }
}

async function main() {
  const client = new SuiClient({ url: RPC_URL });

  const oldKeypair = loadKeypair('LP_PRIVATE_KEY');
  const nbtcKeypair = loadKeypair('LP_PRIVATE_KEY_NBTC');
  const nethKeypair = loadKeypair('LP_PRIVATE_KEY_NETH');
  const nsolKeypair = loadKeypair('LP_PRIVATE_KEY_NSOL');

  const oldAddress = oldKeypair.getPublicKey().toSuiAddress();
  const nbtcAddr = nbtcKeypair.getPublicKey().toSuiAddress();
  const nethAddr = nethKeypair.getPublicKey().toSuiAddress();
  const nsolAddr = nsolKeypair.getPublicKey().toSuiAddress();

  console.log('=== Cancel & Sweep ===');
  console.log(`Old wallet: ${oldAddress}`);
  console.log(`New NBTC bot: ${nbtcAddr}`);
  console.log(`New NETH bot: ${nethAddr}`);
  console.log(`New NSOL bot: ${nsolAddr}`);

  // Check old wallet gas
  const gasBal = await client.getBalance({ owner: oldAddress });
  const gasNasun = Number(gasBal.totalBalance) / 1e9;
  console.log(`Old wallet gas: ${gasNasun.toFixed(4)} NASUN`);

  if (gasNasun < 0.5) {
    console.error('Old wallet has insufficient gas (< 0.5 NASUN). Fund it first.');
    process.exit(1);
  }

  // Step 1: Cancel all orders in all 3 markets
  console.log('\n=== Step 1: Cancel all orders ===');
  for (const market of ['NBTC', 'NETH', 'NSOL'] as const) {
    await cancelAllOrdersForMarket(client, oldKeypair, market);
    await sleep(2000);
  }

  // Step 2: Withdraw from BalanceManagers
  console.log('\n=== Step 2: Withdraw from BalanceManagers ===');
  for (const market of ['NBTC', 'NETH', 'NSOL'] as const) {
    await withdrawFromBalanceManager(client, oldKeypair, market);
    await sleep(2000);
  }

  // Step 3: Sweep all wallet tokens to new bots
  await sleep(3000);
  await sweepTokens(client, oldKeypair, nbtcAddr, nethAddr, nsolAddr);

  // Final balance report
  console.log('\n=== Final old wallet balances ===');
  for (const { type, label } of [
    { type: MARKETS.NBTC.baseType, label: 'NBTC' },
    { type: MARKETS.NBTC.quoteType, label: 'NUSDC' },
    { type: MARKETS.NETH.baseType, label: 'NETH' },
    { type: MARKETS.NSOL.baseType, label: 'NSOL' },
  ]) {
    const bal = await getTokenBalance(client, oldAddress, type);
    console.log(`  ${label}: ${bal}`);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('cancel-and-sweep failed:', err);
  process.exit(1);
});
