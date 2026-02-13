/**
 * Seed Prediction Markets
 *
 * Creates 4 prediction markets with initial seed liquidity for prototype launch.
 * Markets mirror trending topics from Polymarket/Kalshi (Feb 2026).
 * Uses the admin keypair from Sui keystore.
 *
 * Usage:
 *   cd apps/pado/scripts
 *   npx tsx seed-prediction.ts
 *
 * Prerequisites:
 *   - Prediction contract deployed on V7
 *   - Sui CLI configured with active address owning Prediction AdminCap
 *   - Admin address has NUSDC for seed liquidity
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import {
  PREDICTION_PACKAGE_ID,
  PREDICTION_GLOBAL_STATE,
  PREDICTION_ADMIN_CAP,
  NUSDC_TYPE,
} from '@nasun/devnet-config';
import { getKeypairFromSuiConfig } from './lib/keystore';

// ===== Configuration =====

const RPC_URL = 'https://rpc.devnet.nasun.io';
const CLOCK_ID = '0x6';
const NUSDC_DECIMALS = 6;

// Seed liquidity amount per market (10 NUSDC)
const SEED_AMOUNT = 10n * 10n ** BigInt(NUSDC_DECIMALS);

// ===== Markets to Create =====

interface MarketSeed {
  question: string;
  description: string;
  category: string;
  closeDays: number;
  resolveDaysAfter: number;
  seedYesBidPrice: number;  // Initial YES bid price (basis points, 1-9999)
  seedNoBidPrice: number;   // Initial NO bid price (basis points, 1-9999)
}

const MARKETS: MarketSeed[] = [
  {
    question: 'Will Bitcoin reach $150,000 in 2026?',
    description: 'Resolves YES if Bitcoin (BTC) trades at or above $150,000 USD on any major exchange (Binance, Coinbase, Kraken) at any point before market close. Reference: Polymarket currently prices this at ~21%.',
    category: 'Crypto',
    closeDays: 45,
    resolveDaysAfter: 7,
    seedYesBidPrice: 2000,  // 20% YES
    seedNoBidPrice: 7500,   // 75% NO
  },
  {
    question: 'Will Anthropic have the #1 AI model on Chatbot Arena at end of March 2026?',
    description: 'Resolves YES if Anthropic owns the model ranked #1 on the lmsys.org Chatbot Arena LLM Leaderboard (Overall, Style Control OFF) when checked on March 31, 2026 at 12:00 PM ET. Reference: Polymarket currently prices this at ~76%.',
    category: 'AI',
    closeDays: 45,
    resolveDaysAfter: 3,
    seedYesBidPrice: 7500,  // 75% YES
    seedNoBidPrice: 2000,   // 20% NO
  },
  {
    question: 'Will Norway win the most gold medals at the 2026 Winter Olympics?',
    description: 'Resolves YES if Norway finishes with the highest gold medal count at the Milano Cortina 2026 Winter Olympics (Feb 6-23). Ties broken by total medals. As of Day 5, Norway leads with 7 golds. Reference: Kalshi prices this at ~88%.',
    category: 'Sports',
    closeDays: 10,
    resolveDaysAfter: 3,
    seedYesBidPrice: 8500,  // 85% YES
    seedNoBidPrice: 1000,   // 10% NO
  },
  {
    question: 'Will "Sinners" win Best Picture at the 98th Academy Awards?',
    description: "Resolves YES if Ryan Coogler's \"Sinners\" wins the Best Picture award at the 98th Academy Awards ceremony on March 15, 2026. \"Sinners\" leads with a record 16 nominations but trails \"One Battle After Another\" in prediction markets. Reference: Kalshi prices this at ~21%.",
    category: 'Entertainment',
    closeDays: 30,
    resolveDaysAfter: 3,
    seedYesBidPrice: 2000,  // 20% YES
    seedNoBidPrice: 7500,   // 75% NO
  },
];

// ===== Transaction Helpers =====

async function findNusdcCoin(
  client: SuiClient,
  owner: string,
  minBalance: bigint,
): Promise<string> {
  const coins = await client.getCoins({ owner, coinType: NUSDC_TYPE });

  for (const coin of coins.data) {
    if (BigInt(coin.balance) >= minBalance) {
      return coin.coinObjectId;
    }
  }

  const total = coins.data.reduce((s, c) => s + BigInt(c.balance), 0n);
  if (total >= minBalance && coins.data.length > 0) {
    return coins.data[0].coinObjectId;
  }

  throw new Error(
    `Insufficient NUSDC balance. Need ${minBalance}, have ${total}. ` +
    `Use faucet to get more NUSDC.`
  );
}

function buildCreateMarket(
  adminCapId: string,
  question: string,
  description: string,
  category: string,
  closeTime: bigint,
  resolveDeadline: bigint,
  resolver: string,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::create_market`,
    arguments: [
      tx.object(adminCapId),
      tx.pure.string(question),
      tx.pure.string(description),
      tx.pure.string(category),
      tx.pure.u64(closeTime),
      tx.pure.u64(resolveDeadline),
      tx.pure.address(resolver),
      tx.object(CLOCK_ID),
    ],
  });
  return tx;
}

function buildMintAndBid(
  marketId: string,
  nusdcCoinId: string,
  mintAmount: bigint,
  isYes: boolean,
  bidPrice: number,
  bidAmount: bigint,
): Transaction {
  const tx = new Transaction();

  const [mintCoin] = tx.splitCoins(tx.object(nusdcCoinId), [tx.pure.u64(mintAmount)]);

  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::mint_outcome_tokens`,
    arguments: [
      tx.object(marketId),
      mintCoin,
      tx.object(CLOCK_ID),
    ],
  });

  const [bidCoin] = tx.splitCoins(tx.object(nusdcCoinId), [tx.pure.u64(bidAmount)]);

  tx.moveCall({
    target: `${PREDICTION_PACKAGE_ID}::prediction_market::place_bid_order`,
    arguments: [
      tx.object(marketId),
      tx.object(PREDICTION_GLOBAL_STATE),
      tx.pure.bool(isYes),
      tx.pure.u64(bidPrice),
      bidCoin,
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

// ===== Main =====

async function main() {
  console.log('=== Seed Prediction Markets ===\n');

  const client = new SuiClient({ url: RPC_URL });
  const keypair = getKeypairFromSuiConfig();
  const senderAddress = keypair.getPublicKey().toSuiAddress();

  console.log(`RPC: ${RPC_URL}`);
  console.log(`Admin: ${senderAddress}`);
  console.log(`Package: ${PREDICTION_PACKAGE_ID.slice(0, 20)}...`);
  console.log('');

  // Verify AdminCap ownership
  const adminCapObj = await client.getObject({
    id: PREDICTION_ADMIN_CAP,
    options: { showOwner: true },
  });
  if (!adminCapObj.data) {
    throw new Error('AdminCap not found on-chain.');
  }

  const owner = adminCapObj.data.owner;
  if (owner && typeof owner === 'object' && 'AddressOwner' in owner) {
    if (owner.AddressOwner !== senderAddress) {
      throw new Error(
        `AdminCap owned by ${owner.AddressOwner}, but active address is ${senderAddress}.`
      );
    }
  }

  const createdMarkets: string[] = [];

  for (const market of MARKETS) {
    console.log(`--- Creating: "${market.question}" ---`);

    // All time calculations in BigInt to avoid precision loss
    const now = BigInt(Date.now());
    const closeDaysMs = BigInt(market.closeDays) * 24n * 60n * 60n * 1000n;
    const resolveDaysMs = BigInt(market.resolveDaysAfter) * 24n * 60n * 60n * 1000n;
    const closeTime = now + closeDaysMs;
    const resolveDeadline = closeTime + resolveDaysMs;

    const createTx = buildCreateMarket(
      PREDICTION_ADMIN_CAP,
      market.question,
      market.description,
      market.category,
      closeTime,
      resolveDeadline,
      senderAddress,
    );

    try {
      const createResult = await client.signAndExecuteTransaction({
        transaction: createTx,
        signer: keypair,
        options: { showEffects: true, showObjectChanges: true },
      });

      console.log(`  Create TX: ${createResult.digest}`);

      const marketObj = createResult.objectChanges?.find(
        (c) => c.type === 'created' && c.objectType.includes('::prediction_market::Market'),
      );

      if (!marketObj || marketObj.type !== 'created') {
        console.error('  Failed to find created Market object');
        continue;
      }

      const marketId = marketObj.objectId;
      console.log(`  Market ID: ${marketId}`);
      createdMarkets.push(marketId);

      // Seed liquidity (mint tokens + place bid orders)
      const totalNeeded = SEED_AMOUNT * 2n;
      const nusdcCoinId = await findNusdcCoin(client, senderAddress, totalNeeded);

      console.log(`  Seeding YES bid at ${market.seedYesBidPrice / 100}%...`);
      const yesBidTx = buildMintAndBid(
        marketId, nusdcCoinId, SEED_AMOUNT, true, market.seedYesBidPrice, SEED_AMOUNT,
      );

      const yesBidResult = await client.signAndExecuteTransaction({
        transaction: yesBidTx,
        signer: keypair,
        options: { showEffects: true },
      });
      console.log(`  YES bid TX: ${yesBidResult.digest}`);

      // Wait for RPC to index the transaction before querying coins again
      await client.waitForTransaction({ digest: yesBidResult.digest });

      const nusdcCoinId2 = await findNusdcCoin(client, senderAddress, SEED_AMOUNT * 2n);

      console.log(`  Seeding NO bid at ${market.seedNoBidPrice / 100}%...`);
      const noBidTx = buildMintAndBid(
        marketId, nusdcCoinId2, SEED_AMOUNT, false, market.seedNoBidPrice, SEED_AMOUNT,
      );

      const noBidResult = await client.signAndExecuteTransaction({
        transaction: noBidTx,
        signer: keypair,
        options: { showEffects: true },
      });
      console.log(`  NO bid TX: ${noBidResult.digest}`);
      console.log('');

    } catch (error) {
      console.error(`  Failed:`, error instanceof Error ? error.message : error);
      console.log('');
    }
  }

  console.log('=== Summary ===');
  console.log(`Created ${createdMarkets.length} markets:`);
  for (const id of createdMarkets) {
    console.log(`  ${id}`);
  }
  console.log('\nMarkets will be auto-discovered via on-chain events (no constants update needed).');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
