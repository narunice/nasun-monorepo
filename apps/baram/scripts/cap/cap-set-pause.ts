/**
 * Set a Capability's pause_mode. Phase 1 contract accepts only {0, 2}
 * (active, wake_blocked); modes 1 and 3 abort with E_PAUSE_MODE_NOT_SUPPORTED
 * (Plan B D2). Pass --mode as the integer or the name (active|wake_blocked).
 *
 * Flags:
 *   --cap   Capability object id  [required]
 *   --mode  0|active | 2|wake_blocked  [required]
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

function parseMode(raw: string): number {
  if (raw === '0' || raw === 'active') return 0;
  if (raw === '2' || raw === 'wake_blocked') return 2;
  throw new Error(`Unsupported pause_mode "${raw}". Phase 1 honored: 0|active, 2|wake_blocked.`);
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const { aerPackageId } = loadCapIds();
  const wallet = loadWalletKeypair();
  const client = makeClient();

  const capId = flags.cap ?? process.env.CAPABILITY_ID;
  if (!capId) throw new Error('--cap is required (or CAPABILITY_ID env)');
  if (!flags.mode) throw new Error('--mode is required');
  const newMode = parseMode(flags.mode);

  console.log(`[setup] Wallet: ${wallet.toSuiAddress()}`);
  console.log(`[setup] Cap:    ${capId}`);
  console.log(`[setup] Mode:   ${newMode}`);

  const tx = new Transaction();
  tx.moveCall({
    target: `${aerPackageId}::capability::set_pause_mode`,
    arguments: [tx.object(capId), tx.pure.u8(newMode)],
  });

  await runTx(client, wallet, tx, 'set_pause_mode');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
