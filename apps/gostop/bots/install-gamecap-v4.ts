/**
 * v4: issue a fresh GameCap from BankrollPool admin, then install into the
 * v4 LotteryRegistry. Bankroll itself was UPGRADED (not redeployed) so the
 * BankrollPool object + 100K NUSDC seed remain. New PackageID for bankroll
 * is the upgraded package, but the original ID still resolves type/event.
 *
 * Usage: ADMIN_PRIVKEY=suiprivkey... node --import tsx install-gamecap-v4.ts
 */
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

const ADMIN_PRIVKEY = process.env.ADMIN_PRIVKEY;
if (!ADMIN_PRIVKEY) {
  console.error('ADMIN_PRIVKEY environment variable is required');
  process.exit(1);
}

const RPC = 'https://rpc.devnet.nasun.io';

// Bankroll: upgraded package (function dispatch goes here), original
// package remains for type identity. issue_game_cap can use either; the
// upgraded one is preferred for any new function logic.
const BANKROLL_PKG_UPGRADED = '0x561c1cf6d984d0be0bc7c77b4387009120b0d73617af07cd6acc605b3ff681fd';
const BANKROLL_ADMIN_CAP = '0x6c9c504ac631b967ff576e39f643153f3a503a16d4360c1820575d15802b41ba';

// v4 lottery (5-of-25, with obligated_amount + sweep grace fixes)
const LOTTERY_PKG_V4 = '0xc0be188b342c4ee7c6cb3cef351a800b1b549cac75311a3d9a80a0a3f54634a3';
const LOTTERY_ADMIN_CAP_V4 = '0x4f2ca8c69b5098d0e255467f8cc6bae1db8abcae254b01c373a02f2528745c89';
const LOTTERY_REGISTRY_V4 = '0x1069c4acb26233de518b2e7f072ccac3bdc7da4428a95e20e54432c0b08d596c';

const GAME_ID_LOTTERY = 1;
const GAME_NAME = Array.from(new TextEncoder().encode('lottery'));
const MAX_SINGLE_PAYOUT = 100_000n * 1_000_000n;

async function main() {
  const { secretKey } = decodeSuiPrivateKey(ADMIN_PRIVKEY!);
  const kp = Ed25519Keypair.fromSecretKey(secretKey);
  const addr = kp.toSuiAddress();
  const client = new SuiClient({ url: RPC });

  console.log('admin:', addr);

  const issueTx = new Transaction();
  issueTx.moveCall({
    target: `${BANKROLL_PKG_UPGRADED}::bankroll_pool::issue_game_cap`,
    arguments: [
      issueTx.object(BANKROLL_ADMIN_CAP),
      issueTx.pure.u8(GAME_ID_LOTTERY),
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
    console.error('GameCap not found in objectChanges');
    process.exit(1);
  }
  const gameCapId = created.objectId;
  console.log('new GameCap:', gameCapId);

  await client.waitForTransaction({ digest: issueRes.digest });

  const installTx = new Transaction();
  installTx.moveCall({
    target: `${LOTTERY_PKG_V4}::lottery::install_game_cap`,
    arguments: [
      installTx.object(LOTTERY_ADMIN_CAP_V4),
      installTx.object(LOTTERY_REGISTRY_V4),
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

  if (installRes.effects?.status?.status === 'success') {
    console.log('OK: v4 ready');
    console.log(JSON.stringify({ gameCapId, registry: LOTTERY_REGISTRY_V4 }, null, 2));
  } else {
    console.error('install failed:', installRes.effects);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
