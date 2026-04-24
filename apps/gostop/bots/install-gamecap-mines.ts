/**
 * Issue a Mines GameCap from BankrollPool admin, then install it into
 * MinesRegistry.
 *
 * Usage:
 *   ADMIN_PRIVKEY=suiprivkey... \
 *   MINES_PKG=0x... \
 *   MINES_ADMIN_CAP=0x... \
 *   MINES_REGISTRY=0x... \
 *   node --import tsx install-gamecap-mines.ts
 *
 * Cap sizing (devnet):
 *   max_single_payout = 100 NUSDC. create_session rejects bets whose
 *   theoretical max payout exceeds this cap, so this also acts as the
 *   effective per-mine-count bet ceiling:
 *     mine=1  (max_mul ~24.25x) -> bet <= 4.12 NUSDC
 *     mine=5  (max_mul ~24.25x) -> bet <= 4.12 NUSDC (same floor multiplier)
 *     mine=12 (max_mul ~1225x)  -> bet <= 0.08 NUSDC  (small bets only)
 *     mine=24 (max_mul ~24.25x) -> bet <= 4.12 NUSDC
 *   This keeps RPC-leak exploit upside bounded during devnet prototype.
 *   Raise cap once encrypted mine placement lands.
 */
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

const {
  ADMIN_PRIVKEY,
  MINES_PKG,
  MINES_ADMIN_CAP,
  MINES_REGISTRY,
} = process.env;

for (const [k, v] of Object.entries({
  ADMIN_PRIVKEY,
  MINES_PKG,
  MINES_ADMIN_CAP,
  MINES_REGISTRY,
})) {
  if (!v) {
    console.error(`Missing env: ${k}`);
    process.exit(1);
  }
}

const RPC = 'https://rpc.devnet.nasun.io';

const BANKROLL_PKG = '0x561c1cf6d984d0be0bc7c77b4387009120b0d73617af07cd6acc605b3ff681fd';
const BANKROLL_ADMIN_CAP = '0x6c9c504ac631b967ff576e39f643153f3a503a16d4360c1820575d15802b41ba';

const GAME_ID = 5; // must match GAME_ID_SELF in mines.move
const GAME_NAME = Array.from(new TextEncoder().encode('mines'));
const MAX_SINGLE_PAYOUT = 100n * 1_000_000n; // 100 NUSDC

async function main() {
  const { secretKey } = decodeSuiPrivateKey(ADMIN_PRIVKEY!);
  const kp = Ed25519Keypair.fromSecretKey(secretKey);
  const addr = kp.toSuiAddress();
  const client = new SuiClient({ url: RPC });

  console.log('admin:', addr);
  console.log('mines package:', MINES_PKG);
  console.log('mines registry:', MINES_REGISTRY);

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
    target: `${MINES_PKG}::mines::install_game_cap`,
    arguments: [
      installTx.object(MINES_ADMIN_CAP!),
      installTx.object(MINES_REGISTRY!),
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
  console.log('OK: mines ready');
  console.log(
    JSON.stringify(
      {
        gameCapId,
        registry: MINES_REGISTRY,
        package: MINES_PKG,
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
