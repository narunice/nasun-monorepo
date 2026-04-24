/**
 * v3: issue a fresh GameCap from BankrollPool admin, then install into the
 * v3 LotteryRegistry. Bankroll itself is unchanged from v2 (no re-seed).
 *
 * Usage: node --experimental-strip-types apps/gostop/bots/install-gamecap-v3.ts
 */
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

const RPC = 'https://rpc.devnet.nasun.io';
const ADMIN_PRIVKEY = process.env.ADMIN_PRIVKEY;
if (!ADMIN_PRIVKEY) {
  console.error('ADMIN_PRIVKEY environment variable is required (suiprivkey... or 64 hex chars)');
  process.exit(1);
}

const BANKROLL_PKG =
  '0xb92e09a5665144aeb69934b7e1c8b6fc67a37d424c69ac2eabd9386524110b82';
const BANKROLL_ADMIN_CAP =
  '0x6c9c504ac631b967ff576e39f643153f3a503a16d4360c1820575d15802b41ba';

// v3 lottery (5-of-25)
const LOTTERY_PKG_V3 =
  '0x48e23db58f02f077b46aef98aa0fcfce86aaa65046fdc7e0db302a6fc670ec14';
const LOTTERY_ADMIN_CAP_V3 =
  '0x73ae9d42b41d97f78c7bfacbf603ba13333e976dd50e7f55b2a3c029b70c262a';
const LOTTERY_REGISTRY_V3 =
  '0xf09e32ed9033a4ebf86b66246efb21ab618c96e9ab0032859dc926d6d9b52ea5';

// Same parameters used for v2 GameCap
const GAME_ID_LOTTERY = 1;
const GAME_NAME = Array.from(new TextEncoder().encode('lottery'));
const MAX_SINGLE_PAYOUT = 100_000n * 1_000_000n; // 100,000 NUSDC

async function main() {
  const { secretKey } = decodeSuiPrivateKey(ADMIN_PRIVKEY);
  const kp = Ed25519Keypair.fromSecretKey(secretKey);
  const addr = kp.toSuiAddress();
  const client = new SuiClient({ url: RPC });

  console.log('admin:', addr);

  // === Step 1: issue GameCap to admin ===
  const issueTx = new Transaction();
  issueTx.moveCall({
    target: `${BANKROLL_PKG}::bankroll_pool::issue_game_cap`,
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

  // Wait for the object to be indexed before referencing it.
  await client.waitForTransaction({ digest: issueRes.digest });

  // === Step 2: install GameCap into v3 LotteryRegistry ===
  const installTx = new Transaction();
  installTx.moveCall({
    target: `${LOTTERY_PKG_V3}::lottery::install_game_cap`,
    arguments: [
      installTx.object(LOTTERY_ADMIN_CAP_V3),
      installTx.object(LOTTERY_REGISTRY_V3),
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
    console.log('OK: v3 ready');
    console.log(JSON.stringify({ gameCapId, registry: LOTTERY_REGISTRY_V3 }, null, 2));
  } else {
    console.error('install failed:', installRes.effects);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
