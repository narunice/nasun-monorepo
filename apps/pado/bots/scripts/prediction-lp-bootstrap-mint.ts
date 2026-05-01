/**
 * Prediction LP Bot — Inventory Bootstrap
 *
 * One-shot helper that mints YES + NO Positions for the LP wallet across all
 * configured markets. Run once after each new market is created and before
 * starting prediction-lp-bot.ts. The LP bot itself never mints; it consumes
 * the YES Positions seeded here for sell-maker quotes.
 *
 * Each mint of N NUSDC produces 1 YES Position with `shares = N` and 1 NO
 * Position with `shares = N`. The LP bot only uses YES; the NO Position sits
 * idle unless you choose to manually quote NO-side later.
 *
 * Env vars (reused from prediction-lp-bot):
 *   PREDICTION_LP_PRIVATE_KEY     ed25519 / suiprivkey of LP wallet.
 *   PREDICTION_LP_MARKETS         Comma-separated market ids to seed.
 *   PREDICTION_PACKAGE_ID         Deployed prediction-market package id.
 *   PREDICTION_LP_BOOTSTRAP_MINT_NUSDC  Inventory size per market in NUSDC
 *                                       human units (default 200).
 *   NASUN_RPC_URL                 RPC endpoint (default devnet).
 *
 * Idempotency: by default, markets where the wallet already holds at least
 * one YES Position with shares >= the configured mint amount are skipped.
 * Pass --force to mint anyway (e.g. to add inventory after fills).
 *
 * Usage:
 *   node --env-file=.env --import tsx scripts/prediction-lp-bootstrap-mint.ts
 *   node --env-file=.env --import tsx scripts/prediction-lp-bootstrap-mint.ts --force
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';
import { MARKETS } from '../lib/config.js';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
const CLOCK_ID = '0x6';
const NUSDC_TYPE = MARKETS.NBTC.quoteType;
const NUSDC_DECIMALS = 6;

function parseKeypair(keyInput: string): Ed25519Keypair {
  if (keyInput.startsWith('suiprivkey')) {
    const { secretKey } = decodeSuiPrivateKey(keyInput);
    return Ed25519Keypair.fromSecretKey(secretKey);
  }
  const cleanKey = keyInput.replace(/^0x/, '').toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(cleanKey)) {
    throw new Error('Invalid private key (expected 64 hex chars or suiprivkey bech32)');
  }
  return Ed25519Keypair.fromSecretKey(Buffer.from(cleanKey, 'hex'));
}

async function hasSufficientYesInventory(
  client: SuiClient,
  owner: string,
  packageId: string,
  marketId: string,
  minShares: bigint,
): Promise<boolean> {
  const positionType = `${packageId}::prediction_market::Position`;
  const target = marketId.toLowerCase();
  let cursor: string | null | undefined = null;
  while (true) {
    const page = await client.getOwnedObjects({
      owner,
      filter: { StructType: positionType },
      options: { showContent: true },
      cursor: cursor ?? null,
    });
    for (const item of page.data) {
      if (!item.data?.content || item.data.content.dataType !== 'moveObject') continue;
      const fields = item.data.content.fields as Record<string, unknown>;
      const itsMarket = String(fields.market_id ?? '').toLowerCase();
      const isYes = Boolean(fields.is_yes ?? false);
      const shares = BigInt(String(fields.shares ?? 0));
      if (itsMarket === target && isYes && shares >= minShares) return true;
    }
    if (!page.hasNextPage || !page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return false;
}

async function pickNUSDCCoin(
  client: SuiClient,
  owner: string,
  minRaw: bigint,
): Promise<{ id: string; balance: bigint } | null> {
  let cursor: string | null | undefined = null;
  let best: { id: string; balance: bigint } | null = null;
  while (true) {
    const page = await client.getCoins({ owner, coinType: NUSDC_TYPE, cursor: cursor ?? null });
    for (const c of page.data) {
      const bal = BigInt(c.balance);
      if (bal >= minRaw && (!best || bal > best.balance)) {
        best = { id: c.coinObjectId, balance: bal };
      }
    }
    if (!page.hasNextPage || !page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return best;
}

async function mintForMarket(
  client: SuiClient,
  keypair: Ed25519Keypair,
  packageId: string,
  marketId: string,
  amountRaw: bigint,
): Promise<string> {
  const owner = keypair.toSuiAddress();
  const coin = await pickNUSDCCoin(client, owner, amountRaw);
  if (!coin) {
    throw new Error(
      `LP wallet ${owner} has no NUSDC coin >= ${amountRaw} (need ${Number(amountRaw) / 10 ** NUSDC_DECIMALS} NUSDC)`,
    );
  }

  const tx = new Transaction();
  const [payment] = tx.splitCoins(tx.object(coin.id), [tx.pure.u64(amountRaw)]);
  tx.moveCall({
    target: `${packageId}::prediction_market::mint_outcome_tokens`,
    arguments: [tx.object(marketId), payment, tx.object(CLOCK_ID)],
  });

  const result = await client.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
    options: { showEffects: true },
  });
  if (result.effects?.status?.status !== 'success') {
    throw new Error(`mint TX failed: ${result.effects?.status?.error || 'unknown'}`);
  }
  await client.waitForTransaction({ digest: result.digest });
  return result.digest;
}

async function main(): Promise<void> {
  const keyInput = process.env.PREDICTION_LP_PRIVATE_KEY;
  if (!keyInput) {
    console.error('PREDICTION_LP_PRIVATE_KEY environment variable is required');
    process.exit(1);
  }

  const packageIdRaw = process.env.PREDICTION_PACKAGE_ID;
  if (!packageIdRaw || !/^0x[0-9a-fA-F]{64}$/.test(packageIdRaw)) {
    console.error('PREDICTION_PACKAGE_ID environment variable is required (0x-prefixed 32-byte hex)');
    process.exit(1);
  }
  const packageId = packageIdRaw.toLowerCase();

  const marketsRaw = process.env.PREDICTION_LP_MARKETS || '';
  const markets = marketsRaw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  if (markets.length === 0) {
    console.error('PREDICTION_LP_MARKETS must list at least one market id');
    process.exit(1);
  }
  for (const m of markets) {
    if (!/^0x[0-9a-f]{64}$/.test(m)) {
      console.error(`PREDICTION_LP_MARKETS: invalid market id ${m}`);
      process.exit(1);
    }
  }

  const force = process.argv.includes('--force');

  const amountHuman = parseFloat(process.env.PREDICTION_LP_BOOTSTRAP_MINT_NUSDC || '200');
  if (!Number.isFinite(amountHuman) || amountHuman <= 0) {
    console.error('PREDICTION_LP_BOOTSTRAP_MINT_NUSDC must be positive');
    process.exit(1);
  }
  const amountRaw = BigInt(Math.round(amountHuman * 10 ** NUSDC_DECIMALS));

  const keypair = parseKeypair(keyInput);
  const owner = keypair.toSuiAddress();
  const client = new SuiClient({ url: RPC_URL });

  console.log(`LP wallet: ${owner}`);
  console.log(`Package:   ${packageId}`);
  console.log(`Markets:   ${markets.length}`);
  console.log(`Mint per market: ${amountHuman} NUSDC -> ${amountRaw} raw`);
  console.log(`Force:     ${force}`);

  for (const marketId of markets) {
    try {
      if (!force) {
        const seeded = await hasSufficientYesInventory(
          client,
          owner,
          packageId,
          marketId,
          amountRaw,
        );
        if (seeded) {
          console.log(`  [SKIP] ${marketId}: YES Position with shares >= ${amountRaw} already exists (use --force to mint anyway)`);
          continue;
        }
      }
      const digest = await mintForMarket(client, keypair, packageId, marketId, amountRaw);
      console.log(`  [OK]  ${marketId} -> ${digest}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  [FAIL] ${marketId}: ${msg}`);
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
