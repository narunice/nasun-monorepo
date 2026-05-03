/**
 * Create UCL 2026 Final Prediction Market (sports launch P0)
 *
 * Binary market: "Will [Team A] win the UEFA Champions League 2026 Final?"
 *   Resolves YES if Team A wins (incl. extra time / penalty shootout).
 *   Resolves NO  if Team B wins.
 *
 * Run AFTER the semi-final 2nd leg (2026-05-05) determines the two finalists.
 *
 * Required env (in addition to base wallet/package vars):
 *   UCL_TEAM_A_NAME             Display name of YES team (e.g. "Paris Saint-Germain")
 *   UCL_TEAM_B_NAME             Display name of NO team  (e.g. "Bayern Munich")
 *   UCL_FOOTBALL_DATA_HOME_ID   football-data.org home team id for the final fixture
 *                               (the team whose ID === score.winner=HOME_TEAM is YES)
 *   UCL_FIXTURE_URL             Public URL on uefa.com for the final (resolution_source)
 *
 * Plus the standard prediction wallet env (same as create-btc-test-market.ts):
 *   PREDICTION_ADMIN_KEY        AdminCap holder private key (signs create_market)
 *   PREDICTION_RESOLVER_ADDRESS keeper wallet address (must match resolver_key pubkey)
 *   PREDICTION_PACKAGE_ID       Deployed package id
 *   PREDICTION_ADMIN_CAP        AdminCap object id (default: devnet-ids)
 *   NASUN_RPC_URL               RPC endpoint (default devnet)
 *
 * IMPORTANT: This market uses a sports `resolution_criteria` format that
 * `prediction-keeper.ts` (v0) does NOT understand. Do NOT add the resulting
 * market id to PREDICTION_KEEPER_MARKETS. Resolve manually via
 * `resolve_market` PTB after the final ends.
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
const CLOCK_ID = '0x6';
const DEFAULT_ADMIN_CAP = '0x63ddeb9b82df1b7ef373a421920623a07c9e64b0eea5fc6d7f9fcaa742b06fc8';

// Final: 2026-05-30 21:00 CEST = 19:00 UTC, Puskás Aréna Budapest.
// close_time = kickoff - 5min, resolve_deadline = kickoff + 24h.
const CLOSE_TIME_ISO = '2026-05-30T18:55:00Z';
const RESOLVE_DEADLINE_ISO = '2026-05-31T19:00:00Z';
const CATEGORY = 'sports';

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
  const teamA = requireEnv('UCL_TEAM_A_NAME');
  const teamB = requireEnv('UCL_TEAM_B_NAME');
  const homeTeamId = requireEnv('UCL_FOOTBALL_DATA_HOME_ID');
  const fixtureUrl = requireEnv('UCL_FIXTURE_URL');

  if (!/^\d+$/.test(homeTeamId)) {
    console.error(`UCL_FOOTBALL_DATA_HOME_ID must be a numeric team id (got: ${homeTeamId})`);
    process.exit(1);
  }

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
    console.error(`Close time ${CLOSE_TIME_ISO} is in the past; the script needs an updated date.`);
    process.exit(1);
  }
  if (resolveDeadline <= closeTime) {
    console.error('Resolve deadline must be after close time.');
    process.exit(1);
  }

  const QUESTION = `Will ${teamA} win the UEFA Champions League 2026 Final?`;
  const DESCRIPTION =
    `Binary market for the UEFA Champions League 2025/26 Final between ${teamA} and ${teamB}, ` +
    `played on 2026-05-30 at Puskás Aréna, Budapest. ` +
    `YES if ${teamA} wins the match (90 min, extra time, or penalty shootout). ` +
    `NO if ${teamB} wins. Draws are impossible because the final progresses to penalties. ` +
    `Resolved against the official UEFA result via football-data.org and uefa.com cross-check.`;
  const RESOLUTION_SOURCE = fixtureUrl;
  const RESOLUTION_CRITERIA =
    `Sport: Soccer\n` +
    `Provider: football-data\n` +
    `Endpoint: /v4/competitions/CL/matches?stage=FINAL&season=2025\n` +
    `Field: penalties.winner ?? score.winner\n` +
    `TargetTeamId: ${homeTeamId}\n` +
    `ResolveYesIf: HOME_TEAM\n` +
    `ResolveNoIf: AWAY_TEAM\n` +
    `PenaltyHandling: when score.duration === "PENALTY_SHOOTOUT" use penalties.winner\n` +
    `Confirmation: 1-source-v0 (manual cross-check with uefa.com required)`;

  const client = new SuiClient({ url: RPC_URL });

  const capObj = await client.getObject({ id: adminCap, options: { showOwner: true } });
  const capOwner = (capObj.data?.owner as { AddressOwner?: string } | undefined)?.AddressOwner;
  if (!capOwner || capOwner.toLowerCase() !== adminAddress) {
    console.error(
      `AdminCap ${adminCap} is owned by ${capOwner ?? 'unknown'}, not ${adminAddress}. Aborting.`,
    );
    process.exit(1);
  }

  console.log('Creating UCL 2026 Final prediction market');
  console.log(`  RPC:        ${RPC_URL}`);
  console.log(`  Package:    ${packageId}`);
  console.log(`  AdminCap:   ${adminCap}`);
  console.log(`  Creator:    ${adminAddress}`);
  console.log(`  Resolver:   ${resolverAddress}`);
  console.log(`  Team YES:   ${teamA} (home_id=${homeTeamId})`);
  console.log(`  Team NO:    ${teamB}`);
  console.log(`  Close:      ${CLOSE_TIME_ISO}`);
  console.log(`  Deadline:   ${RESOLVE_DEADLINE_ISO}`);
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

  console.log(`UCL Final market created`);
  console.log(`  Object id: ${marketChange.objectId}`);
  console.log(`  Digest:    ${result.digest}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Do NOT add this market id to PREDICTION_KEEPER_MARKETS — keeper v0 only');
  console.log('     understands the price-tick `Comparison: price <op> N` format.');
  console.log('  2. Do NOT add to PREDICTION_LP_MARKETS — single-event sports markets have');
  console.log('     zero turnover; LP inventory locks until resolution.');
  console.log('  3. After 2026-05-30 final ends, manually verify the winner via');
  console.log('     football-data.org + uefa.com and call resolve_market(outcome) with');
  console.log('     PREDICTION_RESOLVER_KEY wallet.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
