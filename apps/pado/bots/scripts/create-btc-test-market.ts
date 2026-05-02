/**
 * Create BTC $100k Test Prediction Market (handoff §T5)
 *
 * One-shot helper that publishes the launch test market to devnet:
 *   "Will BTC/USDT price exceed $100,000 on Binance at 2026-05-19 00:00:00 UTC?"
 *
 * The Move contract enforces `creator != resolver`, so the AdminCap-holding
 * wallet (which signs create_market) must be a different address from the
 * keeper bot wallet that will later call resolve_market. Configure both
 * separately:
 *
 *   PREDICTION_ADMIN_KEY            ed25519 / suiprivkey of the AdminCap
 *                                   holder (this signs the tx).
 *   PREDICTION_RESOLVER_ADDRESS     0x-prefixed 32-byte address of the
 *                                   keeper bot wallet (must match the
 *                                   wallet derived from PREDICTION_RESOLVER_KEY
 *                                   used by prediction-keeper.ts).
 *   PREDICTION_PACKAGE_ID           Deployed package id.
 *   PREDICTION_ADMIN_CAP            AdminCap object id (default: devnet-ids).
 *   NASUN_RPC_URL                   RPC endpoint (default devnet).
 *
 * Usage:
 *   node --env-file=.env --import tsx scripts/create-btc-test-market.ts
 *
 * Prints the new market object id on success. Add it to
 * PREDICTION_KEEPER_MARKETS and PREDICTION_LP_MARKETS in .env, run
 * prediction-lp-bootstrap-mint.ts to seed inventory, then pm2 restart.
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
const CLOCK_ID = '0x6';
const DEFAULT_ADMIN_CAP = '0xbead7e77b4e0d131b6090f9e28c77e082de9b85b4d69dec5146a7bfade9c9533';

// Hardcoded for the BTC $100k launch test market (handoff §T5).
// Compressed timeline for E2E validation (~24h trade + 24h resolve window).
const QUESTION =
  'Will BTC/USDT price exceed $100,000 on Binance at 2026-05-02 04:00:00 UTC?';
const DESCRIPTION =
  'Binary market resolved against the Binance public spot ticker for BTCUSDT at the specified UTC reading time. YES if the reported price strictly exceeds $100,000; NO otherwise. A price of exactly $100,000 resolves NO per the tie-breaking rule.';
const CATEGORY = 'crypto';
const RESOLUTION_SOURCE = 'https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT';
const RESOLUTION_CRITERIA = `Source: https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT
Reading time: 2026-05-02 04:00:00 UTC
Comparison: price >= 100000
Tie-breaking: NO if exactly equal`;
const CLOSE_TIME_ISO = '2026-05-02T04:00:00Z';
const RESOLVE_DEADLINE_ISO = '2026-05-02T05:00:00Z';

const HEX_64 = /^0x[0-9a-fA-F]{64}$/;

function parseKeypair(keyInput: string): Ed25519Keypair {
  if (keyInput.startsWith('suiprivkey')) {
    const { secretKey } = decodeSuiPrivateKey(keyInput);
    return Ed25519Keypair.fromSecretKey(secretKey);
  }
  const cleanKey = keyInput.replace(/^0x/, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(cleanKey)) {
    throw new Error('Invalid private key (expected 64 hex chars or suiprivkey bech32)');
  }
  return Ed25519Keypair.fromSecretKey(Buffer.from(cleanKey, 'hex'));
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`${name} environment variable is required`);
    process.exit(1);
  }
  return v;
}

function requireHex64(name: string, value: string): string {
  if (!HEX_64.test(value)) {
    console.error(`${name} must be a 0x-prefixed 32-byte hex string (got: ${value})`);
    process.exit(1);
  }
  return value.toLowerCase();
}

async function main(): Promise<void> {
  const adminKeyInput = requireEnv('PREDICTION_ADMIN_KEY');
  const packageId = requireHex64('PREDICTION_PACKAGE_ID', requireEnv('PREDICTION_PACKAGE_ID'));
  const adminCap = requireHex64(
    'PREDICTION_ADMIN_CAP',
    process.env.PREDICTION_ADMIN_CAP || DEFAULT_ADMIN_CAP,
  );
  const resolverAddress = requireHex64(
    'PREDICTION_RESOLVER_ADDRESS',
    requireEnv('PREDICTION_RESOLVER_ADDRESS'),
  );

  const adminKp = parseKeypair(adminKeyInput);
  const adminAddress = adminKp.toSuiAddress().toLowerCase();

  if (adminAddress === resolverAddress) {
    console.error(
      'Admin wallet must differ from resolver wallet. Move contract enforces creator != resolver (ECreatorIsResolver).',
    );
    console.error(`  admin    = ${adminAddress}`);
    console.error(`  resolver = ${resolverAddress}`);
    process.exit(1);
  }

  const closeTime = new Date(CLOSE_TIME_ISO).getTime();
  const resolveDeadline = new Date(RESOLVE_DEADLINE_ISO).getTime();
  const now = Date.now();
  if (closeTime <= now) {
    console.error(`Hardcoded close time ${CLOSE_TIME_ISO} is in the past; update the script.`);
    process.exit(1);
  }
  if (resolveDeadline <= closeTime) {
    console.error('Resolve deadline must be after close time.');
    process.exit(1);
  }

  const client = new SuiClient({ url: RPC_URL });

  // Verify the admin wallet actually owns the AdminCap before sending the tx.
  const capObj = await client.getObject({ id: adminCap, options: { showOwner: true } });
  const capOwner = (capObj.data?.owner as { AddressOwner?: string } | undefined)?.AddressOwner;
  if (!capOwner || capOwner.toLowerCase() !== adminAddress) {
    console.error(
      `AdminCap ${adminCap} is owned by ${capOwner ?? 'unknown'}, not ${adminAddress}. Aborting.`,
    );
    process.exit(1);
  }

  console.log('Creating BTC $100k test prediction market');
  console.log(`  RPC:       ${RPC_URL}`);
  console.log(`  Package:   ${packageId}`);
  console.log(`  AdminCap:  ${adminCap}`);
  console.log(`  Creator:   ${adminAddress}`);
  console.log(`  Resolver:  ${resolverAddress}`);
  console.log(`  Close:     ${CLOSE_TIME_ISO}`);
  console.log(`  Deadline:  ${RESOLVE_DEADLINE_ISO}`);
  console.log('');

  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::prediction_market::create_market`,
    arguments: [
      tx.object(adminCap),
      tx.pure.string(QUESTION),
      tx.pure.string(DESCRIPTION),
      tx.pure.string(CATEGORY),
      tx.pure.string(RESOLUTION_SOURCE),
      tx.pure.string(RESOLUTION_CRITERIA),
      tx.pure.u64(BigInt(closeTime)),
      tx.pure.u64(BigInt(resolveDeadline)),
      tx.pure.address(resolverAddress),
      tx.object(CLOCK_ID),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    signer: adminKp,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });

  if (result.effects?.status?.status !== 'success') {
    console.error(`create_market TX failed: ${result.effects?.status?.error || 'unknown'}`);
    process.exit(1);
  }
  await client.waitForTransaction({ digest: result.digest });

  const MARKET_TYPE_SUFFIX = '::prediction_market::Market';
  const marketChange = result.objectChanges?.find(
    (c): c is { type: 'created'; objectType: string; objectId: string } =>
      c.type === 'created' &&
      typeof (c as { objectType?: string }).objectType === 'string' &&
      (c as { objectType: string }).objectType.endsWith(MARKET_TYPE_SUFFIX),
  );

  if (!marketChange) {
    console.error('Market object not found in objectChanges; check the digest manually.');
    console.error(`Digest: ${result.digest}`);
    process.exit(1);
  }

  console.log(`Market created`);
  console.log(`  Object id: ${marketChange.objectId}`);
  console.log(`  Digest:    ${result.digest}`);
  console.log('');
  console.log('Next steps:');
  console.log(`  1. Append "${marketChange.objectId}" to PREDICTION_KEEPER_MARKETS in .env`);
  console.log(`  2. Append "${marketChange.objectId}" to PREDICTION_LP_MARKETS in .env`);
  console.log('  3. Run scripts/prediction-lp-bootstrap-mint.ts to seed YES inventory');
  console.log('  4. pm2 startOrRestart ecosystem.config.cjs (uses fresh env)');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
