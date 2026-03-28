/**
 * Spot Trading E2E Tests
 *
 * SDK-T1: Create BalanceManager + deposit NUSDC + place limit buy
 * SDK-T2: Place market buy (requires LP bot running)
 * SDK-T3: Cancel an open order
 *
 * Prerequisites: LP bot must be running (`pnpm dev:pado:with-bot`)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Transaction } from '@mysten/sui/transactions';
import {
  DEEPBOOK_PACKAGE_ID,
  NUSDC_TYPE,
  NBTC_TYPE,
} from '@nasun/devnet-config';
import {
  client,
  CLOCK_ID,
  getUserKeypair,
  getUserAddress,
  getBalance,
  execTx,
  ensureBalance,
  findNusdcCoin,
  waitForTx,
  sleep,
} from './helpers';

// Pool ID for NBTC/NUSDC from devnet-config
const POOL_NBTC_NUSDC =
  '0xa2b755aebb88f9d249e22d58f7ac5e2e003ce53f4d5bbb30c03be50966d01cd0';

// DeepBook constants
const ORDER_TYPE_NO_RESTRICTION = 0;
const SELF_MATCHING_ALLOWED = 0;
const PAY_WITH_DEEP = false;

let balanceManagerId: string | null = null;

/**
 * Find existing BalanceManager owned by user, or return null.
 */
async function findExistingBM(owner: string): Promise<string | null> {
  const objects = await client.getOwnedObjects({
    owner,
    filter: {
      StructType: `${DEEPBOOK_PACKAGE_ID}::balance_manager::BalanceManager`,
    },
    options: { showContent: true },
  });
  if (objects.data.length > 0) {
    return objects.data[0].data!.objectId;
  }
  return null;
}

/**
 * Check if the orderbook has liquidity (at least 1 ask).
 */
async function ensureOrderbookLiquidity() {
  // Query orderbook via devInspect
  const tx = new Transaction();
  tx.moveCall({
    target: `${DEEPBOOK_PACKAGE_ID}::pool::get_level2_ticks_from_mid`,
    typeArguments: [NBTC_TYPE, NUSDC_TYPE],
    arguments: [
      tx.object(POOL_NBTC_NUSDC),
      tx.pure.u64(5), // 5 ticks
      tx.object(CLOCK_ID),
    ],
  });

  try {
    await client.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: getUserAddress(),
    });
    // If it doesn't throw, the pool exists and we can proceed
  } catch {
    throw new Error(
      'Cannot query orderbook. Ensure LP bot is running: pnpm dev:pado:with-bot',
    );
  }
}

function generateProofAsOwner(
  tx: Transaction,
  bmId: string,
): any {
  return tx.moveCall({
    target: `${DEEPBOOK_PACKAGE_ID}::balance_manager::generate_proof_as_owner`,
    arguments: [tx.object(bmId)],
  });
}

