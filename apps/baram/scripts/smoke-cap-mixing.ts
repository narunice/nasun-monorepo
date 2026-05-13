/**
 * Smoke S9: cap-mixing attack rejection.
 *
 * The C3-v2 SpendObligation hot-potato pins `cap.id` so the obligation
 * minted by `withdraw_for_action` in Cmd 0 can ONLY be consumed by the
 * same cap in Cmd 3 (`settle_action`). A malicious operator could try
 * to:
 *
 *   Cmd 0: withdraw_for_action<NUSDC>(escrow_A, cap_A, amount) → (Coin, Obligation_A)
 *   Cmd 3: settle_action<NBTC>(escrow_B, cap_B, Obligation_A, primary_out)
 *
 * The Move contract rejects this with E_OBLIGATION_CAP_MISMATCH (576)
 * because `obligation.capability_id != cap_B.id`. This script builds
 * such a PTB on devnet against TWO separate cap+escrow pairs and
 * confirms the abort.
 *
 * Prereqs (env):
 *   CAP_A_ID, ESCROW_A_ID  — first cap+escrow (must be linked)
 *   CAP_B_ID, ESCROW_B_ID  — second cap+escrow (linked, owner = same wallet)
 *   ATTACKER_PRIVATE_KEY   — keypair with rights to sign for both caps
 *                            (owner of both) — devnet only
 *   AER_PACKAGE_ID, COIN_NUSDC_TYPE — for the withdraw type
 *
 * Usage:
 *   npx tsx apps/baram/scripts/smoke-cap-mixing.ts
 *
 * Note: this is a NEGATIVE test. We expect `dryRunTransactionBlock` to
 * surface an `effects.status.error` mentioning code 576. We do not
 * submit the tx (dry-run is sufficient and avoids burning gas).
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const RPC_URL = process.env.SUI_RPC_URL ?? 'https://rpc.devnet.nasun.io';
const AER_PKG = required('AER_PACKAGE_ID');
const CAP_A = required('CAP_A_ID');
const ESCROW_A = required('ESCROW_A_ID');
const CAP_B = required('CAP_B_ID');
const ESCROW_B = required('ESCROW_B_ID');
const NUSDC = required('COIN_NUSDC_TYPE');
const ATTACKER_KEY = required('ATTACKER_PRIVATE_KEY');
const PROBE_AMOUNT = 1n; // smallest unit so escrow balance is irrelevant

function required(key: string): string {
  const v = process.env[key];
  if (!v) {
    console.error(`[smoke-cap-mixing] FATAL: env "${key}" is unset.`);
    process.exit(1);
  }
  return v;
}

function loadKeypair(raw: string): Ed25519Keypair {
  if (raw.startsWith('suiprivkey1')) return Ed25519Keypair.fromSecretKey(raw);
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(raw)) {
    const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
    return Ed25519Keypair.fromSecretKey(Buffer.from(hex, 'hex'));
  }
  throw new Error('ATTACKER_PRIVATE_KEY: unsupported format');
}

async function main(): Promise<void> {
  const client = new SuiClient({ url: RPC_URL });
  const kp = loadKeypair(ATTACKER_KEY);
  const sender = kp.getPublicKey().toSuiAddress();
  console.log(`[smoke-cap-mixing] RPC=${RPC_URL}`);
  console.log(`[smoke-cap-mixing] sender=${sender}`);
  console.log(`[smoke-cap-mixing] cap_A=${CAP_A} escrow_A=${ESCROW_A}`);
  console.log(`[smoke-cap-mixing] cap_B=${CAP_B} escrow_B=${ESCROW_B}`);

  // Resolve initialSharedVersion for both shared objects.
  const [capAObj, capBObj, escAObj, escBObj] = await Promise.all([
    client.getObject({ id: CAP_A, options: { showOwner: true, showContent: true } }),
    client.getObject({ id: CAP_B, options: { showOwner: true, showContent: true } }),
    client.getObject({ id: ESCROW_A, options: { showOwner: true } }),
    client.getObject({ id: ESCROW_B, options: { showOwner: true } }),
  ]);

  function sharedVersion(o: Awaited<ReturnType<typeof client.getObject>>, name: string): string {
    const owner = o.data?.owner;
    if (typeof owner === 'object' && owner && 'Shared' in owner) {
      return (owner as { Shared: { initial_shared_version: string } }).Shared.initial_shared_version;
    }
    throw new Error(`${name} is not a shared object: ${JSON.stringify(owner)}`);
  }

  const capAVer = sharedVersion(capAObj, 'CAP_A');
  const capBVer = sharedVersion(capBObj, 'CAP_B');
  const escAVer = sharedVersion(escAObj, 'ESCROW_A');
  const escBVer = sharedVersion(escBObj, 'ESCROW_B');

  // Read cap_B.version for the withdraw arg (version-race guard).
  const capBContent = capBObj.data?.content;
  if (capBContent?.dataType !== 'moveObject') throw new Error('CAP_B not a Move object');
  const capBVersion = BigInt(
    (capBContent.fields as Record<string, unknown>).version as string,
  );

  // Build the cap-mixing PTB:
  //   Cmd 0: withdraw_for_action<NUSDC>(escrow_A, cap_A, amount=1, ver=cap_A.version) -> (Coin, Obligation_A)
  //   Cmd 1: settle_action<NUSDC>(escrow_B, cap_B, Obligation_A, Coin)
  //          ← MUST abort with E_OBLIGATION_CAP_MISMATCH (576)
  const capAContent = capAObj.data?.content;
  if (capAContent?.dataType !== 'moveObject') throw new Error('CAP_A not a Move object');
  const capAVersion = BigInt(
    (capAContent.fields as Record<string, unknown>).version as string,
  );

  const tx = new Transaction();
  const capAArg = tx.sharedObjectRef({
    objectId: CAP_A,
    initialSharedVersion: capAVer,
    mutable: false,
  });
  const capBArg = tx.sharedObjectRef({
    objectId: CAP_B,
    initialSharedVersion: capBVer,
    mutable: false,
  });
  const escAArg = tx.sharedObjectRef({
    objectId: ESCROW_A,
    initialSharedVersion: escAVer,
    mutable: true,
  });
  const escBArg = tx.sharedObjectRef({
    objectId: ESCROW_B,
    initialSharedVersion: escBVer,
    mutable: true,
  });

  const [coinFromA, obligationA] = tx.moveCall({
    target: `${AER_PKG}::escrow::withdraw_for_action`,
    typeArguments: [NUSDC],
    arguments: [escAArg, capAArg, tx.pure.u64(PROBE_AMOUNT), tx.pure.u64(capAVersion)],
  });

  // Cap-mixing: feed Obligation_A into settle_action on (escrow_B, cap_B).
  tx.moveCall({
    target: `${AER_PKG}::escrow::settle_action`,
    typeArguments: [NUSDC],
    arguments: [escBArg, capBArg, obligationA, coinFromA],
  });
  void capBVersion;

  const txBytes = await tx.build({ client });
  const dry = await client.dryRunTransactionBlock({ transactionBlock: txBytes });

  console.log('');
  console.log(`[smoke-cap-mixing] dryRun status: ${dry.effects.status.status}`);
  if (dry.effects.status.status === 'success') {
    console.error('[smoke-cap-mixing] FAIL: PTB succeeded — cap-mixing was NOT blocked!');
    process.exit(2);
  }
  const errMsg = dry.effects.status.error ?? '';
  console.log(`[smoke-cap-mixing] error: ${errMsg}`);
  if (!errMsg.includes('576') && !errMsg.includes('E_OBLIGATION_CAP_MISMATCH')) {
    console.error(
      '[smoke-cap-mixing] FAIL: aborted but not with E_OBLIGATION_CAP_MISMATCH (576).',
    );
    process.exit(2);
  }
  console.log('[smoke-cap-mixing] PASS: cap-mixing rejected with E_OBLIGATION_CAP_MISMATCH.');
}

main().catch((err) => {
  console.error('[smoke-cap-mixing] Unexpected error:', err);
  process.exit(1);
});
