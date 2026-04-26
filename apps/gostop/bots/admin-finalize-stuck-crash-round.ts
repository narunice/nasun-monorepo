/**
 * Clear a stuck CrashRound that has no entries (no player bets).
 * Calls crash::admin_finalize_stuck_round, which destroys the round and
 * releases registry.current_round_id.
 *
 * Usage:
 *   ADMIN_PRIVKEY=suiprivkey... \
 *   ROUND_OBJECT_ID=0x... \
 *   node --import tsx admin-finalize-stuck-crash-round.ts
 *
 * Preconditions verified before submitting:
 *   - round.entries is empty (otherwise emergency_refund_batch is required first)
 *   - registry.current_round_id == ROUND_OBJECT_ID
 */
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

const { ADMIN_PRIVKEY, ROUND_OBJECT_ID } = process.env;
for (const [k, v] of Object.entries({ ADMIN_PRIVKEY, ROUND_OBJECT_ID })) {
  if (!v) {
    console.error(`Missing env: ${k}`);
    process.exit(1);
  }
}

const RPC = 'https://rpc.devnet.nasun.io';
const PACKAGE_ID = '0x546f9f13280cfc70ed961553fe0cc0b5a691e21918b0be53164b16a3a78b9966';
const REGISTRY = '0x3fa421e97c705f98c1cd29300bf4b90aab09a8f2a74190ab08f12d7a6a2f8cab';
const ADMIN_CAP = '0x456f17e5a4d2679d8b9d9deb6ef6e3aa5fae6d74be02b055a18c05918a44e3dc';

async function main() {
  const client = new SuiClient({ url: RPC });
  const { secretKey } = decodeSuiPrivateKey(ADMIN_PRIVKEY!);
  const kp = Ed25519Keypair.fromSecretKey(secretKey);
  const sender = kp.getPublicKey().toSuiAddress();
  console.log('Admin:', sender);

  const round = await client.getObject({ id: ROUND_OBJECT_ID!, options: { showContent: true } });
  const fields = (round.data?.content as { fields?: Record<string, unknown> })?.fields;
  if (!fields) throw new Error('Round object not found / no content');
  const entries = (fields.entries as unknown[]) ?? [];
  console.log('Round id:', fields.round_id, 'state:', fields.state, 'entries:', entries.length);
  if (entries.length > 0) {
    throw new Error(`Round has ${entries.length} entries. Run emergency_refund_batch first.`);
  }

  const reg = await client.getObject({ id: REGISTRY, options: { showContent: true } });
  const cri = (reg.data?.content as { fields?: { current_round_id?: unknown } })?.fields?.current_round_id;
  console.log('registry.current_round_id:', cri);

  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::crash::admin_finalize_stuck_round`,
    arguments: [
      tx.object(ADMIN_CAP),
      tx.object(REGISTRY),
      tx.object(ROUND_OBJECT_ID!),
    ],
  });
  tx.setGasBudget(50_000_000);

  const res = await client.signAndExecuteTransaction({
    transaction: tx,
    signer: kp,
    options: { showEffects: true },
  });
  console.log('Status:', res.effects?.status);
  console.log('Digest:', res.digest);
  if (res.effects?.status.status !== 'success') process.exit(1);

  await client.waitForTransaction({ digest: res.digest });
  const reg2 = await client.getObject({ id: REGISTRY, options: { showContent: true } });
  const cri2 = (reg2.data?.content as { fields?: { current_round_id?: unknown } })?.fields?.current_round_id;
  console.log('registry.current_round_id after:', cri2);
}

main().catch((e) => { console.error(e); process.exit(1); });
