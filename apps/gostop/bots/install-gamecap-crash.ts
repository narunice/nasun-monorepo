/**
 * Issue a Crash GameCap from BankrollPool admin, then install it into
 * CrashRegistry and set the operator address.
 *
 * Usage:
 *   ADMIN_PRIVKEY=suiprivkey... \
 *   OPERATOR_ADDRESS=0x... \
 *   node --import tsx install-gamecap-crash.ts
 *
 * Cap sizing (devnet):
 *   max_single_payout = 10000 NUSDC. Crash place_bet pre-checks that
 *   bet * MAX_THEORETICAL_MUL_BPS (6,850,000) / 10000 <= max_single_payout,
 *   so max bet ~= 14.6 NUSDC. Raise cap before mainnet.
 *
 * Two-step flow (BankrollPool.issue_game_cap uses transfer::transfer internally,
 * so the GameCap cannot be captured as a PTB return value):
 *   Tx 1: issue_game_cap -> GameCap transferred to admin wallet
 *   Tx 2: install_game_cap + set_operator (admin consumes the owned GameCap)
 */
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

const { ADMIN_PRIVKEY, OPERATOR_ADDRESS } = process.env;

for (const [k, v] of Object.entries({ ADMIN_PRIVKEY, OPERATOR_ADDRESS })) {
  if (!v) {
    console.error(`Missing env: ${k}`);
    process.exit(1);
  }
}

const RPC = 'https://rpc.devnet.nasun.io';

const BANKROLL_PKG = '0x561c1cf6d984d0be0bc7c77b4387009120b0d73617af07cd6acc605b3ff681fd';
const BANKROLL_ADMIN_CAP = '0x6c9c504ac631b967ff576e39f643153f3a503a16d4360c1820575d15802b41ba';

const CRASH_PKG = '0x6fc868a6dabc2081cd47ea71ee8d2f8314c57102179eafd2ce0fce8e9edc5188';
const CRASH_REGISTRY = '0x3fa421e97c705f98c1cd29300bf4b90aab09a8f2a74190ab08f12d7a6a2f8cab';
const CRASH_ADMIN_CAP = '0x456f17e5a4d2679d8b9d9deb6ef6e3aa5fae6d74be02b055a18c05918a44e3dc';

const GAME_ID = 4;
const GAME_NAME = Array.from(new TextEncoder().encode('crash'));
const MAX_SINGLE_PAYOUT = 10_000n * 1_000_000n; // 10000 NUSDC

// GameCap type uses the original (pre-upgrade) package ID for type identity
const BANKROLL_ORIGINAL_PKG = '0xb92e09a5665144aeb69934b7e1c8b6fc67a37d424c69ac2eabd9386524110b82';
const BANKROLL_GAME_CAP_TYPE = `${BANKROLL_ORIGINAL_PKG}::bankroll_pool::GameCap`;

async function main() {
  const { secretKey } = decodeSuiPrivateKey(ADMIN_PRIVKEY!);
  const kp = Ed25519Keypair.fromSecretKey(secretKey);
  const addr = kp.toSuiAddress();
  const client = new SuiClient({ url: RPC });

  console.log('admin:', addr);
  console.log('crash registry:', CRASH_REGISTRY);
  console.log('operator:', OPERATOR_ADDRESS);

  // Tx 1: issue GameCap to self
  console.log('\nTx 1: issue_game_cap -> transfer to self...');
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

  if (issueRes.effects?.status.status !== 'success') {
    console.error('issue_game_cap failed:', JSON.stringify(issueRes.effects, null, 2));
    process.exit(1);
  }
  console.log('issue_game_cap digest:', issueRes.digest);

  // Find the GameCap object from the tx effects
  const gameCapChange = issueRes.objectChanges?.find(
    (c) => c.type === 'created' && 'objectType' in c && c.objectType === BANKROLL_GAME_CAP_TYPE
  );
  if (!gameCapChange || gameCapChange.type !== 'created') {
    console.error('GameCap not found in tx effects');
    process.exit(1);
  }
  const gameCapId = gameCapChange.objectId;
  console.log('GameCap object ID:', gameCapId);

  // Tx 2: install GameCap into CrashRegistry + set operator
  console.log('\nTx 2: install_game_cap + set_operator...');
  const installTx = new Transaction();
  installTx.moveCall({
    target: `${CRASH_PKG}::crash::install_game_cap`,
    arguments: [
      installTx.object(CRASH_ADMIN_CAP),
      installTx.object(CRASH_REGISTRY),
      installTx.object(gameCapId),
    ],
  });
  installTx.moveCall({
    target: `${CRASH_PKG}::crash::set_operator`,
    arguments: [
      installTx.object(CRASH_ADMIN_CAP),
      installTx.object(CRASH_REGISTRY),
      installTx.pure.address(OPERATOR_ADDRESS!),
    ],
  });
  installTx.setGasBudget(50_000_000);

  const installRes = await client.signAndExecuteTransaction({
    transaction: installTx,
    signer: kp,
    options: { showEffects: true },
  });

  if (installRes.effects?.status.status !== 'success') {
    console.error('install failed:', JSON.stringify(installRes.effects, null, 2));
    process.exit(1);
  }
  console.log('install_game_cap + set_operator digest:', installRes.digest);
  console.log('\nCrash game_id=4 is now active. Update devnet-ids.json status to "ready".');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
