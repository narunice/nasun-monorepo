/**
 * v2: merge NUSDC coins → split 100,000 NUSDC → treasury_deposit(cap) →
 *     install_game_cap into LotteryRegistry.
 *
 * Usage: node --experimental-strip-types apps/gostop/bots/seed-bankroll-v2.ts
 */
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

const RPC = 'https://rpc.devnet.nasun.io';
const ADMIN_PRIVKEY = process.env.ADMIN_PRIVKEY;
if (!ADMIN_PRIVKEY) {
  console.error('ADMIN_PRIVKEY environment variable is required');
  process.exit(1);
}

const NUSDC_TYPE =
  '0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731::nusdc::NUSDC';

// v2 deployment IDs
const BANKROLL_PKG =
  '0xb92e09a5665144aeb69934b7e1c8b6fc67a37d424c69ac2eabd9386524110b82';
const BANKROLL_POOL =
  '0xf74e8c3c16ee077651f82459f350e96027c82319686395679d10f08ed0cd306d';
const LOTTERY_GAME_CAP =
  '0xdd7eef8ed5eb025c4bfaf4e7c8784f59789a1d9330093d31432643f4b79c115f';

const LOTTERY_PKG =
  '0xd1982095c8092b4c30b9d4d0c45cbcb6a856011f722af3d430e1c8271e2d6b86';
const LOTTERY_REGISTRY =
  '0x50f29b198de1822cbb889a7127b9356f74f265d0bae8b3bd56a5551fecc20207';
const LOTTERY_ADMIN_CAP =
  '0x18cf311fbd30dad05b30cceb7f8878b30bb0a882f39b277fc462be5e8ee86391';

const SEED_AMOUNT = 100_000n * 1_000_000n; // 100,000 NUSDC (6 decimals)

async function main() {
  const { secretKey } = decodeSuiPrivateKey(ADMIN_PRIVKEY);
  const kp = Ed25519Keypair.fromSecretKey(secretKey);
  const addr = kp.toSuiAddress();
  const client = new SuiClient({ url: RPC });

  console.log('admin:', addr);

  const coins: { coinObjectId: string; balance: string }[] = [];
  let cursor: string | null | undefined = null;
  do {
    const page = await client.getCoins({
      owner: addr,
      coinType: NUSDC_TYPE,
      cursor,
      limit: 50,
    });
    coins.push(...page.data);
    cursor = page.hasNextPage ? page.nextCursor : undefined;
  } while (cursor);

  const total = coins.reduce((s, c) => s + BigInt(c.balance), 0n);
  console.log(`nusdc coins: ${coins.length}, total=${total}`);
  if (total < SEED_AMOUNT) throw new Error(`balance ${total} < seed ${SEED_AMOUNT}`);

  const [primary, ...rest] = coins;
  const tx = new Transaction();

  if (rest.length > 0) {
    tx.mergeCoins(
      tx.object(primary.coinObjectId),
      rest.map((c) => tx.object(c.coinObjectId)),
    );
  }

  const [seedCoin] = tx.splitCoins(tx.object(primary.coinObjectId), [SEED_AMOUNT]);

  tx.moveCall({
    target: `${BANKROLL_PKG}::bankroll_pool::treasury_deposit`,
    arguments: [
      tx.object(BANKROLL_POOL),
      tx.object(LOTTERY_GAME_CAP),
      seedCoin,
      tx.object('0x6'),
    ],
  });

  tx.moveCall({
    target: `${LOTTERY_PKG}::lottery::install_game_cap`,
    arguments: [
      tx.object(LOTTERY_ADMIN_CAP),
      tx.object(LOTTERY_REGISTRY),
      tx.object(LOTTERY_GAME_CAP),
    ],
  });

  tx.setGasBudget(500_000_000);

  const res = await client.signAndExecuteTransaction({
    transaction: tx,
    signer: kp,
    options: { showEffects: true, showEvents: true },
  });
  console.log('digest:', res.digest);
  console.log('status:', res.effects?.status);
  if (res.effects?.status?.status === 'success') {
    console.log('✓ seed + install OK');
    for (const e of res.events || []) {
      console.log(`  event ${e.type}:`, e.parsedJson);
    }
  } else {
    console.log('effects:', JSON.stringify(res.effects, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
