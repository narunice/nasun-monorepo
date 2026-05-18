/**
 * Phase 0.2 verification: cancel_expired_market is permissionless.
 *
 *   1. Admin creates a dummy market with `resolve_deadline = now + 5 min`
 *      (close_time + 1 min, throw-away resolution_criteria).
 *   2. Wait ~11 min (5 min deadline + 5 min EXPIRE_GRACE + 1 min buffer).
 *   3. Keeper key (no AdminCap) submits `cancel_expired_market` PTB.
 *   4. Re-fetch market; status must be STATUS_CANCELLED (3).
 *
 * Required env:
 *   PREDICTION_ADMIN_KEY        creates the dummy market
 *   PREDICTION_RESOLVER_KEY     submits the cancel (must NOT hold AdminCap)
 *   PREDICTION_PACKAGE_ID       deployed package id
 *   PREDICTION_ADMIN_CAP        optional, defaulted
 *   NASUN_RPC_URL               default https://rpc.devnet.nasun.io
 *
 * Usage:
 *   node --import tsx apps/pado/bots/scripts/verify-cancel-expired-market.ts
 *
 * The script logs progress every 30 s during the wait; expected runtime ~11 min.
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
if (RPC_URL.includes('mainnet')) {
  console.error('Refusing to run against mainnet.');
  process.exit(1);
}

const CLOCK_ID = '0x6';
const DEFAULT_ADMIN_CAP = '0x63ddeb9b82df1b7ef373a421920623a07c9e64b0eea5fc6d7f9fcaa742b06fc8';
const HEX_64 = /^0x[0-9a-fA-F]{64}$/;
const STATUS_OPEN = 0;
const STATUS_CANCELLED = 3;

// Timing: deadline = +5min, then EXPIRE_GRACE 5min, +1min buffer.
const DEADLINE_OFFSET_MS = 5 * 60_000;
const WAIT_MS = 11 * 60_000;
const POLL_INTERVAL_MS = 30_000;

function parseKeypair(keyInput: string): Ed25519Keypair {
  if (keyInput.startsWith('suiprivkey')) {
    const { secretKey } = decodeSuiPrivateKey(keyInput);
    return Ed25519Keypair.fromSecretKey(secretKey);
  }
  const cleanKey = keyInput.replace(/^0x/, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(cleanKey)) throw new Error('Invalid privkey');
  return Ed25519Keypair.fromSecretKey(Buffer.from(cleanKey, 'hex'));
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`${name} is required`); process.exit(1); }
  return v;
}

function requireHex64(name: string, value: string): string {
  if (!HEX_64.test(value)) {
    console.error(`${name} must be 0x-prefixed 32-byte hex`);
    process.exit(1);
  }
  return value.toLowerCase();
}

function ts(): string {
  return new Date().toISOString().slice(11, 19);
}

async function createDummyMarket(
  client: SuiClient, adminKp: Ed25519Keypair, packageId: string, adminCap: string,
  resolverAddress: string,
): Promise<string> {
  const now = Date.now();
  const closeTime = now + 60_000;
  const resolveDeadline = now + DEADLINE_OFFSET_MS;

  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::prediction_market::create_market`,
    arguments: [
      tx.object(adminCap),
      tx.pure.string('[VERIFY] cancel_expired_market smoke test'),
      tx.pure.string('Throw-away market used to verify the permissionless cancel_expired_market PTB. Created by scripts/verify-cancel-expired-market.ts.'),
      tx.pure.string('test'),
      tx.pure.string('https://github.com/anthropics/claude-code'),
      tx.pure.string('Kind: test\nThrowAway: true\n'),
      tx.pure.u64(BigInt(closeTime)),
      tx.pure.u64(BigInt(resolveDeadline)),
      tx.pure.address(resolverAddress),
      tx.object(CLOCK_ID),
    ],
  });
  const res = await client.signAndExecuteTransaction({
    signer: adminKp, transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });
  if (res.effects?.status?.status !== 'success') {
    throw new Error(`create_market failed: ${res.effects?.status?.error ?? 'unknown'}`);
  }
  await client.waitForTransaction({ digest: res.digest });
  const created = res.objectChanges?.find(
    (c): c is { type: 'created'; objectType: string; objectId: string } =>
      c.type === 'created' &&
      typeof (c as { objectType?: string }).objectType === 'string' &&
      (c as { objectType: string }).objectType.endsWith('::prediction_market::Market'),
  );
  if (!created) throw new Error('Market not in objectChanges');
  console.log(`[${ts()}] created dummy market ${created.objectId}`);
  console.log(`            close_time         ${new Date(closeTime).toISOString()}`);
  console.log(`            resolve_deadline   ${new Date(resolveDeadline).toISOString()} (+5min)`);
  return created.objectId;
}

async function fetchStatus(client: SuiClient, marketId: string): Promise<number> {
  const obj = await client.getObject({ id: marketId, options: { showContent: true } });
  const content = obj.data?.content;
  if (!content || content.dataType !== 'moveObject') throw new Error('not a moveObject');
  const fields = (content as { fields: Record<string, unknown> }).fields;
  const status = Number(fields.status);
  return status;
}

async function cancelExpired(
  client: SuiClient, keeperKp: Ed25519Keypair, packageId: string, marketId: string,
): Promise<string> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::prediction_market::cancel_expired_market`,
    arguments: [tx.object(marketId), tx.object(CLOCK_ID)],
  });
  const res = await client.signAndExecuteTransaction({
    signer: keeperKp, transaction: tx,
    options: { showEffects: true },
  });
  if (res.effects?.status?.status !== 'success') {
    throw new Error(`cancel_expired_market failed: ${res.effects?.status?.error ?? 'unknown'}`);
  }
  await client.waitForTransaction({ digest: res.digest });
  return res.digest;
}

async function main(): Promise<void> {
  const adminKp = parseKeypair(requireEnv('PREDICTION_ADMIN_KEY'));
  const adminAddress = adminKp.toSuiAddress().toLowerCase();
  const keeperKp = parseKeypair(requireEnv('PREDICTION_RESOLVER_KEY'));
  const keeperAddress = keeperKp.toSuiAddress().toLowerCase();
  if (adminAddress === keeperAddress) {
    console.error('Admin and keeper must differ for this test (ECreatorIsResolver).');
    process.exit(1);
  }

  const packageId = requireHex64('PREDICTION_PACKAGE_ID', requireEnv('PREDICTION_PACKAGE_ID'));
  const adminCap = requireHex64('PREDICTION_ADMIN_CAP', process.env.PREDICTION_ADMIN_CAP || DEFAULT_ADMIN_CAP);

  console.log(`[${ts()}] verify cancel_expired_market`);
  console.log(`            admin    ${adminAddress}`);
  console.log(`            keeper   ${keeperAddress}`);
  console.log(`            package  ${packageId}`);
  console.log(`            cap      ${adminCap}`);

  const client = new SuiClient({ url: RPC_URL });

  const capObj = await client.getObject({ id: adminCap, options: { showOwner: true } });
  const capOwner = (capObj.data?.owner as { AddressOwner?: string } | undefined)?.AddressOwner;
  if (capOwner?.toLowerCase() !== adminAddress) {
    console.error(`AdminCap not owned by admin (${capOwner})`);
    process.exit(1);
  }

  const marketId = await createDummyMarket(client, adminKp, packageId, adminCap, keeperAddress);

  const status0 = await fetchStatus(client, marketId);
  console.log(`[${ts()}] initial status=${status0} (expected OPEN=${STATUS_OPEN})`);
  if (status0 !== STATUS_OPEN) {
    console.error('Initial status not OPEN; aborting.');
    process.exit(1);
  }

  const startWait = Date.now();
  const endWait = startWait + WAIT_MS;
  console.log(`[${ts()}] waiting ${WAIT_MS / 60_000} min for deadline + EXPIRE_GRACE...`);
  while (Date.now() < endWait) {
    const remaining = Math.ceil((endWait - Date.now()) / 1000);
    console.log(`[${ts()}] waiting... ${remaining}s remaining`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  console.log(`[${ts()}] calling cancel_expired_market with keeper key (no AdminCap)...`);
  const digest = await cancelExpired(client, keeperKp, packageId, marketId);
  console.log(`[${ts()}] cancel digest=${digest}`);

  const status1 = await fetchStatus(client, marketId);
  console.log(`[${ts()}] post-cancel status=${status1} (expected CANCELLED=${STATUS_CANCELLED})`);
  if (status1 === STATUS_CANCELLED) {
    console.log(`[${ts()}] VERIFICATION PASSED.`);
    console.log(`  market: ${marketId}`);
    console.log(`  digest: ${digest}`);
  } else {
    console.error(`[${ts()}] VERIFICATION FAILED. Status ${status1} != ${STATUS_CANCELLED}`);
    process.exit(1);
  }
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
