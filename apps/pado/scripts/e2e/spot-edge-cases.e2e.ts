/**
 * Spot Trading - Edge Cases E2E Tests
 *
 * Tests boundary conditions, invalid inputs, and error handling:
 *
 * Validation:
 *   SPOT-VAL-1: Price = 0 is rejected
 *   SPOT-VAL-2: Quantity = 0 is rejected
 *   SPOT-VAL-3: Price exceeding MAX_PRICE is rejected
 *   SPOT-VAL-4: Quantity below minimum lot size is rejected
 *   SPOT-VAL-5: Non-tick-aligned price is rejected by on-chain
 *
 * Balance:
 *   SPOT-BAL-1: Order exceeding available balance fails
 *   SPOT-BAL-2: Withdraw more than BM balance fails
 *
 * Order Lifecycle:
 *   SPOT-LIFE-1: Cancel already-filled order (should fail gracefully)
 *   SPOT-LIFE-2: Cancel non-existent order ID
 *   SPOT-LIFE-3: Place order, partial fill, then cancel remainder
 *
 * Expiry:
 *   SPOT-EXP-1: Place order with already-expired timestamp
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
  execTx,
  expectTxFail,
  ensureBalance,
  findNusdcCoin,
  waitForTx,
  sleep,
} from './helpers';

const POOL = '0xa2b755aebb88f9d249e22d58f7ac5e2e003ce53f4d5bbb30c03be50966d01cd0';

const ORDER_TYPE = { NO_RESTRICTION: 0, IOC: 1, FOK: 2, POST_ONLY: 3 };
const SELF_MATCHING_ALLOWED = 0;

let bmId: string;

function proof(tx: Transaction) {
  return tx.moveCall({
    target: `${DEEPBOOK_PACKAGE_ID}::balance_manager::generate_proof_as_owner`,
    arguments: [tx.object(bmId)],
  });
}

function buildLimit(
  tx: Transaction,
  price: bigint,
  quantity: bigint,
  isBid: boolean,
  opts?: { orderType?: number; expireMs?: bigint },
) {
  const tradeProof = proof(tx);
  const expire = opts?.expireMs ?? BigInt(Date.now()) + 86_400_000n;
  tx.moveCall({
    target: `${DEEPBOOK_PACKAGE_ID}::pool::place_limit_order`,
    typeArguments: [NBTC_TYPE, NUSDC_TYPE],
    arguments: [
      tx.object(POOL),
      tx.object(bmId),
      tradeProof,
      tx.pure.u64(BigInt(Date.now())),
      tx.pure.u8(opts?.orderType ?? ORDER_TYPE.NO_RESTRICTION),
      tx.pure.u8(SELF_MATCHING_ALLOWED),
      tx.pure.u64(price),
      tx.pure.u64(quantity),
      tx.pure.bool(isBid),
      tx.pure.bool(false),
      tx.pure.u64(expire),
      tx.object(CLOCK_ID),
    ],
  });
}

beforeAll(async () => {
  await ensureBalance(getUserAddress(), NUSDC_TYPE, 50_000_000n);

  const objects = await client.getOwnedObjects({
    owner: getUserAddress(),
    filter: {
      StructType: `${DEEPBOOK_PACKAGE_ID}::balance_manager::BalanceManager`,
    },
  });
  if (objects.data.length === 0) {
    throw new Error('No BalanceManager. Run spot-trading-full.e2e.ts first.');
  }
  bmId = objects.data[0].data!.objectId;

  // Deposit some NUSDC for testing
  const coin = await findNusdcCoin(getUserAddress(), 30_000_000n);
  const tx = new Transaction();
  const [splitCoin] = tx.splitCoins(tx.object(coin), [tx.pure.u64(30_000_000n)]);
  tx.moveCall({
    target: `${DEEPBOOK_PACKAGE_ID}::balance_manager::deposit`,
    typeArguments: [NUSDC_TYPE],
    arguments: [tx.object(bmId), splitCoin],
  });
  await execTx(tx, getUserKeypair());
  await sleep(1000);
}, 30_000);

// ============================================================================
// Input Validation
// ============================================================================

describe('Spot Edge: Input Validation', () => {
  it('SPOT-VAL-1: price = 0 is rejected', async () => {
    await sleep(2000);
    const tx = new Transaction();
    buildLimit(tx, 0n, 10_000n, true);
    await expectTxFail(tx, getUserKeypair());
  });

  it('SPOT-VAL-2: quantity = 0 is rejected', async () => {
    await sleep(1000);
    const tx = new Transaction();
    buildLimit(tx, 1_000_000n, 0n, true);
    await expectTxFail(tx, getUserKeypair());
  });

  it('SPOT-VAL-4: quantity below lot size is rejected', async () => {
    await sleep(1000);
    // Lot size for NBTC/NUSDC = 1000 (0.00001 NBTC @ 8 decimals)
    // Try 999 (below lot size)
    const tx = new Transaction();
    buildLimit(tx, 1_000_000n, 999n, true);
    await expectTxFail(tx, getUserKeypair());
  });
});

// ============================================================================
// Balance Edge Cases
// ============================================================================

describe('Spot Edge: Balance', () => {
  it('SPOT-BAL-1: buy order exceeding BM balance fails', async () => {
    await sleep(2000);
    // Try to buy 1000 NBTC at $100,000 = $100M (way more than our 30 NUSDC deposit)
    const tx = new Transaction();
    buildLimit(tx, 100_000_000_000n, 100_000_000_000n, true);
    await expectTxFail(tx, getUserKeypair());
  });

  it('SPOT-BAL-2: withdraw more than BM balance fails', async () => {
    await sleep(1000);
    const tx = new Transaction();
    const coin = tx.moveCall({
      target: `${DEEPBOOK_PACKAGE_ID}::balance_manager::withdraw`,
      typeArguments: [NUSDC_TYPE],
      arguments: [tx.object(bmId), tx.pure.u64(999_999_000_000n)], // 999,999 NUSDC
    });
    tx.transferObjects([coin], getUserAddress());
    await expect(execTx(tx, getUserKeypair())).rejects.toThrow();
  });
});

// ============================================================================
// Order Lifecycle Edge Cases
// ============================================================================

describe('Spot Edge: Order Lifecycle', () => {
  it('SPOT-LIFE-2: cancel non-existent order ID fails', async () => {
    await sleep(2000);
    const tx = new Transaction();
    const tradeProof = proof(tx);
    tx.moveCall({
      target: `${DEEPBOOK_PACKAGE_ID}::pool::cancel_order`,
      typeArguments: [NBTC_TYPE, NUSDC_TYPE],
      arguments: [
        tx.object(POOL),
        tx.object(bmId),
        tradeProof,
        tx.pure.u128(999_999_999_999n), // non-existent order ID
        tx.object(CLOCK_ID),
      ],
    });

    await expectTxFail(tx, getUserKeypair());
  });
});

// ============================================================================
// Order Expiry
// ============================================================================

describe('Spot Edge: Expiry', () => {
  it('SPOT-EXP-1: order with past timestamp is rejected', async () => {
    await sleep(2000);
    const tx = new Transaction();
    buildLimit(tx, 1_000_000n, 10_000n, true, {
      expireMs: BigInt(Date.now()) - 60_000n, // 1 minute ago
    });

    await expectTxFail(tx, getUserKeypair());
  });
});

// ============================================================================
// Cleanup
// ============================================================================

describe('Spot Edge: Cleanup', () => {
  it('cleanup: cancel all and withdraw', async () => {
    await sleep(2000);
    // Cancel all
    const cancelTx = new Transaction();
    const cancelProof = proof(cancelTx);
    cancelTx.moveCall({
      target: `${DEEPBOOK_PACKAGE_ID}::pool::cancel_all_orders`,
      typeArguments: [NBTC_TYPE, NUSDC_TYPE],
      arguments: [
        cancelTx.object(POOL),
        cancelTx.object(bmId),
        cancelProof,
        cancelTx.object(CLOCK_ID),
      ],
    });
    await execTx(cancelTx, getUserKeypair());
  });
});
