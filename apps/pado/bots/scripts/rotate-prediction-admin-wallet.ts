/**
 * One-shot: generate a fresh admin wallet and migrate AdminCap + gas to it.
 *
 * Background:
 *   PREDICTION_ADMIN_KEY currently equals PREDICTION_ARB_PRIVATE_KEY (both
 *   resolve to 0xe1c4c90b...). The arb bot fires 5–10 tx/min from that
 *   wallet, so any other tx the wallet tries to issue from a separate process
 *   (admin scripts, batch creators) loses to a sequencing race on the wallet's
 *   gas coin: the SDK fetches a coin version, arb ships another tx in the gap,
 *   the validator rejects the script's tx as non-retriable stale-version, and
 *   the script's in-process retry has the same fundamental problem.
 *
 *   Cleanest fix is a separate admin wallet. Arb keeps its current key; admin
 *   moves to a fresh keypair whose only activity is occasional create/cancel
 *   work, so coin-version churn there is zero.
 *
 * What this does:
 *   1. Generate a fresh Ed25519 keypair.
 *   2. PTB from the old admin: transferObjects([AdminCap], newAddr) +
 *      splitCoins(tx.gas, [fundAmount]) + transferObjects(splitGas, newAddr).
 *   3. Write the new bech32 private key to /tmp/new-prediction-admin-key.txt
 *      (mode 0600). Operator pastes it into .env manually.
 *
 * Required env:
 *   PREDICTION_ADMIN_KEY    current admin wallet (owns AdminCap)
 *   PREDICTION_PACKAGE_ID   used only to surface AdminCap module guard logs
 *   PREDICTION_ADMIN_CAP    optional, defaulted
 *
 * Usage:
 *   pm2 stop prediction-arb
 *   node --env-file=.env --import tsx scripts/rotate-prediction-admin-wallet.ts
 *   # paste /tmp/new-prediction-admin-key.txt into .env PREDICTION_ADMIN_KEY=
 *   pm2 start prediction-arb
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import { writeFileSync } from 'node:fs';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
const DEFAULT_ADMIN_CAP = '0xd90ae72defe2c4e2b149611c72885a1ebf679ae7bda778b35644f0e3946aedf8';
const HEX_64 = /^0x[0-9a-fA-F]{64}$/;

// Fund the new admin with 100 NASUN (100 * 1e9 SOE). Enough for many tens of
// create/cancel calls; refillable manually anytime.
const FUND_SOE = 100_000_000_000n;

const KEY_OUT_PATH = '/tmp/new-prediction-admin-key.txt';

function parseKeypair(s: string): Ed25519Keypair {
  if (s.startsWith('suiprivkey')) {
    const { secretKey } = decodeSuiPrivateKey(s);
    return Ed25519Keypair.fromSecretKey(secretKey);
  }
  const clean = s.replace(/^0x/, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) throw new Error('bad privkey');
  return Ed25519Keypair.fromSecretKey(Buffer.from(clean, 'hex'));
}

function requireEnv(n: string): string {
  const v = process.env[n];
  if (!v) { console.error(`${n} required`); process.exit(1); }
  return v;
}

function requireHex64(n: string, v: string): string {
  if (!HEX_64.test(v)) { console.error(`${n} must be 0x-32-byte hex`); process.exit(1); }
  return v.toLowerCase();
}

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry-run');
  const oldAdmin = parseKeypair(requireEnv('PREDICTION_ADMIN_KEY'));
  const oldAddr = oldAdmin.toSuiAddress();
  const cap = requireHex64('PREDICTION_ADMIN_CAP', process.env.PREDICTION_ADMIN_CAP || DEFAULT_ADMIN_CAP);
  const client = new SuiClient({ url: RPC_URL });

  // Sanity: AdminCap really owned by the old admin.
  const capObj = await client.getObject({ id: cap, options: { showOwner: true } });
  const capOwner = (capObj.data?.owner as { AddressOwner?: string } | undefined)?.AddressOwner;
  if (capOwner?.toLowerCase() !== oldAddr.toLowerCase()) {
    console.error(`AdminCap owner mismatch — expected ${oldAddr}, found ${capOwner}`);
    process.exit(1);
  }

  // Generate fresh keypair locally. Private key never leaves the box — written
  // to a 0600-perm tmp file and printed only as an address.
  const newAdmin = Ed25519Keypair.generate();
  const newAddr = newAdmin.toSuiAddress();
  const bech32 = newAdmin.getSecretKey();

  console.log('Old admin:', oldAddr);
  console.log('New admin:', newAddr);
  console.log(`Fund amount: ${FUND_SOE} SOE (${Number(FUND_SOE) / 1e9} NASUN)`);

  if (dry) {
    console.log('[DRY RUN] not writing key, not submitting tx');
    return;
  }

  writeFileSync(KEY_OUT_PATH, bech32 + '\n', { mode: 0o600 });
  console.log(`Private key written to ${KEY_OUT_PATH} (mode 0600).`);
  console.log('Paste into .env as PREDICTION_ADMIN_KEY= after this script returns.');

  const tx = new Transaction();
  tx.transferObjects([tx.object(cap)], tx.pure.address(newAddr));
  const [gas] = tx.splitCoins(tx.gas, [tx.pure.u64(FUND_SOE)]);
  tx.transferObjects([gas], tx.pure.address(newAddr));

  const r = await client.signAndExecuteTransaction({
    signer: oldAdmin,
    transaction: tx,
    options: { showEffects: true },
  });
  if (r.effects?.status?.status !== 'success') {
    console.error(`TX failed: ${r.effects?.status?.error ?? '?'}`);
    process.exit(1);
  }
  await client.waitForTransaction({ digest: r.digest });
  console.log('Migration TX:', r.digest);

  // Post-flight: AdminCap and a fresh coin must now belong to newAddr.
  const post = await client.getObject({ id: cap, options: { showOwner: true } });
  const postOwner = (post.data?.owner as { AddressOwner?: string } | undefined)?.AddressOwner;
  if (postOwner?.toLowerCase() !== newAddr.toLowerCase()) {
    console.error(`AdminCap owner did not transfer — still ${postOwner}`);
    process.exit(1);
  }
  console.log('AdminCap ownership confirmed:', postOwner);
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
