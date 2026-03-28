/**
 * Prediction Market E2E Tests
 *
 * SDK-PM1: Mint outcome tokens + place bid order
 * SDK-PM2: Place bid with invalid price (0 and 10000 bps)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Transaction } from '@mysten/sui/transactions';
import {
  PREDICTION_PACKAGE_ID,
  PREDICTION_GLOBAL_STATE,
  NUSDC_TYPE,
} from '@nasun/devnet-config';
import {
  client,
  CLOCK_ID,
  getUserKeypair,
  getUserAddress,
  execTx,
  expectTxFail,
  ensureBalance,
  findNusdcCoin,
  waitForTx,
} from './helpers';

const NUSDC_DECIMALS = 6;
const MINT_AMOUNT = 10_000_000n; // 10 NUSDC
const BID_AMOUNT = 5_000_000n; // 5 NUSDC

// Find an active prediction market from on-chain events
async function findActiveMarketId(): Promise<string> {
  const events = await client.queryEvents({
    query: {
      MoveEventType: `${PREDICTION_PACKAGE_ID}::prediction_market::MarketCreated`,
    },
    order: 'descending',
    limit: 5,
  });

  if (events.data.length === 0) {
    throw new Error(
      'No prediction markets found. Run seed-prediction.ts first.',
    );
  }

  const parsed = events.data[0].parsedJson as any;
  return parsed.market_id;
}

describe('Prediction Market', () => {
  let marketId: string;

  beforeAll(async () => {
    await ensureBalance(
      getUserAddress(),
      NUSDC_TYPE,
      MINT_AMOUNT + BID_AMOUNT * 2n,
    );
    marketId = await findActiveMarketId();
  });

  it('SDK-PM1: should mint outcome tokens and place a YES bid', async () => {
    const userAddr = getUserAddress();

    // Mint outcome tokens (deposits NUSDC, gets YES + NO)
    const nusdcCoin = await findNusdcCoin(userAddr, MINT_AMOUNT);
    const mintTx = new Transaction();
    const [mintPayment] = mintTx.splitCoins(mintTx.object(nusdcCoin), [
      mintTx.pure.u64(MINT_AMOUNT),
    ]);
    mintTx.moveCall({
      target: `${PREDICTION_PACKAGE_ID}::prediction_market::mint_outcome_tokens`,
      arguments: [
        mintTx.object(marketId),
        mintPayment,
        mintTx.object(CLOCK_ID),
      ],
    });

    const mintResult = await execTx(mintTx, getUserKeypair());
    expect(mintResult.effects?.status?.status).toBe('success');
    await waitForTx(mintResult.digest);

    // Place a YES bid at 60% (6000 basis points)
    const nusdcCoin2 = await findNusdcCoin(userAddr, BID_AMOUNT);
    const bidTx = new Transaction();
    const [bidPayment] = bidTx.splitCoins(bidTx.object(nusdcCoin2), [
      bidTx.pure.u64(BID_AMOUNT),
    ]);
    bidTx.moveCall({
      target: `${PREDICTION_PACKAGE_ID}::prediction_market::place_bid_order`,
      arguments: [
        bidTx.object(marketId),
        bidTx.object(PREDICTION_GLOBAL_STATE),
        bidTx.pure.bool(true), // is_yes
        bidTx.pure.u64(6000), // 60%
        bidPayment,
        bidTx.object(CLOCK_ID),
      ],
    });

    const bidResult = await execTx(bidTx, getUserKeypair());
    expect(bidResult.effects?.status?.status).toBe('success');

    // Verify order was placed
    const orderEvent = bidResult.events?.find((e) =>
      e.type.includes('OrderPlaced'),
    );
    expect(orderEvent).toBeDefined();
  });

  it('SDK-PM2: should reject bid at 0 basis points', async () => {
    const nusdcCoin = await findNusdcCoin(getUserAddress(), BID_AMOUNT);
    const tx = new Transaction();
    const [payment] = tx.splitCoins(tx.object(nusdcCoin), [
      tx.pure.u64(BID_AMOUNT),
    ]);
    tx.moveCall({
      target: `${PREDICTION_PACKAGE_ID}::prediction_market::place_bid_order`,
      arguments: [
        tx.object(marketId),
        tx.object(PREDICTION_GLOBAL_STATE),
        tx.pure.bool(true),
        tx.pure.u64(0), // 0% - invalid
        payment,
        tx.object(CLOCK_ID),
      ],
    });

    await expectTxFail(tx, getUserKeypair());
  });

  it('SDK-PM2: should reject bid at 10000 basis points', async () => {
    const nusdcCoin = await findNusdcCoin(getUserAddress(), BID_AMOUNT);
    const tx = new Transaction();
    const [payment] = tx.splitCoins(tx.object(nusdcCoin), [
      tx.pure.u64(BID_AMOUNT),
    ]);
    tx.moveCall({
      target: `${PREDICTION_PACKAGE_ID}::prediction_market::place_bid_order`,
      arguments: [
        tx.object(marketId),
        tx.object(PREDICTION_GLOBAL_STATE),
        tx.pure.bool(true),
        tx.pure.u64(10000), // 100% - invalid
        payment,
        tx.object(CLOCK_ID),
      ],
    });

    await expectTxFail(tx, getUserKeypair());
  });
});
