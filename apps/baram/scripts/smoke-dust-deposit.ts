/**
 * Smoke S12: dust deposit attack rejection.
 *
 * `settle_action<U>` is the deposit-back leg of the obligation rail. It
 * enforces that the type `U` being re-deposited into the escrow appears
 * in `cap.allowed_assets`. A malicious operator could try to:
 *
 *   Cmd 0: withdraw_for_action<NUSDC>(escrow, cap, amount) -> (Coin<NUSDC>, Obligation)
 *   Cmd 1: somehow produce a Coin<UNAUTHORIZED_T>
 *   Cmd 2: settle_action<UNAUTHORIZED_T>(escrow, cap, obligation, Coin<UNAUTHORIZED_T>)
 *
 * The contract aborts with E_ASSET_NOT_ALLOWED (572). This script
 * exercises the abort by minting a tiny coin of a non-allowed type
 * (e.g. NASUN gas tokens, which are never on a trader cap's allow list)
 * and feeding it into settle_action.
 *
 * Prereqs (env):
 *   AER_PACKAGE_ID, CAP_ID, ESCROW_ID
 *   COIN_NUSDC_TYPE                 — the allow-listed input
 *   UNAUTHORIZED_COIN_TYPE          — a TypeName NOT in cap.allowed_assets
 *                                     (e.g. 0x2::sui::SUI on devnet)
 *   ATTACKER_PRIVATE_KEY            — owner of an unauthorized coin
 *   UNAUTHORIZED_COIN_OBJECT_ID     — owned coin id of the unauthorized type
 *
 * Usage:
 *   npx tsx apps/baram/scripts/smoke-dust-deposit.ts
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const RPC_URL = process.env.SUI_RPC_URL ?? 'https://rpc.devnet.nasun.io';
const AER_PKG = required('AER_PACKAGE_ID');
const CAP_ID = required('CAP_ID');
const ESCROW_ID = required('ESCROW_ID');
const NUSDC = required('COIN_NUSDC_TYPE');
const UNAUTH = required('UNAUTHORIZED_COIN_TYPE');
const UNAUTH_OBJ = required('UNAUTHORIZED_COIN_OBJECT_ID');
const ATTACKER_KEY = required('ATTACKER_PRIVATE_KEY');
const PROBE_AMOUNT = 1n;

function required(key: string): string {
  const v = process.env[key];
  if (!v) {
    console.error(`[smoke-dust-deposit] FATAL: env "${key}" is unset.`);
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
  console.log(`[smoke-dust-deposit] RPC=${RPC_URL}`);
  console.log(`[smoke-dust-deposit] sender=${sender}`);
  console.log(`[smoke-dust-deposit] cap=${CAP_ID} escrow=${ESCROW_ID}`);
  console.log(`[smoke-dust-deposit] allowed input=${NUSDC} attempting deposit=${UNAUTH}`);

  const [capObj, escObj, unauthObj] = await Promise.all([
    client.getObject({ id: CAP_ID, options: { showOwner: true, showContent: true } }),
    client.getObject({ id: ESCROW_ID, options: { showOwner: true } }),
    client.getObject({ id: UNAUTH_OBJ, options: { showOwner: true, showContent: true } }),
  ]);

  function sharedVersion(
    o: Awaited<ReturnType<typeof client.getObject>>,
    name: string,
  ): string {
    const owner = o.data?.owner;
    if (typeof owner === 'object' && owner && 'Shared' in owner) {
      return (owner as { Shared: { initial_shared_version: string } }).Shared.initial_shared_version;
    }
    throw new Error(`${name} is not a shared object: ${JSON.stringify(owner)}`);
  }

  const capVer = sharedVersion(capObj, 'CAP_ID');
  const escVer = sharedVersion(escObj, 'ESCROW_ID');

  const capContent = capObj.data?.content;
  if (capContent?.dataType !== 'moveObject') throw new Error('CAP_ID not a Move object');
  const capVersion = BigInt(
    (capContent.fields as Record<string, unknown>).version as string,
  );

  if (!unauthObj.data) throw new Error('UNAUTHORIZED_COIN_OBJECT_ID does not exist');
  const unauthRef = {
    objectId: unauthObj.data.objectId,
    version: unauthObj.data.version,
    digest: unauthObj.data.digest,
  };

  const tx = new Transaction();
  const capArg = tx.sharedObjectRef({
    objectId: CAP_ID,
    initialSharedVersion: capVer,
    mutable: false,
  });
  const escArg = tx.sharedObjectRef({
    objectId: ESCROW_ID,
    initialSharedVersion: escVer,
    mutable: true,
  });

  // Cmd 0: withdraw the allow-listed input. We won't use the coin; the
  // goal is to produce the SpendObligation so we can try to settle it
  // with the wrong type.
  const [coinNusdc, obligation] = tx.moveCall({
    target: `${AER_PKG}::escrow::withdraw_for_action`,
    typeArguments: [NUSDC],
    arguments: [escArg, capArg, tx.pure.u64(PROBE_AMOUNT), tx.pure.u64(capVersion)],
  });

  // Cmd 1: transfer the legitimate Coin<NUSDC> back to sender so it
  // doesn't dangle. Coin<T> has store but not drop — without an
  // explicit move the PTB would abort with UnusedValueWithoutDrop
  // before reaching the settle_action allow-list check (572) we want
  // to surface.
  tx.transferObjects([coinNusdc], tx.pure.address(sender));

  // Cmd 2: feed the obligation to settle_action<UNAUTH> with an
  // unauthorized coin. settle_action's allow-list check on type U
  // aborts with E_ASSET_NOT_ALLOWED (572). The obligation hot-potato
  // is also left unconsumed, which produces a secondary abort, but
  // E_ASSET_NOT_ALLOWED fires first.
  tx.moveCall({
    target: `${AER_PKG}::escrow::settle_action`,
    typeArguments: [UNAUTH],
    arguments: [escArg, capArg, obligation, tx.object(unauthRef.objectId)],
  });

  const txBytes = await tx.build({ client });
  const dry = await client.dryRunTransactionBlock({ transactionBlock: txBytes });

  console.log('');
  console.log(`[smoke-dust-deposit] dryRun status: ${dry.effects.status.status}`);
  if (dry.effects.status.status === 'success') {
    console.error('[smoke-dust-deposit] FAIL: unauthorized deposit was NOT blocked!');
    process.exit(2);
  }
  const errMsg = dry.effects.status.error ?? '';
  console.log(`[smoke-dust-deposit] error: ${errMsg}`);
  if (!errMsg.includes('572') && !errMsg.includes('E_ASSET_NOT_ALLOWED')) {
    console.error(
      '[smoke-dust-deposit] FAIL: aborted but not with E_ASSET_NOT_ALLOWED (572).',
    );
    process.exit(2);
  }
  console.log('[smoke-dust-deposit] PASS: dust deposit rejected with E_ASSET_NOT_ALLOWED.');
}

main().catch((err) => {
  console.error('[smoke-dust-deposit] Unexpected error:', err);
  process.exit(1);
});
