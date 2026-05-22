// Deactivate every AgentProfile owned by OWNER except those named "Santa".
// Usage:
//   OWNER=0x683a... \
//   AGENT_PACKAGE_ID=0x6e539... \
//   AGENT_ORIGINAL_PACKAGE_ID=0x15b5c... \
//   AGENT_PROFILE_REGISTRY=0x6ae14... \
//   PRIVATE_KEY=suiprivkey1... (bech32) \
//   pnpm tsx scripts/deactivate-non-santa-agents.ts [--execute]
//
// Without --execute the script runs as dry-run (no signing, just lists actions).

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

const RPC_URL = process.env.RPC_URL ?? 'https://rpc.devnet.nasun.io';
const OWNER = need('OWNER');
const PKG = need('AGENT_PACKAGE_ID');
const ORIG_PKG = process.env.AGENT_ORIGINAL_PACKAGE_ID ?? PKG;
const REGISTRY = need('AGENT_PROFILE_REGISTRY');
const KEEP_NAME = (process.env.KEEP_NAME ?? 'Santa').toLowerCase();
const EXECUTE = process.argv.includes('--execute');

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function main() {
  const client = new SuiClient({ url: RPC_URL });
  const structType = `${ORIG_PKG}::agent_profile::AgentProfile`;

  const res = await client.getOwnedObjects({
    owner: OWNER,
    filter: { StructType: structType },
    options: { showContent: true, showType: true },
    limit: 50,
  });

  const profiles = res.data.map((o) => {
    const f = (o.data?.content as any)?.fields ?? {};
    return {
      id: o.data!.objectId,
      name: String(f.name ?? ''),
      isActive: Boolean(f.is_active),
    };
  });

  console.log(`Found ${profiles.length} AgentProfile(s) owned by ${OWNER}`);
  for (const p of profiles) {
    console.log(`  ${p.id}  name="${p.name}"  active=${p.isActive}`);
  }

  const targets = profiles.filter(
    (p) => p.isActive && p.name.toLowerCase() !== KEEP_NAME,
  );
  console.log(
    `\nTargets to deactivate (active, name != "${KEEP_NAME}"): ${targets.length}`,
  );
  for (const t of targets) console.log(`  - ${t.id} "${t.name}"`);

  if (targets.length === 0) {
    console.log('Nothing to do.');
    return;
  }
  if (!EXECUTE) {
    console.log('\nDry-run. Re-run with --execute and PRIVATE_KEY set to submit.');
    return;
  }

  const pkHex = need('PRIVATE_KEY');
  const { schema, secretKey } = decodeSuiPrivateKey(pkHex);
  if (schema !== 'ED25519') throw new Error(`Unsupported schema: ${schema}`);
  const kp = Ed25519Keypair.fromSecretKey(secretKey);
  const signerAddr = kp.toSuiAddress();
  if (signerAddr.toLowerCase() !== OWNER.toLowerCase()) {
    throw new Error(
      `Signer ${signerAddr} does not match OWNER ${OWNER}. Aborting.`,
    );
  }

  const tx = new Transaction();
  for (const t of targets) {
    tx.moveCall({
      target: `${PKG}::agent_profile::deactivate_agent`,
      arguments: [tx.object(REGISTRY), tx.object(t.id)],
    });
  }

  const result = await client.signAndExecuteTransaction({
    signer: kp,
    transaction: tx,
    options: { showEffects: true, showEvents: false },
  });
  console.log(`\nTx digest: ${result.digest}`);
  console.log(`Status: ${result.effects?.status?.status}`);
  if (result.effects?.status?.error) {
    console.log(`Error: ${result.effects.status.error}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
