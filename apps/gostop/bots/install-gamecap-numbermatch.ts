/**
 * Issue a NumberMatch GameCap from BankrollPool admin, then install it
 * into NumberMatchRegistry.
 *
 * Usage:
 *   ADMIN_PRIVKEY=suiprivkey... \
 *   NM_PKG=0x... \
 *   NM_ADMIN_CAP=0x... \
 *   NM_REGISTRY=0x... \
 *   node --import tsx install-gamecap-numbermatch.ts
 */
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

const { ADMIN_PRIVKEY, NM_PKG, NM_ADMIN_CAP, NM_REGISTRY } = process.env;

for (const [k, v] of Object.entries({
  ADMIN_PRIVKEY,
  NM_PKG,
  NM_ADMIN_CAP,
  NM_REGISTRY,
})) {
  if (!v) {
    console.error(`Missing env: ${k}`);
    process.exit(1);
  }
}

const RPC = 'https://rpc.devnet.nasun.io';

const BANKROLL_PKG = '0x561c1cf6d984d0be0bc7c77b4387009120b0d73617af07cd6acc605b3ff681fd';
const BANKROLL_ADMIN_CAP = '0x6c9c504ac631b967ff576e39f643153f3a503a16d4360c1820575d15802b41ba';

const GAME_ID = 3; // must match GAME_ID_SELF in numbermatch.move
const GAME_NAME = Array.from(new TextEncoder().encode('numbermatch'));
// MAX_PAYOUT in contract = 18 NUSDC. Small headroom on top in case of
// future tweaks.
const MAX_SINGLE_PAYOUT = 20n * 1_000_000n; // 20 NUSDC

async function main() {
  const { secretKey } = decodeSuiPrivateKey(ADMIN_PRIVKEY!);
  const kp = Ed25519Keypair.fromSecretKey(secretKey);
  const addr = kp.toSuiAddress();
  const client = new SuiClient({ url: RPC });

  console.log('admin:', addr);
  console.log('numbermatch package:', NM_PKG);
  console.log('numbermatch registry:', NM_REGISTRY);

  const issueTx = new Transaction();
  issueTx.moveCall({
    target: `${BANKROLL_PKG}::bankroll_pool::issue_game_cap`,
    arguments: [
      issueTx.object(BANKROLL_ADMIN_CAP),
      issueTx.pure.u8(GAME_ID),
      issueTx.pure.vector('u8', GAME_NAME),
      issueTx.pure.u64(MAX_SINGLE_PAYOUT),
      issueTx.pure.address(addr),
    ],
  });
  issueTx.setGasBudget(50_000_000);

  const issueRes = await client.signAndExecuteTransaction({
    transaction: issueTx,
    signer: kp,
    options: { showEffects: true, showObjectChanges: true },
  });
  if (issueRes.effects?.status?.status !== 'success') {
    console.error('issue failed:', issueRes.effects);
    process.exit(1);
  }
  console.log('issue digest:', issueRes.digest);

  const created = (issueRes.objectChanges || []).find(
    (c) =>
      c.type === 'created' &&
      'objectType' in c &&
      c.objectType.includes('::bankroll_pool::GameCap'),
  );
  if (!created || !('objectId' in created)) {
    console.error('GameCap not found');
    process.exit(1);
  }
  const gameCapId = created.objectId;
  console.log('new GameCap:', gameCapId);

  await client.waitForTransaction({ digest: issueRes.digest });

  const installTx = new Transaction();
  installTx.moveCall({
    target: `${NM_PKG}::numbermatch::install_game_cap`,
    arguments: [
      installTx.object(NM_ADMIN_CAP!),
      installTx.object(NM_REGISTRY!),
      installTx.object(gameCapId),
    ],
  });
  installTx.setGasBudget(50_000_000);

  const installRes = await client.signAndExecuteTransaction({
    transaction: installTx,
    signer: kp,
    options: { showEffects: true, showEvents: true },
  });
  console.log('install digest:', installRes.digest);
  console.log('status:', installRes.effects?.status);

  if (installRes.effects?.status?.status !== 'success') {
    console.error('install failed:', installRes.effects);
    process.exit(1);
  }
  console.log('OK: numbermatch ready');
  console.log(
    JSON.stringify(
      {
        gameCapId,
        registry: NM_REGISTRY,
        package: NM_PKG,
        gameId: GAME_ID,
        maxSinglePayout: MAX_SINGLE_PAYOUT.toString(),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
