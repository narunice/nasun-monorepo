/**
 * ad-hoc one-shot: post LP-owned NO Positions as sell_maker asks on a given
 * market. Use when the LP wallet already holds NO inventory (e.g. from a
 * prior `mint_outcome_tokens`) but the on-chain NO ask side is empty
 * because prediction-lp-bot is paused or hasn't picked up the market yet.
 *
 * !!! SAFETY — read before running !!!
 *
 *   This script signs with PREDICTION_LP_PRIVATE_KEY, the same key the
 *   prediction-lp-bot uses in production. Sui owned-object locks mean that
 *   running this concurrently with the live LP bot WILL trigger
 *   LockConflict, and per project_pado_bot_single_instance.md repeated
 *   concurrent ownership has crashed the fullnode in the past.
 *
 *   Before invoking on prod-owned LP inventory:
 *     1. `pm2 stop prediction-lp` on the EC2 host running the LP bot, OR
 *     2. confirm that the target market is NOT in PREDICTION_LP_MARKETS and
 *        the bot's auto-discovery has not picked it up (e.g. brand-new v5
 *        market the bot has not seen yet).
 *
 *   After the ad-hoc seed, `pm2 start prediction-lp` again.
 *
 *   For brand-new markets that LP would auto-discover anyway, prefer
 *   restarting the bot over running this script — the bot already mints +
 *   ladders inventory in its normal reconcile loop.
 *
 * Reads from environment:
 *   PREDICTION_LP_PRIVATE_KEY   (signer)
 *   PREDICTION_PACKAGE_ID       (canonical v5; overridden per-market via
 *                                runtime type-tag dispatch below)
 *   PREDICTION_PACKAGE_ID_LEGACY (comma-separated, used to surface legacy
 *                                 markets — we dispatch the moveCall based
 *                                 on the market object's actual type tag)
 *
 * Usage:
 *   node --env-file=.env --import tsx scripts/seed-no-asks-adhoc.ts <marketId> <priceBps1[,priceBps2,...]>
 *
 * Example:
 *   node --env-file=.env --import tsx scripts/seed-no-asks-adhoc.ts \
 *     0x6d3c8236... 5100,5300
 *
 * Behavior: picks up to N LP-owned NO Positions in the target market and
 * issues one place_sell_maker per (position, price) pair, in input order.
 * Stops if it runs out of either positions or prices.
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Transaction } from '@mysten/sui/transactions';

const RPC_URL = process.env.NASUN_RPC_URL || 'https://rpc.devnet.nasun.io';
const CLOCK_ID = '0x6';

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

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required`);
  return v;
}

async function main(): Promise<void> {
  const [marketArg, pricesArg] = process.argv.slice(2);
  if (!marketArg || !pricesArg) {
    console.error('usage: seed-no-asks-adhoc.ts <marketId> <priceBps,priceBps,...>');
    process.exit(1);
  }
  const marketId = marketArg.toLowerCase();
  const prices = pricesArg.split(',').map((p) => Number(p.trim())).filter((p) => Number.isFinite(p) && p > 0 && p < 10000);
  if (prices.length === 0) {
    console.error('no valid prices supplied (1..9999 bps)');
    process.exit(1);
  }

  const kp = parseKeypair(requireEnv('PREDICTION_LP_PRIVATE_KEY'));
  const lpAddr = kp.toSuiAddress();
  const client = new SuiClient({ url: RPC_URL });

  // Resolve which package owns this market by reading its on-chain type tag.
  // moveCall target must match the originalPackageId == packageId for
  // fresh-publish packages (v5) or the latest published-at for upgraded
  // packages (legacy v4). For the cutover, both legacy.packageId and v5
  // packageId resolve via .env: PREDICTION_PACKAGE_ID (v5) +
  // PREDICTION_PACKAGE_ID_LEGACY comma-list. We pick the FIRST id from the
  // legacy list whose prefix matches the market's type — that is the
  // latest legacy published-at (= v4) needed for moveCall dispatch.
  const marketObj = await client.getObject({ id: marketId, options: { showType: true } });
  const marketType = marketObj.data?.type ?? '';
  const marketOriginal = marketType.split('::')[0] ?? '';
  if (!marketOriginal) {
    throw new Error(`could not read market type for ${marketId}`);
  }

  const v5Pkg = requireEnv('PREDICTION_PACKAGE_ID').toLowerCase();
  const legacyList = (process.env.PREDICTION_PACKAGE_ID_LEGACY ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  // Pick moveCall package:
  //   if market.originalId == v5_pkg (fresh publish), use v5 pkg
  //   else, the market was created on legacy. legacyList[0] is the v1
  //   originalId (type anchor); legacyList[1] is the v4 latest publish
  //   that holds the live bytecode. Use the latest publish for moveCall.
  let movePkg: string;
  if (marketOriginal === v5Pkg) {
    movePkg = v5Pkg;
  } else if (legacyList.includes(marketOriginal)) {
    movePkg = legacyList[legacyList.length - 1]; // latest legacy publish
  } else {
    throw new Error(
      `market originalId ${marketOriginal} not found in PREDICTION_PACKAGE_ID or PREDICTION_PACKAGE_ID_LEGACY`,
    );
  }

  console.log(`LP:            ${lpAddr}`);
  console.log(`Market:        ${marketId}`);
  console.log(`Market origin: ${marketOriginal}`);
  console.log(`moveCall pkg:  ${movePkg}`);
  console.log(`prices (bps):  ${prices.join(', ')}`);

  // Find LP-owned NO Positions in this market.
  const positionType = `${marketOriginal}::prediction_market::Position`;
  const positions: Array<{ id: string; shares: bigint; version: bigint }> = [];
  let cursor: string | null | undefined = null;
  do {
    const page = await client.getOwnedObjects({
      owner: lpAddr,
      filter: { StructType: positionType },
      options: { showContent: true },
      cursor: cursor ?? null,
    });
    for (const o of page.data) {
      const f = (o.data?.content && 'fields' in o.data.content)
        ? (o.data.content.fields as Record<string, unknown>)
        : null;
      if (!f) continue;
      if (String(f.market_id ?? '').toLowerCase() !== marketId) continue;
      if (Boolean(f.is_yes ?? false)) continue; // NO only
      const shares = BigInt(String(f.shares ?? 0));
      if (shares <= 0n) continue;
      positions.push({
        id: o.data!.objectId!,
        shares,
        version: BigInt(o.data!.version ?? 0),
      });
    }
    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);

  // Newest first (avoid stale-version contention) and largest first within ties.
  positions.sort((a, b) => {
    if (b.version !== a.version) return b.version > a.version ? 1 : -1;
    return b.shares > a.shares ? 1 : -1;
  });

  if (positions.length === 0) {
    console.error(`LP wallet has zero NO Positions in market ${marketId}`);
    process.exit(2);
  }
  console.log(`LP NO positions found: ${positions.length}`);
  for (const p of positions) {
    console.log(`  ${p.id} shares=${p.shares} v=${p.version}`);
  }

  const pairs: Array<{ position: string; priceBps: number }> = [];
  for (let i = 0; i < Math.min(positions.length, prices.length); i++) {
    pairs.push({ position: positions[i].id, priceBps: prices[i] });
  }
  console.log(`Will post ${pairs.length} sell_maker order(s).`);

  const tx = new Transaction();
  for (const { position, priceBps } of pairs) {
    tx.moveCall({
      target: `${movePkg}::prediction_market::place_sell_maker`,
      arguments: [
        tx.object(marketId),
        tx.object(position),
        tx.pure.u64(priceBps),
        tx.object(CLOCK_ID),
      ],
    });
  }

  const result = await client.signAndExecuteTransaction({
    signer: kp,
    transaction: tx,
    options: { showEffects: true, showEvents: true },
  });

  if (result.effects?.status?.status !== 'success') {
    console.error('TX failed:', result.effects?.status?.error);
    process.exit(3);
  }
  console.log(`Digest: ${result.digest}`);
  const placed = (result.events ?? []).filter(
    (e) => e.type.endsWith('::prediction_market::OrderPlaced'),
  );
  console.log(`OrderPlaced events: ${placed.length}`);
  for (const e of placed) {
    const j = e.parsedJson as Record<string, unknown>;
    console.log(`  side=${j.is_yes ? 'YES' : 'NO'} bid=${j.is_bid} price=${j.price} amount=${j.amount} order_id=${j.order_id}`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
