/**
 * Create a new Plan B Capability (shared object) and print its id.
 *
 * Defaults:
 *   --allowed-actions = trade.swap.v1,noop.v1,analysis.v1
 *     (HOLD path emits noop.v1; conversational AERs emit analysis.v1. If you
 *     drop either the gated entry aborts with E_ACTION_NOT_ALLOWED.)
 *
 * Flags:
 *   --allowed-actions   CSV of action_type strings   [default: see above]
 *   --allowed-assets    CSV of TypeName strings      [default: NUSDC,NBTC,NASUN]
 *   --allowed-targets   CSV of package addresses     [required]
 *   --max-notional      u64                          [default: 100_000_000]
 *   --max-daily-loss    u64                          [default: 1_000_000_000]
 *   --max-slippage-bps  u16                          [default: 300]
 *   --stop-loss-bps     u16                          [default: 500]
 *   --take-profit-bps   u16                          [default: 1_000]
 *
 * Env:
 *   WALLET_PRIVATE_KEY  required
 *   SUI_RPC_URL         optional (defaults to nasun devnet RPC)
 *
 * Run:
 *   WALLET_PRIVATE_KEY=... npx tsx apps/baram/scripts/cap/cap-create.ts \
 *     --allowed-targets 0xPADO_PKG_ID
 */

import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';

import {
  loadCapIds,
  loadWalletKeypair,
  makeClient,
  parseFlags,
  runTx,
} from './_shared.js';

const DEFAULT_ALLOWED_ACTIONS = 'trade.swap.v1,noop.v1,analysis.v1';
const DEFAULT_ALLOWED_ASSETS = [
  // Note: real TypeNames must come from --allowed-assets in practice; these
  // are intentionally bogus to force callers to pass --allowed-assets unless
  // they really want to test with empty constraints.
].join(',');
const DEFAULT_MAX_NOTIONAL = '100000000';
const DEFAULT_MAX_DAILY_LOSS = '1000000000';
const DEFAULT_MAX_SLIPPAGE_BPS = '300';
const DEFAULT_STOP_LOSS_BPS = '500';
const DEFAULT_TAKE_PROFIT_BPS = '1000';

function csvOrEmpty(s: string): string[] {
  if (!s) return [];
  return s.split(',').map((x) => x.trim()).filter((x) => x.length > 0);
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const { aerPackageId, capabilityRegistryId } = loadCapIds();
  const wallet = loadWalletKeypair();
  const client = makeClient();

  const allowedActions = csvOrEmpty(flags['allowed-actions'] ?? DEFAULT_ALLOWED_ACTIONS);
  const allowedAssetsRaw = csvOrEmpty(flags['allowed-assets'] ?? DEFAULT_ALLOWED_ASSETS);
  const allowedTargets = csvOrEmpty(flags['allowed-targets'] ?? '');
  const maxNotional = BigInt(flags['max-notional'] ?? DEFAULT_MAX_NOTIONAL);
  const maxDailyLoss = BigInt(flags['max-daily-loss'] ?? DEFAULT_MAX_DAILY_LOSS);
  const maxSlippageBps = Number(flags['max-slippage-bps'] ?? DEFAULT_MAX_SLIPPAGE_BPS);
  const stopLossBps = Number(flags['stop-loss-bps'] ?? DEFAULT_STOP_LOSS_BPS);
  const takeProfitBps = Number(flags['take-profit-bps'] ?? DEFAULT_TAKE_PROFIT_BPS);

  if (allowedTargets.length === 0) {
    throw new Error('--allowed-targets is required (CSV of package addresses)');
  }
  if (allowedAssetsRaw.length === 0) {
    throw new Error(
      '--allowed-assets is required (CSV of TypeName strings, e.g. ' +
        '0x...::nusdc::NUSDC,0x...::nbtc::NBTC)',
    );
  }

  console.log(`[setup] Wallet:   ${wallet.toSuiAddress()}`);
  console.log(`[setup] AER pkg:  ${aerPackageId}`);
  console.log(`[setup] Cap reg:  ${capabilityRegistryId}`);
  console.log(`[setup] Actions:  ${allowedActions.join(', ')}`);
  console.log(`[setup] Assets:   ${allowedAssetsRaw.join(', ')}`);
  console.log(`[setup] Targets:  ${allowedTargets.join(', ')}`);

  const tx = new Transaction();
  // TypeName is `{ name: String }`. BCS-encode each TypeName into a vector arg.
  const typeNameBcs = bcs.struct('TypeName', { name: bcs.string() });
  const allowedAssetsBytes = bcs
    .vector(typeNameBcs)
    .serialize(allowedAssetsRaw.map((name) => ({ name })))
    .toBytes();

  tx.moveCall({
    target: `${aerPackageId}::capability::new_capability`,
    arguments: [
      tx.object(capabilityRegistryId),
      tx.pure.vector('string', allowedActions),
      tx.pure(allowedAssetsBytes),
      tx.pure.vector('address', allowedTargets),
      tx.pure.u64(maxNotional),
      tx.pure.u64(maxDailyLoss),
      tx.pure.u16(maxSlippageBps),
      tx.pure.u16(stopLossBps),
      tx.pure.u16(takeProfitBps),
    ],
  });

  const r = await runTx(client, wallet, tx, 'new_capability');

  // Extract the newly-shared Capability id from objectChanges.
  const capObj = r.objectChanges?.find(
    (c) =>
      c.type === 'created' &&
      (c as { objectType?: string }).objectType?.includes('::capability::Capability'),
  ) as { objectId: string } | undefined;
  if (!capObj) {
    throw new Error('Capability object not found in objectChanges');
  }
  console.log(`\nCapability id: ${capObj.objectId}`);
  console.log('Export for downstream scripts:');
  console.log(`  export CAPABILITY_ID=${capObj.objectId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
