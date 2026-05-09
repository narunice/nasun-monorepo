/**
 * Register a new executor on Nasun devnet (TEE_NONE).
 *
 * 4 transactions:
 *   T1 (admin): split 1010 NASUN -> transfer to executor + register_executor
 *   T2 (executor): split 1000 NASUN -> create_stake
 *   T3 (admin): link_stake + update_stake_status(true)
 *
 * After success, prints EXECUTOR_STAKE_ID to paste into executor-nitro/.env.
 *
 * Run from monorepo root or anywhere:
 *   npx tsx apps/baram/scripts/register-executor.ts
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

// Env vars are injected by `tsx --env-file=apps/baram/executor-nitro/.env`

const RPC_URL = process.env.SUI_RPC_URL ?? 'https://rpc.devnet.nasun.io';
const ADMIN_ADDR = '0xe1c4c90bd18d22d5d8fbc9ab7994bdcf1ac717714c0f5375528c229d6dfb3d90';
const EXECUTOR_PACKAGE_ID = process.env.EXECUTOR_PACKAGE_ID!;
const EXECUTOR_REGISTRY_ID = process.env.EXECUTOR_REGISTRY_ID!;
const STAKING_CONFIG_ID = process.env.STAKING_CONFIG_ID!;
const STAKING_REGISTRY_ID = process.env.STAKING_REGISTRY_ID!;
const EXECUTOR_PRIVATE_KEY = process.env.EXECUTOR_PRIVATE_KEY!;
const KEYSTORE_PATH = join(homedir(), '.sui', 'sui_config', 'sui.keystore');
const CLOCK_ID = '0x6';
const ADMIN_CAP_ID = '0x5e3dca938ff22ec2445a9de84029924b37a5bc5e2fc815c9547c547235d8c522';
const NASUN_TRANSFER_AMOUNT = 1_010_000_000_000n; // 1,010 NASUN (1,000 stake + 10 gas buffer)
const STAKE_AMOUNT = 1_000_000_000_000n;          // 1,000 NASUN

// Executor metadata
const EXECUTOR_NAME = 'naru-baram-executor';
const EXECUTOR_ENDPOINT = 'http://localhost:3000';
const TEE_TYPE_NONE = 0;
const SUPPORTED_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'mixtral-8x7b-32768',
];

function loadAdminKeypair(): Ed25519Keypair {
  const lines = JSON.parse(readFileSync(KEYSTORE_PATH, 'utf-8')) as string[];
  for (const b64 of lines) {
    const buf = Buffer.from(b64, 'base64');
    if (buf[0] !== 0x00) continue; // 0x00 = Ed25519
    const kp = Ed25519Keypair.fromSecretKey(buf.subarray(1));
    if (kp.toSuiAddress() === ADMIN_ADDR) return kp;
  }
  throw new Error(`Admin keypair (${ADMIN_ADDR}) not found in ${KEYSTORE_PATH}`);
}

function loadExecutorKeypair(): Ed25519Keypair {
  const raw = EXECUTOR_PRIVATE_KEY;
  if (raw.startsWith('suiprivkey1')) return Ed25519Keypair.fromSecretKey(raw);
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(raw)) {
    return Ed25519Keypair.fromSecretKey(Buffer.from(raw.replace(/^0x/, ''), 'hex'));
  }
  return Ed25519Keypair.fromSecretKey(Buffer.from(raw, 'base64'));
}

async function main() {
  const client = new SuiClient({ url: RPC_URL });
  const admin = loadAdminKeypair();
  const executor = loadExecutorKeypair();
  const executorAddr = executor.toSuiAddress();

  console.log(`[setup] Admin:    ${admin.toSuiAddress()}`);
  console.log(`[setup] Executor: ${executorAddr}`);
  console.log(`[setup] RPC:      ${RPC_URL}`);

  // ===== T1: admin transfers 1010 NASUN + registers executor =====
  console.log('\n[T1] Admin: transfer 1010 NASUN + register_executor');
  const tx1 = new Transaction();
  const [coinForExecutor] = tx1.splitCoins(tx1.gas, [tx1.pure.u64(NASUN_TRANSFER_AMOUNT)]);
  tx1.transferObjects([coinForExecutor], tx1.pure.address(executorAddr));
  tx1.moveCall({
    target: `${EXECUTOR_PACKAGE_ID}::executor::register_executor`,
    arguments: [
      tx1.object(ADMIN_CAP_ID),
      tx1.object(EXECUTOR_REGISTRY_ID),
      tx1.pure.address(executorAddr),
      tx1.pure.string(EXECUTOR_NAME),
      tx1.pure.string(EXECUTOR_ENDPOINT),
      tx1.pure.u8(TEE_TYPE_NONE),
      tx1.pure.vector('u8', []),
      tx1.pure.vector('string', SUPPORTED_MODELS),
      tx1.object(CLOCK_ID),
    ],
  });
  const r1 = await client.signAndExecuteTransaction({
    signer: admin,
    transaction: tx1,
    options: { showEffects: true, showEvents: true },
  });
  await client.waitForTransaction({ digest: r1.digest });
  if (r1.effects?.status.status !== 'success') {
    throw new Error(`T1 failed: ${JSON.stringify(r1.effects?.status)}`);
  }
  console.log(`[T1] OK: ${r1.digest}`);

  // ===== T2: executor stakes 1000 NASUN =====
  console.log('\n[T2] Executor: create_stake(1000 NASUN)');
  const tx2 = new Transaction();
  const [stakeCoin] = tx2.splitCoins(tx2.gas, [tx2.pure.u64(STAKE_AMOUNT)]);
  tx2.moveCall({
    target: `${EXECUTOR_PACKAGE_ID}::executor_staking::create_stake`,
    arguments: [
      tx2.object(STAKING_CONFIG_ID),
      tx2.object(STAKING_REGISTRY_ID),
      stakeCoin,
      tx2.object(CLOCK_ID),
    ],
  });
  const r2 = await client.signAndExecuteTransaction({
    signer: executor,
    transaction: tx2,
    options: { showEffects: true, showEvents: true, showObjectChanges: true },
  });
  await client.waitForTransaction({ digest: r2.digest });
  if (r2.effects?.status.status !== 'success') {
    throw new Error(`T2 failed: ${JSON.stringify(r2.effects?.status)}`);
  }

  // Extract ExecutorStake object ID from objectChanges
  const stakeObj = r2.objectChanges?.find(
    (c) => c.type === 'created' && (c as { objectType?: string }).objectType?.includes('::executor_staking::ExecutorStake'),
  ) as { objectId: string } | undefined;
  if (!stakeObj) throw new Error('ExecutorStake object not found in T2 changes');
  const stakeId = stakeObj.objectId;
  console.log(`[T2] OK: ${r2.digest}`);
  console.log(`[T2] ExecutorStake: ${stakeId}`);

  // ===== T3: admin links stake + sets is_staked=true =====
  console.log('\n[T3] Admin: link_stake + update_stake_status(true)');
  const tx3 = new Transaction();
  tx3.moveCall({
    target: `${EXECUTOR_PACKAGE_ID}::executor::link_stake`,
    arguments: [
      tx3.object(ADMIN_CAP_ID),
      tx3.object(EXECUTOR_REGISTRY_ID),
      tx3.pure.address(executorAddr),
      tx3.pure.id(stakeId),
    ],
  });
  tx3.moveCall({
    target: `${EXECUTOR_PACKAGE_ID}::executor::update_stake_status`,
    arguments: [
      tx3.object(ADMIN_CAP_ID),
      tx3.object(EXECUTOR_REGISTRY_ID),
      tx3.pure.address(executorAddr),
      tx3.pure.bool(true),
    ],
  });
  const r3 = await client.signAndExecuteTransaction({
    signer: admin,
    transaction: tx3,
    options: { showEffects: true },
  });
  await client.waitForTransaction({ digest: r3.digest });
  if (r3.effects?.status.status !== 'success') {
    throw new Error(`T3 failed: ${JSON.stringify(r3.effects?.status)}`);
  }
  console.log(`[T3] OK: ${r3.digest}`);

  console.log('\n========================================');
  console.log('Executor registration complete.');
  console.log('========================================');
  console.log(`Executor address:  ${executorAddr}`);
  console.log(`Stake object ID:   ${stakeId}`);
  console.log('\nUpdate apps/baram/executor-nitro/.env:');
  console.log(`  EXECUTOR_STAKE_ID=${stakeId}`);
}

main().catch((err) => {
  console.error('[error]', err);
  process.exit(1);
});
