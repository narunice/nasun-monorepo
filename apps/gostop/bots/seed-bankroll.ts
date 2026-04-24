/**
 * One-off: merge all admin NUSDC coins into one, split 100,000 NUSDC,
 * and treasury_deposit into gostop BankrollPool.
 *
 * Usage: node22 --experimental-strip-types apps/gostop/bots/seed-bankroll.ts
 */
import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';

const RPC = 'https://rpc.devnet.nasun.io';
const ADMIN_PRIVKEY =
  process.env.ADMIN_PRIVKEY ||
  'suiprivkey1qqwc52tm8vgu39n4myw43vcmzrr2wxn74hgjxvqpgjn6atzpf05tvcf46lw';

const NUSDC_TYPE =
  '0x96adf476d488ffb588d0bfdb5c422355f065386a2e7124e66746fb7078816731::nusdc::NUSDC';
const BANKROLL_PKG =
  '0x7693396d304bc554e626987507b92fe22692c5bdae91408b2fc97d0544cfb75e';
const BANKROLL_POOL =
  '0x305e9fd4eff5f2c57b1daa3f24896b65010f8cd71da3c5ef16bccd09e23acd9c';
const SEED_AMOUNT = 100_000n * 1_000_000n; // 100,000 NUSDC (6 decimals)

async function main() {
  const { secretKey } = decodeSuiPrivateKey(ADMIN_PRIVKEY);
  const kp = Ed25519Keypair.fromSecretKey(secretKey);
  const addr = kp.toSuiAddress();
  const client = new SuiClient({ url: RPC });

  console.log('admin:', addr);

  // Paginate all NUSDC coins
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
  console.log(`nusdc coins: ${coins.length}, total=${total.toString()}`);
  if (total < SEED_AMOUNT) {
    throw new Error(`balance ${total} < seed ${SEED_AMOUNT}`);
  }

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
      seedCoin,
      tx.pure.u8(0), // source_game_id = 0 (system seed)
      tx.object('0x6'),
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
  console.log('events:', JSON.stringify(res.events, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
