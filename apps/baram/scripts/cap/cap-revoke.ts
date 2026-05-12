/**
 * Revoke a Capability. Terminal: after this, every gated AER entry that
 * references the cap aborts with E_CAPABILITY_REVOKED. The user must create
 * a new Capability and re-link from AgentProfile to recover.
 *
 * Flags:
 *   --cap  Capability object id  [required]
 *
 * Env:
 *   WALLET_PRIVATE_KEY  required (must equal cap.owner)
 *   SUI_RPC_URL         optional
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
  const { aerPackageId } = loadCapIds();
  const wallet = loadWalletKeypair();
  const client = makeClient();

  const capId = flags.cap ?? process.env.CAPABILITY_ID;
  if (!capId) throw new Error('--cap is required (or CAPABILITY_ID env)');

  console.log(`[setup] Wallet: ${wallet.toSuiAddress()}`);
  console.log(`[setup] Cap:    ${capId}`);

  const tx = new Transaction();
  tx.moveCall({
    target: `${aerPackageId}::capability::revoke`,
    arguments: [tx.object(capId)],
  });

  await runTx(client, wallet, tx, 'revoke');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
