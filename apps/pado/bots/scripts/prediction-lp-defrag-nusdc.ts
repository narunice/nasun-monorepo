/**
 * One-shot NUSDC defrag for the Prediction LP bot wallet.
 *
 * The LP bot's per-tick `splitCoins` flow leaves the wallet with thousands
 * of equally-sized change coins (= largest ladder size). Once no single coin
 * exceeds a ladder/mint total, the bot silently stalls because the legacy
 * single-coin selector returned null. This script consolidates fragments
 * into the largest coin in chunked merge txs.
 *
 * Run:
 *   cd apps/pado/bots
 *   node --env-file=.env --import tsx scripts/prediction-lp-defrag-nusdc.ts
 *
 * Idempotent: rerun until "coin count: 1".
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import { MARKETS } from '../lib/config.js';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
const NUSDC_TYPE = MARKETS.NBTC.quoteType;
// Smaller chunks reduce lock-contention with a still-running LP bot. The
// bot picks the largest coin per tick, so we feed it from the tail (smallest)
// to avoid grabbing the same ones.
const CHUNK = 200;
const MAX_RETRIES_PER_ROUND = 5;

function ts(): string {
  return new Date().toISOString().slice(11, 19);
}

function parseKeypair(input: string): Ed25519Keypair {
  if (input.startsWith('suiprivkey')) {
    const { secretKey } = decodeSuiPrivateKey(input);
    return Ed25519Keypair.fromSecretKey(secretKey);
  }
  const clean = input.replace(/^0x/, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(clean)) {
    throw new Error('Invalid private key (expected suiprivkey or 64-hex)');
  }
  return Ed25519Keypair.fromSecretKey(Buffer.from(clean, 'hex'));
}

async function listAllCoins(
  client: SuiClient,
  owner: string,
): Promise<{ id: string; balance: bigint }[]> {
  let cursor: string | null | undefined = null;
  const out: { id: string; balance: bigint }[] = [];
  while (true) {
    const page = await client.getCoins({ owner, coinType: NUSDC_TYPE, cursor: cursor ?? null });
    for (const c of page.data) out.push({ id: c.coinObjectId, balance: BigInt(c.balance) });
    if (!page.hasNextPage || !page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return out;
}

async function main() {
  const keyInput = process.env.PREDICTION_LP_PRIVATE_KEY;
  if (!keyInput) throw new Error('PREDICTION_LP_PRIVATE_KEY missing in env');
  const kp = parseKeypair(keyInput);
  const owner = kp.toSuiAddress();
  const client = new SuiClient({ url: RPC_URL });

  console.log(`[${ts()}] defrag start owner=${owner} chunk=${CHUNK}`);

  let round = 0;
  let retries = 0;
  let consecutiveLockErrors = 0;
  while (true) {
    round++;
    const coins = await listAllCoins(client, owner);
    const total = coins.reduce((s, c) => s + c.balance, 0n);
    console.log(`[${ts()}] round ${round}: count=${coins.length} total=${total}`);
    if (coins.length <= 1) {
      console.log(`[${ts()}] done (single coin remaining)`);
      break;
    }
    // Largest first → primary; pull extras from the *tail* (smallest) so we
    // don't grab the coin the live bot is using this tick.
    coins.sort((a, b) => (b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0));
    const primary = coins[0];
    const tailStart = Math.max(1, coins.length - CHUNK);
    const extras = coins.slice(tailStart);

    const tx = new Transaction();
    tx.mergeCoins(
      tx.object(primary.id),
      extras.map((c) => tx.object(c.id)),
    );
    try {
      const res = await client.signAndExecuteTransaction({
        transaction: tx,
        signer: kp,
        options: { showEffects: true },
      });
      await client.waitForTransaction({ digest: res.digest });
      const status = res.effects?.status?.status;
      if (status !== 'success') {
        throw new Error(`tx ${res.digest.slice(0, 12)} effects=${JSON.stringify(res.effects?.status)}`);
      }
      console.log(
        `[${ts()}] merged ${extras.length} (tail) into ${primary.id.slice(0, 12)} digest=${res.digest.slice(0, 12)}`,
      );
      retries = 0;
      consecutiveLockErrors = 0;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable =
        /already locked/i.test(msg) ||
        /not available for consumption/i.test(msg) ||
        /current version/i.test(msg) ||
        /equivocation/i.test(msg);
      if (!isRetryable || retries >= MAX_RETRIES_PER_ROUND) {
        console.error(`[${ts()}] giving up: ${msg}`);
        process.exit(2);
      }
      retries++;
      consecutiveLockErrors++;
      const backoff = Math.min(5000, 500 * Math.pow(2, consecutiveLockErrors));
      console.warn(`[${ts()}] lock conflict (retry ${retries}, sleeping ${backoff}ms)`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
