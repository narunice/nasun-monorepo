/**
 * Deposit a Coin<T> into an AgentEscrow (Plan C C3-v2 §A.2).
 *
 * Required env:
 *   - AGENT_PRIVATE_KEY   trader wallet bech32 / hex
 *   - SUI_RPC_URL         (default rpc.devnet.nasun.io)
 *   - AER_PACKAGE_ID
 *   - ESCROW_ID           target shared AgentEscrow id
 *   - COIN_TYPE           fully-qualified Move TypeName (e.g. NUSDC_TYPE)
 *   - COIN_OBJECT_ID      owned Coin<T> object id to deposit (entire balance)
 *   - DEPOSIT_AMOUNT      (optional) raw amount; if set, splits this much
 *                         out of COIN_OBJECT_ID and deposits only the split.
 *
 * Usage:
 *   COIN_TYPE=$NUSDC_TYPE COIN_OBJECT_ID=0x... ESCROW_ID=$ESCROW_ID_A \
 *     DEPOSIT_AMOUNT=5000000 \
 *     npx tsx --env-file=../executor-nitro/.env fund-escrow.ts
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';

function required(k: string): string {
  const v = process.env[k];
  if (!v) { console.error(`fund-escrow: env ${k} unset`); process.exit(1); }
  return v;
}

function loadKeypair(raw: string): Ed25519Keypair {
  if (raw.startsWith('suiprivkey1')) {
    return Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(raw).secretKey);
  }
  const hex = raw.startsWith('0x') ? raw.slice(2) : raw;
  return Ed25519Keypair.fromSecretKey(Buffer.from(hex, 'hex'));
}

async function main(): Promise<void> {
  const RPC_URL = process.env.SUI_RPC_URL ?? 'https://rpc.devnet.nasun.io';
  const AER_PACKAGE_ID = required('AER_PACKAGE_ID');
  const ESCROW_ID = required('ESCROW_ID');
  const COIN_TYPE = required('COIN_TYPE');
  const COIN_OBJECT_ID = required('COIN_OBJECT_ID');
  const AGENT_PRIVATE_KEY = required('AGENT_PRIVATE_KEY');
  const DEPOSIT_AMOUNT = process.env.DEPOSIT_AMOUNT
    ? BigInt(process.env.DEPOSIT_AMOUNT)
    : null;

  const keypair = loadKeypair(AGENT_PRIVATE_KEY);
  const sender = keypair.getPublicKey().toSuiAddress();
  const client = new SuiClient({ url: RPC_URL });

  const escrowObj = await client.getObject({
    id: ESCROW_ID,
    options: { showOwner: true },
  });
  const ownerInfo = escrowObj.data?.owner;
  if (!ownerInfo || typeof ownerInfo !== 'object' || !('Shared' in ownerInfo)) {
    console.error(`fund-escrow: ESCROW_ID ${ESCROW_ID} is not Shared`);
    process.exit(2);
  }
  const initialSharedVersion = BigInt((ownerInfo as { Shared: { initial_shared_version: number | string } }).Shared.initial_shared_version);

  const tx = new Transaction();
  let depositCoin;
  if (DEPOSIT_AMOUNT !== null) {
    const [split] = tx.splitCoins(tx.object(COIN_OBJECT_ID), [tx.pure.u64(DEPOSIT_AMOUNT)]);
    depositCoin = split;
  } else {
    depositCoin = tx.object(COIN_OBJECT_ID);
  }

  tx.moveCall({
    target: `${AER_PACKAGE_ID}::escrow::deposit`,
    typeArguments: [COIN_TYPE],
    arguments: [
      tx.sharedObjectRef({
        objectId: ESCROW_ID,
        initialSharedVersion: initialSharedVersion.toString(),
        mutable: true,
      }),
      depositCoin,
    ],
  });

  tx.setSender(sender);
  tx.setGasBudget(30_000_000);

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });

  if (result.effects?.status?.status !== 'success') {
    console.error(`fund-escrow: TX FAILED: ${result.effects?.status?.error}`);
    process.exit(3);
  }
  console.log(`fund-escrow: deposited into ${ESCROW_ID}`);
  console.log(`  type=${COIN_TYPE}`);
  console.log(`  amount=${DEPOSIT_AMOUNT ?? 'full coin'}`);
  console.log(`  digest=${result.digest}`);
}

main().catch((err) => { console.error('fund-escrow:', err); process.exit(1); });
