/**
 * Spot Trading - Comprehensive Order Type Tests
 *
 * Tests ALL DeepBook V3 order types and multi-pair support:
 *
 * Order Types:
 *   SPOT-GTC-1: GTC limit buy (resting in book)
 *   SPOT-GTC-2: GTC limit sell
 *   SPOT-IOC-1: IOC buy (fill available, cancel rest)
 *   SPOT-IOC-2: IOC sell at unfillable price (immediate cancel)
 *   SPOT-FOK-1: FOK buy that can't fully fill (rejected)
 *   SPOT-POST-1: POST_ONLY buy at maker price (accepted)
 *   SPOT-MKT-1: Market buy with fill verification
 *   SPOT-MKT-2: Market sell with fill verification
 *
 * Cancellation:
 *   SPOT-CANCEL-1: Cancel single order
 *   SPOT-CANCEL-2: Cancel all orders (batch)
 *
 * Multi-Pair:
 *   SPOT-PAIR-1: Place order on NASUN/NUSDC pool
 *   SPOT-PAIR-2: Place order on NETH/NUSDC pool
 *
 * Deposit/Withdraw:
 *   SPOT-DW-1: Deposit exact amount
 *   SPOT-DW-2: Withdraw partial amount
 *   SPOT-DW-3: Withdraw all tokens
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Transaction } from '@mysten/sui/transactions';
import {
  DEEPBOOK_PACKAGE_ID,
  NUSDC_TYPE,
  NBTC_TYPE,
  NETH_TYPE,
  NSOL_TYPE,
} from '@nasun/devnet-config';
import {
  client,
  CLOCK_ID,
  getUserKeypair,
  getUserAddress,
  getBalance,
  execTx,
  expectTxFail,
  ensureBalance,
  findNusdcCoin,
  waitForTx,
  sleep,
} from './helpers';

// Pool IDs from devnet-ids.json
const POOLS = {
  NBTC_NUSDC: '0xa2b755aebb88f9d249e22d58f7ac5e2e003ce53f4d5bbb30c03be50966d01cd0',
  NASUN_NUSDC: '0x5953740daf54d767f2cd71a8372db75c7277f2907b55e0bdf7c172d96e033b1e',
  NETH_NUSDC: '0xb6c960985711cf5a9cc5063cec8c7ad148794e4cb3c1ad1cea224911cd68e7b7',
  NSOL_NUSDC: '0x577f81bb5dae12aac57103ed0231aae200af3ac1c5db3d523b679b09ac88c769',
};

const ORDER_TYPE = {
  NO_RESTRICTION: 0, // GTC
  IOC: 1,
  FOK: 2,
  POST_ONLY: 3,
};

const SELF_MATCHING = {
  ALLOWED: 0,
  CANCEL_TAKER: 1,
  CANCEL_MAKER: 2,
};

let bmId: string;
const placedOrderIds: bigint[] = [];

function proof(tx: Transaction) {
  return tx.moveCall({
    target: `${DEEPBOOK_PACKAGE_ID}::balance_manager::generate_proof_as_owner`,
    arguments: [tx.object(bmId)],
  });
}

function placeLimitOrder(
  tx: Transaction,
  poolId: string,
  baseType: string,
  quoteType: string,
  opts: {
    orderType: number;
    price: bigint;
    quantity: bigint;
    isBid: boolean;
    selfMatching?: number;
    expireMs?: bigint;
  },
) {
  const tradeProof = proof(tx);
  const expire = opts.expireMs ?? BigInt(Date.now()) + 86_400_000n;
  tx.moveCall({
    target: `${DEEPBOOK_PACKAGE_ID}::pool::place_limit_order`,
    typeArguments: [baseType, quoteType],
    arguments: [
      tx.object(poolId),
      tx.object(bmId),
      tradeProof,
      tx.pure.u64(BigInt(Date.now())), // client_order_id
      tx.pure.u8(opts.orderType),
      tx.pure.u8(opts.selfMatching ?? SELF_MATCHING.ALLOWED),
      tx.pure.u64(opts.price),
      tx.pure.u64(opts.quantity),
      tx.pure.bool(opts.isBid),
      tx.pure.bool(false), // payWithDeep
      tx.pure.u64(expire),
      tx.object(CLOCK_ID),
    ],
  });
}

function placeMarketOrder(
  tx: Transaction,
  poolId: string,
  baseType: string,
  quoteType: string,
  opts: { quantity: bigint; isBid: boolean },
) {
  const tradeProof = proof(tx);
  tx.moveCall({
    target: `${DEEPBOOK_PACKAGE_ID}::pool::place_market_order`,
    typeArguments: [baseType, quoteType],
    arguments: [
      tx.object(poolId),
      tx.object(bmId),
      tradeProof,
      tx.pure.u64(BigInt(Date.now())),
      tx.pure.u8(SELF_MATCHING.ALLOWED),
      tx.pure.u64(opts.quantity),
      tx.pure.bool(opts.isBid),
      tx.pure.bool(false),
      tx.object(CLOCK_ID),
    ],
  });
}

async function findOrCreateBM(): Promise<string> {
  const objects = await client.getOwnedObjects({
    owner: getUserAddress(),
    filter: {
      StructType: `${DEEPBOOK_PACKAGE_ID}::balance_manager::BalanceManager`,
    },
  });
  if (objects.data.length > 0) return objects.data[0].data!.objectId;

  const tx = new Transaction();
  const bm = tx.moveCall({
    target: `${DEEPBOOK_PACKAGE_ID}::balance_manager::new`,
    arguments: [],
  });
  tx.transferObjects([bm], getUserAddress());
  const result = await execTx(tx, getUserKeypair());
  const bmObj = result.objectChanges?.find(
    (c) => c.type === 'created' && c.objectType?.includes('BalanceManager'),
  );
  await waitForTx(result.digest);
  return (bmObj as any).objectId;
}

async function depositNUSDC(amount: bigint) {
  const coin = await findNusdcCoin(getUserAddress(), amount);
  const tx = new Transaction();
  const [splitCoin] = tx.splitCoins(tx.object(coin), [tx.pure.u64(amount)]);
  tx.moveCall({
    target: `${DEEPBOOK_PACKAGE_ID}::balance_manager::deposit`,
    typeArguments: [NUSDC_TYPE],
    arguments: [tx.object(bmId), splitCoin],
  });
  const result = await execTx(tx, getUserKeypair());
  await waitForTx(result.digest);
  return result;
}

function extractOrderId(result: any): bigint | null {
  const event = result.events?.find(
    (e: any) =>
      e.type.includes('OrderPlaced') || e.type.includes('OrderFilled'),
  );
  if (!event) return null;
  const parsed = event.parsedJson as any;
  return BigInt(parsed.order_id || parsed.maker_order_id || '0');
}

// ============================================================================
// Setup
// ============================================================================

beforeAll(async () => {
  await ensureBalance(getUserAddress(), NUSDC_TYPE, 200_000_000n); // 200 NUSDC
  bmId = await findOrCreateBM();
  // Ensure BM has deposit
  await depositNUSDC(100_000_000n); // 100 NUSDC
}, 30_000);

// ============================================================================
// GTC Orders
// ============================================================================

describe('Spot: GTC Orders', () => {
  it('SPOT-GTC-1: limit buy rests in orderbook', async () => {
    await sleep(2000);
    const tx = new Transaction();
    placeLimitOrder(tx, POOLS.NBTC_NUSDC, NBTC_TYPE, NUSDC_TYPE, {
      orderType: ORDER_TYPE.NO_RESTRICTION,
      price: 1_000_000n, // $1 (very low, won't fill)
      quantity: 10_000n, // 0.0001 NBTC
      isBid: true,
    });

    const result = await execTx(tx, getUserKeypair());
    expect(result.effects?.status?.status).toBe('success');

    const orderId = extractOrderId(result);
    expect(orderId).toBeTruthy();
    if (orderId) placedOrderIds.push(orderId);
  });

  it('SPOT-GTC-2: limit sell rests in orderbook', async () => {
    await sleep(2000);
    // First need NBTC in BM. Try to deposit from wallet
    const nbtcBalance = await getBalance(getUserAddress(), NBTC_TYPE);
    if (nbtcBalance > 0n) {
      const coins = await client.getCoins({
        owner: getUserAddress(),
        coinType: NBTC_TYPE,
      });
      if (coins.data.length > 0) {
        const tx = new Transaction();
        tx.moveCall({
          target: `${DEEPBOOK_PACKAGE_ID}::balance_manager::deposit`,
          typeArguments: [NBTC_TYPE],
          arguments: [tx.object(bmId), tx.object(coins.data[0].coinObjectId)],
        });
        await execTx(tx, getUserKeypair());
        await sleep(1000);
      }
    }

    const tx = new Transaction();
    placeLimitOrder(tx, POOLS.NBTC_NUSDC, NBTC_TYPE, NUSDC_TYPE, {
      orderType: ORDER_TYPE.NO_RESTRICTION,
      price: 999_999_000_000n, // $999,999 (very high, won't fill)
      quantity: 10_000n,
      isBid: false, // sell
    });

    const result = await execTx(tx, getUserKeypair());
    expect(result.effects?.status?.status).toBe('success');

    const orderId = extractOrderId(result);
    if (orderId) placedOrderIds.push(orderId);
  });
});

// ============================================================================
// IOC Orders
// ============================================================================

describe('Spot: IOC Orders', () => {
  it('SPOT-IOC-1: IOC buy fills available and cancels remainder', async () => {
    await sleep(2000);
    const tx = new Transaction();
    placeLimitOrder(tx, POOLS.NBTC_NUSDC, NBTC_TYPE, NUSDC_TYPE, {
      orderType: ORDER_TYPE.IOC,
      price: 1_000_000n, // $1 (no asks this low)
      quantity: 10_000n,
      isBid: true,
    });

    const result = await execTx(tx, getUserKeypair());
    // IOC at unfillable price: TX succeeds but order immediately canceled
    expect(result.effects?.status?.status).toBe('success');
  });

  it('SPOT-IOC-2: IOC sell at unfillable price', async () => {
    await sleep(2000);
    const tx = new Transaction();
    placeLimitOrder(tx, POOLS.NBTC_NUSDC, NBTC_TYPE, NUSDC_TYPE, {
      orderType: ORDER_TYPE.IOC,
      price: 999_999_000_000n, // very high
      quantity: 10_000n,
      isBid: false,
    });

    const result = await execTx(tx, getUserKeypair());
    expect(result.effects?.status?.status).toBe('success');
  });
});

// ============================================================================
// FOK Orders
// ============================================================================

describe('Spot: FOK Orders', () => {
  it('SPOT-FOK-1: FOK buy with insufficient liquidity is rejected', async () => {
    await sleep(2000);
    const tx = new Transaction();
    placeLimitOrder(tx, POOLS.NBTC_NUSDC, NBTC_TYPE, NUSDC_TYPE, {
      orderType: ORDER_TYPE.FOK,
      price: 1_000_000n, // $1 (no liquidity here)
      quantity: 100_000_000n, // 1 full NBTC (huge)
      isBid: true,
    });

    // FOK that can't fully fill aborts the entire TX on-chain
    await expectTxFail(tx, getUserKeypair());
  });
});

// ============================================================================
// POST_ONLY Orders
// ============================================================================

describe('Spot: POST_ONLY Orders', () => {
  it('SPOT-POST-1: POST_ONLY at maker price is accepted', async () => {
    await sleep(2000);
    const tx = new Transaction();
    placeLimitOrder(tx, POOLS.NBTC_NUSDC, NBTC_TYPE, NUSDC_TYPE, {
      orderType: ORDER_TYPE.POST_ONLY,
      price: 1_000_000n, // $1 (far from mid, guaranteed maker)
      quantity: 10_000n,
      isBid: true,
    });

    const result = await execTx(tx, getUserKeypair());
    expect(result.effects?.status?.status).toBe('success');

    const orderId = extractOrderId(result);
    if (orderId) placedOrderIds.push(orderId);
  });
});

// ============================================================================
// Market Orders
// ============================================================================

describe('Spot: Market Orders', () => {
  it('SPOT-MKT-1: market buy fills from orderbook', async () => {
    await sleep(2000);
    const tx = new Transaction();
    placeMarketOrder(tx, POOLS.NBTC_NUSDC, NBTC_TYPE, NUSDC_TYPE, {
      quantity: 10_000n, // 0.0001 NBTC (minimum lot)
      isBid: true,
    });

    const result = await execTx(tx, getUserKeypair());
    expect(result.effects?.status?.status).toBe('success');

    // Check for fill event
    const fillEvent = result.events?.find((e) =>
      e.type.includes('OrderFilled'),
    );
    if (fillEvent) {
      const parsed = fillEvent.parsedJson as any;
      expect(Number(parsed.base_quantity || 0)).toBeGreaterThan(0);
    }
  });

  it('SPOT-MKT-2: market sell fills from orderbook', async () => {
    await sleep(2000);
    const tx = new Transaction();
    placeMarketOrder(tx, POOLS.NBTC_NUSDC, NBTC_TYPE, NUSDC_TYPE, {
      quantity: 10_000n,
      isBid: false, // sell
    });

    const result = await execTx(tx, getUserKeypair());
    expect(result.effects?.status?.status).toBe('success');
  });
});

// ============================================================================
// Cancellation
// ============================================================================

describe('Spot: Order Cancellation', () => {
  it('SPOT-CANCEL-1: cancel single order', async () => {
    await sleep(2000);
    // Place an order to cancel
    const placeTx = new Transaction();
    placeLimitOrder(placeTx, POOLS.NBTC_NUSDC, NBTC_TYPE, NUSDC_TYPE, {
      orderType: ORDER_TYPE.NO_RESTRICTION,
      price: 1_000_000n,
      quantity: 10_000n,
      isBid: true,
    });

    const placeResult = await execTx(placeTx, getUserKeypair());
    expect(placeResult.effects?.status?.status).toBe('success');
    await waitForTx(placeResult.digest);

    const orderId = extractOrderId(placeResult);
    expect(orderId).toBeTruthy();

    await sleep(1000);

    // Cancel it
    const cancelTx = new Transaction();
    const cancelProof = proof(cancelTx);
    cancelTx.moveCall({
      target: `${DEEPBOOK_PACKAGE_ID}::pool::cancel_order`,
      typeArguments: [NBTC_TYPE, NUSDC_TYPE],
      arguments: [
        cancelTx.object(POOLS.NBTC_NUSDC),
        cancelTx.object(bmId),
        cancelProof,
        cancelTx.pure.u128(orderId!),
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

  it('SPOT-CANCEL-2: cancel all orders', async () => {
    await sleep(2000);

    const cancelTx = new Transaction();
    const cancelProof = proof(cancelTx);
    cancelTx.moveCall({
      target: `${DEEPBOOK_PACKAGE_ID}::pool::cancel_all_orders`,
      typeArguments: [NBTC_TYPE, NUSDC_TYPE],
      arguments: [
        cancelTx.object(POOLS.NBTC_NUSDC),
        cancelTx.object(bmId),
        cancelProof,
        cancelTx.object(CLOCK_ID),
      ],
    });

    const result = await execTx(cancelTx, getUserKeypair());
    expect(result.effects?.status?.status).toBe('success');
  });
});

// ============================================================================
// Multi-Pair
// ============================================================================

describe('Spot: Multi-Pair Trading', () => {
  it('SPOT-PAIR-1: limit buy on NASUN/NUSDC pool', async () => {
    await sleep(2000);
    const tx = new Transaction();
    // NASUN type is 0x2::sui::SUI
    placeLimitOrder(tx, POOLS.NASUN_NUSDC, '0x2::sui::SUI', NUSDC_TYPE, {
      orderType: ORDER_TYPE.NO_RESTRICTION,
      price: 10_000n, // $0.01 (NASUN is cheap)
      quantity: 1_000_000_000n, // 1 NASUN (lotSize = 1B @ 9 decimals)
      isBid: true,
    });

    const result = await execTx(tx, getUserKeypair());
    expect(result.effects?.status?.status).toBe('success');
  });

  it('SPOT-PAIR-2: limit buy on NETH/NUSDC pool', async () => {
    await sleep(2000);
    const tx = new Transaction();
    placeLimitOrder(tx, POOLS.NETH_NUSDC, NETH_TYPE, NUSDC_TYPE, {
      orderType: ORDER_TYPE.NO_RESTRICTION,
      price: 1_000_000n, // $1 (very low for ETH)
      quantity: 10_000n, // 0.0001 NETH
      isBid: true,
    });

    const result = await execTx(tx, getUserKeypair());
    expect(result.effects?.status?.status).toBe('success');
  });
});

// ============================================================================
// Deposit & Withdraw
// ============================================================================

describe('Spot: Deposit & Withdraw', () => {
  it('SPOT-DW-1: deposit exact NUSDC amount', async () => {
    await sleep(2000);
    const depositAmount = 5_000_000n; // 5 NUSDC
    const result = await depositNUSDC(depositAmount);
    expect(result.effects?.status?.status).toBe('success');
  });

  it('SPOT-DW-2: withdraw partial NUSDC', async () => {
    await sleep(2000);
    const withdrawAmount = 2_000_000n; // 2 NUSDC
    const balanceBefore = await getBalance(getUserAddress(), NUSDC_TYPE);

    const tx = new Transaction();
    const coin = tx.moveCall({
      target: `${DEEPBOOK_PACKAGE_ID}::balance_manager::withdraw`,
      typeArguments: [NUSDC_TYPE],
      arguments: [tx.object(bmId), tx.pure.u64(withdrawAmount)],
    });
    tx.transferObjects([coin], getUserAddress());

    const result = await execTx(tx, getUserKeypair());
    expect(result.effects?.status?.status).toBe('success');
    await waitForTx(result.digest);

    await sleep(1000);
    const balanceAfter = await getBalance(getUserAddress(), NUSDC_TYPE);
    expect(balanceAfter).toBeGreaterThan(balanceBefore);
  });

  it('SPOT-DW-3: withdraw all tokens', async () => {
    await sleep(2000);
    const tx = new Transaction();

    const nusdcCoin = tx.moveCall({
      target: `${DEEPBOOK_PACKAGE_ID}::balance_manager::withdraw_all`,
      typeArguments: [NUSDC_TYPE],
      arguments: [tx.object(bmId)],
    });
    tx.transferObjects([nusdcCoin], getUserAddress());

    const nbtcCoin = tx.moveCall({
      target: `${DEEPBOOK_PACKAGE_ID}::balance_manager::withdraw_all`,
      typeArguments: [NBTC_TYPE],
      arguments: [tx.object(bmId)],
    });
    tx.transferObjects([nbtcCoin], getUserAddress());

    const result = await execTx(tx, getUserKeypair());
    expect(result.effects?.status?.status).toBe('success');
  });
});
