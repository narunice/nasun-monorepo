/**
 * One-shot helper to call capability::replace_allowed_actions on an existing
 * Capability. Used during C3-v2 smoke runs to expand cap_A's allowed_actions
 * to include 'analysis.v1' (HOLD cognition) on top of 'trade.swap.v1' so
 * S1 (cognition HOLD AER) can land on Pair A without re-minting.
 *
 * Env:
 *   AGENT_PRIVATE_KEY    cap.owner bech32 (trader wallet)
 *   AER_PACKAGE_ID       baram_aer package
 *   CAPABILITY_ID        target Capability id
 *   ALLOWED_ACTIONS_CSV  comma-separated, default: analysis.v1,trade.swap.v1
 *   SUI_RPC_URL          devnet RPC (default: https://rpc.devnet.nasun.io)
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';

function required(key: string): string {
  const v = process.env[key];
  if (!v) {
    console.error(`[update-cap-actions] FATAL: env "${key}" is unset.`);
    process.exit(1);
  }
  return v;
}

async function main(): Promise<void> {
  const rpc = process.env.SUI_RPC_URL ?? 'https://rpc.devnet.nasun.io';
  const pkg = required('AER_PACKAGE_ID');
  const capId = required('CAPABILITY_ID');
  const actionsCsv = process.env.ALLOWED_ACTIONS_CSV ?? 'analysis.v1,trade.swap.v1';
  const allowed = actionsCsv.split(',').map((s) => s.trim()).filter(Boolean);

  const sk = required('AGENT_PRIVATE_KEY');
  const { schema, secretKey } = decodeSuiPrivateKey(sk);
  if (schema !== 'ED25519') throw new Error(`unsupported key schema: ${schema}`);
  const kp = Ed25519Keypair.fromSecretKey(secretKey);
  const sender = kp.toSuiAddress();

  console.log(`[update-cap-actions] sender=${sender}`);
  console.log(`[update-cap-actions] cap=${capId}`);
  console.log(`[update-cap-actions] new allowed_actions=${JSON.stringify(allowed)}`);

  const client = new SuiClient({ url: rpc });

  // Fetch cap to discover initialSharedVersion if it's a shared object.
  const obj = await client.getObject({ id: capId, options: { showOwner: true } });
  const owner = obj.data?.owner;
  let capArg: ReturnType<Transaction['object']> | ReturnType<Transaction['sharedObjectRef']>;
  const tx = new Transaction();
  tx.setSender(sender);
  tx.setGasBudget(50_000_000);

  if (typeof owner === 'object' && owner !== null && 'Shared' in owner) {
    const isv = String((owner as { Shared: { initial_shared_version: number } }).Shared.initial_shared_version);
    capArg = tx.sharedObjectRef({
      objectId: capId,
      initialSharedVersion: isv,
      mutable: true,
    });
  } else {
    capArg = tx.object(capId);
  }

  tx.moveCall({
    target: `${pkg}::capability::replace_allowed_actions`,
    arguments: [capArg, tx.pure.vector('string', allowed)],
  });

  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer: kp,
    options: { showEffects: true, showEvents: true },
  });

  if (result.effects?.status?.status !== 'success') {
    console.error('[update-cap-actions] FAILED:', JSON.stringify(result.effects?.status));
    process.exit(2);
  }
  console.log(`[update-cap-actions] tx=${result.digest}`);
  console.log(`[update-cap-actions] gas_used=${JSON.stringify(result.effects.gasUsed)}`);
}

main().catch((err) => {
  console.error('[update-cap-actions] error:', err);
  process.exit(1);
});
