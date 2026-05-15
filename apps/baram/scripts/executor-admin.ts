/**
 * Executor admin CLI.
 *
 * AdminCap-gated operations on the executor registry. Loads the admin keypair
 * from the local sui keystore (matches register-executor.ts).
 *
 * Usage:
 *   pnpm tsx --env-file=apps/baram/executor-nitro/.env \
 *     apps/baram/scripts/executor-admin.ts deactivate <operator_address> "<reason>"
 *
 *   pnpm tsx --env-file=apps/baram/executor-nitro/.env \
 *     apps/baram/scripts/executor-admin.ts list
 *
 * Required env (from apps/baram/executor-nitro/.env):
 *   SUI_RPC_URL, EXECUTOR_PACKAGE_ID, EXECUTOR_REGISTRY_ID
 */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const RPC_URL = process.env.SUI_RPC_URL ?? 'https://rpc.devnet.nasun.io';
const ADMIN_ADDR = '0xe1c4c90bd18d22d5d8fbc9ab7994bdcf1ac717714c0f5375528c229d6dfb3d90';
const ADMIN_CAP_ID = '0x5e3dca938ff22ec2445a9de84029924b37a5bc5e2fc815c9547c547235d8c522';
const KEYSTORE_PATH = join(homedir(), '.sui', 'sui_config', 'sui.keystore');

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

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

function normalizeAddress(input: string): string {
  const hex = input.toLowerCase().replace(/^0x/, '');
  if (!/^[0-9a-f]{1,64}$/.test(hex)) {
    throw new Error(`Invalid address (expect 0x-prefixed 32-byte hex): ${input}`);
  }
  return `0x${hex.padStart(64, '0')}`;
}

async function cmdDeactivate(operator: string, reason: string) {
  const packageId = requireEnv('EXECUTOR_PACKAGE_ID');
  const registryId = requireEnv('EXECUTOR_REGISTRY_ID');
  const target = normalizeAddress(operator);
  if (!reason || reason.length === 0) {
    throw new Error('Reason must be a non-empty string');
  }

  const client = new SuiClient({ url: RPC_URL });
  const admin = loadAdminKeypair();
  console.log(`[deactivate] RPC:      ${RPC_URL}`);
  console.log(`[deactivate] Admin:    ${admin.toSuiAddress()}`);
  console.log(`[deactivate] Package:  ${packageId}`);
  console.log(`[deactivate] Registry: ${registryId}`);
  console.log(`[deactivate] Target:   ${target}`);
  console.log(`[deactivate] Reason:   ${reason}`);

  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::executor::deactivate_executor`,
    arguments: [
      tx.object(ADMIN_CAP_ID),
      tx.object(registryId),
      tx.pure.address(target),
      tx.pure.string(reason),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    signer: admin,
    transaction: tx,
    options: { showEffects: true, showEvents: true },
  });
  await client.waitForTransaction({ digest: result.digest });

  const status = result.effects?.status;
  if (status?.status !== 'success') {
    throw new Error(`Tx failed: ${JSON.stringify(status)}`);
  }
  console.log(`[deactivate] OK: ${result.digest}`);
  const events = result.events ?? [];
  for (const ev of events) {
    if (ev.type.endsWith('::ExecutorDeactivated')) {
      console.log(`[deactivate] Event: ${JSON.stringify(ev.parsedJson)}`);
    }
  }
}

async function cmdList() {
  const registryId = requireEnv('EXECUTOR_REGISTRY_ID');
  const client = new SuiClient({ url: RPC_URL });
  const obj = await client.getObject({
    id: registryId,
    options: { showContent: true },
  });
  console.log(JSON.stringify(obj.data?.content, null, 2));
}

function usage(): never {
  console.error('Usage:');
  console.error('  executor-admin.ts deactivate <operator_address> "<reason>"');
  console.error('  executor-admin.ts list');
  process.exit(2);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case 'deactivate': {
      const [operator, ...reasonParts] = rest;
      if (!operator || reasonParts.length === 0) usage();
      await cmdDeactivate(operator, reasonParts.join(' '));
      break;
    }
    case 'list':
      await cmdList();
      break;
    default:
      usage();
  }
}

main().catch((err) => {
  console.error('[error]', err);
  process.exit(1);
});
