/**
 * Link a Capability to an AgentProfile.
 *
 * Flags:
 *   --profile  AgentProfile object id  [required]
 *   --cap      Capability object id    [required]
 *
 * Env:
 *   WALLET_PRIVATE_KEY  required (must own both the profile and the cap)
 *   SUI_RPC_URL         optional
 *
 * Run:
 *   WALLET_PRIVATE_KEY=... CAPABILITY_ID=0x... \
 *   npx tsx apps/baram/scripts/cap/cap-link.ts \
 *     --profile 0xPROFILE_ID --cap $CAPABILITY_ID
 */

import { Transaction } from '@mysten/sui/transactions';

import {
  loadCapIds,
  loadWalletKeypair,
  makeClient,
  parseFlags,
  runTx,
} from './_shared.js';

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const { agentPackageId } = loadCapIds();
  const wallet = loadWalletKeypair();
  const client = makeClient();

  const profileId = flags.profile;
  const capId = flags.cap ?? process.env.CAPABILITY_ID;
  if (!profileId) throw new Error('--profile is required');
  if (!capId) throw new Error('--cap is required (or set CAPABILITY_ID env)');

  console.log(`[setup] Wallet:  ${wallet.toSuiAddress()}`);
  console.log(`[setup] Profile: ${profileId}`);
  console.log(`[setup] Cap:     ${capId}`);

  const tx = new Transaction();
  tx.moveCall({
    target: `${agentPackageId}::agent_profile::link_capability`,
    arguments: [tx.object(profileId), tx.pure.id(capId)],
  });

  await runTx(client, wallet, tx, 'link_capability');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