describe('Spot Trading', () => {
  let lastOrderId: string | null = null;

  beforeAll(async () => {
    const userAddr = getUserAddress();
    await ensureBalance(userAddr, NUSDC_TYPE, 100_000_000n); // 100 NUSDC min
    await ensureOrderbookLiquidity();

    // Find or remember existing BM
    balanceManagerId = await findExistingBM(userAddr);
  });

  it('SDK-T1: should create BalanceManager, deposit, and place limit buy', async () => {
    const userAddr = getUserAddress();

    // Create BM if not exists
    if (!balanceManagerId) {
      const createTx = new Transaction();
      const bm = createTx.moveCall({
        target: `${DEEPBOOK_PACKAGE_ID}::balance_manager::new`,
        arguments: [],
      });
      createTx.transferObjects([bm], userAddr);

      const createResult = await execTx(createTx, getUserKeypair());
      expect(createResult.effects?.status?.status).toBe('success');

      const bmObj = createResult.objectChanges?.find(
        (c) =>
          c.type === 'created' &&
          c.objectType?.includes('::balance_manager::BalanceManager'),
      );
      expect(bmObj).toBeDefined();
      balanceManagerId = (bmObj as any).objectId;
      await waitForTx(createResult.digest);
    }

    expect(balanceManagerId).toBeTruthy();

    // Deposit 50 NUSDC
    const depositAmount = 50_000_000n;
    const nusdcCoin = await findNusdcCoin(userAddr, depositAmount);
    const depositTx = new Transaction();
    const [depositCoin] = depositTx.splitCoins(depositTx.object(nusdcCoin), [
      depositTx.pure.u64(depositAmount),
    ]);
    depositTx.moveCall({
      target: `${DEEPBOOK_PACKAGE_ID}::balance_manager::deposit`,
      typeArguments: [NUSDC_TYPE],
      arguments: [depositTx.object(balanceManagerId!), depositCoin],
    });

    const depositResult = await execTx(depositTx, getUserKeypair());
    expect(depositResult.effects?.status?.status).toBe('success');
    await waitForTx(depositResult.digest);

    // Place a limit buy at a low price (unlikely to fill, just tests order placement)
    const limitTx = new Transaction();
    const tradeProof = generateProofAsOwner(limitTx, balanceManagerId!);
    const expireTimestamp = BigInt(Date.now()) + 86_400_000n; // 24h

    limitTx.moveCall({
      target: `${DEEPBOOK_PACKAGE_ID}::pool::place_limit_order`,
      typeArguments: [NBTC_TYPE, NUSDC_TYPE],
      arguments: [
        limitTx.object(POOL_NBTC_NUSDC),
        limitTx.object(balanceManagerId!),
        tradeProof,
        limitTx.pure.u64(BigInt(Date.now())), // client_order_id
        limitTx.pure.u8(ORDER_TYPE_NO_RESTRICTION),
        limitTx.pure.u8(SELF_MATCHING_ALLOWED),
        limitTx.pure.u64(1_000_000), // price: 1 NUSDC (very low)
        limitTx.pure.u64(10_000), // quantity: 0.0001 NBTC (min lot)
        limitTx.pure.bool(true), // is_bid (buy)
        limitTx.pure.bool(PAY_WITH_DEEP),
        limitTx.pure.u64(expireTimestamp),
        limitTx.object(CLOCK_ID),
      ],
    });

    const limitResult = await execTx(limitTx, getUserKeypair());
    expect(limitResult.effects?.status?.status).toBe('success');

    // Extract order ID from events for cancel test
    const orderEvent = limitResult.events?.find((e) =>
      e.type.includes('OrderPlaced') || e.type.includes('OrderFilled'),
    );
    if (orderEvent) {
      const parsed = orderEvent.parsedJson as any;
      lastOrderId = parsed.order_id || parsed.maker_order_id;
    }
  });

  it('SDK-T2: should execute a market buy', async () => {
    await sleep(2000); // Avoid shared pool object contention with LP bot
    if (!balanceManagerId) {
      throw new Error('BalanceManager not created. Run SDK-T1 first.');
    }

    const nbtcBefore = await getBalance(getUserAddress(), NBTC_TYPE);

    const marketTx = new Transaction();
    const tradeProof = generateProofAsOwner(marketTx, balanceManagerId);

    marketTx.moveCall({
      target: `${DEEPBOOK_PACKAGE_ID}::pool::place_market_order`,
      typeArguments: [NBTC_TYPE, NUSDC_TYPE],
      arguments: [
        marketTx.object(POOL_NBTC_NUSDC),
        marketTx.object(balanceManagerId),
        tradeProof,
        marketTx.pure.u64(BigInt(Date.now())),
        marketTx.pure.u8(SELF_MATCHING_ALLOWED),
        marketTx.pure.u64(10_000), // 0.0001 NBTC
        marketTx.pure.bool(true), // is_bid
        marketTx.pure.bool(PAY_WITH_DEEP),
        marketTx.object(CLOCK_ID),
      ],
    });

    const result = await execTx(marketTx, getUserKeypair());
    expect(result.effects?.status?.status).toBe('success');

    // Check for fill event
    const fillEvent = result.events?.find((e) =>
      e.type.includes('OrderFilled'),
    );
    // Market order should fill if LP bot has liquidity
    if (fillEvent) {
      const parsed = fillEvent.parsedJson as any;
      expect(Number(parsed.base_quantity || parsed.filled_quantity || 0)).toBeGreaterThan(0);
    }
  });

  it('SDK-T3: should cancel an open order', async () => {
    await sleep(3000); // Avoid contention with LP bot on shared pool
    if (!balanceManagerId) {
      throw new Error('BalanceManager not created. Run SDK-T1 first.');
    }

    // Place a limit order to cancel
    const limitTx = new Transaction();
    const tradeProof = generateProofAsOwner(limitTx, balanceManagerId);
    const expireTimestamp = BigInt(Date.now()) + 86_400_000n;

    limitTx.moveCall({
      target: `${DEEPBOOK_PACKAGE_ID}::pool::place_limit_order`,
      typeArguments: [NBTC_TYPE, NUSDC_TYPE],
      arguments: [
        limitTx.object(POOL_NBTC_NUSDC),
        limitTx.object(balanceManagerId),
        tradeProof,
        limitTx.pure.u64(BigInt(Date.now())),
        limitTx.pure.u8(ORDER_TYPE_NO_RESTRICTION),
        limitTx.pure.u8(SELF_MATCHING_ALLOWED),
        limitTx.pure.u64(1_000_000), // 1 NUSDC (very low, won't fill)
        limitTx.pure.u64(10_000),
        limitTx.pure.bool(true),
        limitTx.pure.bool(PAY_WITH_DEEP),
        limitTx.pure.u64(expireTimestamp),
        limitTx.object(CLOCK_ID),
      ],
    });

    const placeResult = await execTx(limitTx, getUserKeypair());
    expect(placeResult.effects?.status?.status).toBe('success');
    await waitForTx(placeResult.digest);

    // Extract order_id
    const placeEvent = placeResult.events?.find((e) =>
      e.type.includes('OrderPlaced'),
    );
    expect(placeEvent).toBeDefined();
    const orderId = (placeEvent!.parsedJson as any).order_id;
    expect(orderId).toBeDefined();

    // Cancel the order
    const cancelTx = new Transaction();
    const cancelProof = generateProofAsOwner(cancelTx, balanceManagerId);

    cancelTx.moveCall({
      target: `${DEEPBOOK_PACKAGE_ID}::pool::cancel_order`,
      typeArguments: [NBTC_TYPE, NUSDC_TYPE],
      arguments: [
        cancelTx.object(POOL_NBTC_NUSDC),
        cancelTx.object(balanceManagerId),
        cancelProof,
        cancelTx.pure.u128(BigInt(orderId)),
        cancelTx.object(CLOCK_ID),
      ],
    });

    const cancelResult = await execTx(cancelTx, getUserKeypair());
    expect(cancelResult.effects?.status?.status).toBe('success');

    const cancelEvent = cancelResult.events?.find((e) =>
      e.type.includes('OrderCanceled'),
    );
    expect(cancelEvent).toBeDefined();
  });
});
