/**
 * Scratch Card E2E Tests
 *
 * SDK-SC1: Buy a scratch card (VRF instant result)
 * SDK-SC2: Buy when pool is paused (admin pause -> user buy -> admin unpause)
 *
 * VRF PTB constraint: Random(0x8) requires single MoveCall per PTB.
 * splitCoins is a native PTB command (not MoveCall), so it's OK.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Transaction } from '@mysten/sui/transactions';
import {
  SCRATCHCARD_PACKAGE_ID,
  SCRATCHCARD_POOL,
  SCRATCHCARD_ADMIN_CAP,
  NUSDC_TYPE,
} from '@nasun/devnet-config';
import {
  CLOCK_ID,
  SUI_RANDOM_ID,
  getUserKeypair,
  getUserAddress,
  getAdminKeypair,
  execTx,
  expectTxFail,
  ensureBalance,
  findNusdcCoin,
  waitForTx,
} from './helpers';

const CARD_PRICE = 1_000_000n; // 1 NUSDC
const VALID_MULTIPLIERS = [0, 1, 2, 5, 10, 20, 50, 100];
const GAS_BUDGET = 50_000_000; // VRF requires higher gas

function buildBuyScratchCard(nusdcCoinId: string): Transaction {
  const tx = new Transaction();
  const [payment] = tx.splitCoins(tx.object(nusdcCoinId), [
    tx.pure.u64(CARD_PRICE),
  ]);
  tx.moveCall({
    target: `${SCRATCHCARD_PACKAGE_ID}::scratchcard::buy_scratch_card`,
    arguments: [
      tx.object(SCRATCHCARD_POOL),
      payment,
      tx.object(SUI_RANDOM_ID),
      tx.object(CLOCK_ID),
    ],
  });
  tx.setGasBudget(GAS_BUDGET);
  return tx;
}

describe('ScratchCard', () => {
  let poolWasPaused = false;

  beforeAll(async () => {
    await ensureBalance(getUserAddress(), NUSDC_TYPE, CARD_PRICE * 5n);
  });

  // Guarantee unpause even if tests fail
  afterAll(async () => {
    if (poolWasPaused) {
      try {
        const tx = new Transaction();
        tx.moveCall({
          target: `${SCRATCHCARD_PACKAGE_ID}::scratchcard::set_paused`,
          arguments: [
            tx.object(SCRATCHCARD_ADMIN_CAP),
            tx.object(SCRATCHCARD_POOL),
            tx.pure.bool(false),
          ],
        });
        await execTx(tx, getAdminKeypair());
      } catch {
        console.error('WARNING: Failed to unpause ScratchCard pool in cleanup');
      }
    }
  });

  it('SDK-SC1: should buy a scratch card and get valid result', async () => {
    const nusdcCoin = await findNusdcCoin(getUserAddress(), CARD_PRICE);
    const tx = buildBuyScratchCard(nusdcCoin);
    const result = await execTx(tx, getUserKeypair());

    expect(result.effects?.status?.status).toBe('success');

    // Verify ScratchCardPurchased event
    const event = result.events?.find((e) =>
      e.type.includes('ScratchCardPurchased'),
    );
    expect(event).toBeDefined();

    const parsed = event!.parsedJson as any;
    expect(parsed.buyer).toBe(getUserAddress());

    // Multiplier must be one of the valid values
    const multiplier = Number(parsed.multiplier);
    expect(VALID_MULTIPLIERS).toContain(multiplier);

    // Prize amount = CARD_PRICE * multiplier
    const expectedPrize = BigInt(multiplier) * CARD_PRICE;
    expect(BigInt(parsed.prize_amount)).toBe(expectedPrize);
  });

  it('SDK-SC2: should reject purchase when pool is paused', async () => {
    const admin = getAdminKeypair();

    // Pause the pool
    const pauseTx = new Transaction();
    pauseTx.moveCall({
      target: `${SCRATCHCARD_PACKAGE_ID}::scratchcard::set_paused`,
      arguments: [
        pauseTx.object(SCRATCHCARD_ADMIN_CAP),
        pauseTx.object(SCRATCHCARD_POOL),
        pauseTx.pure.bool(true),
      ],
    });
    const pauseResult = await execTx(pauseTx, admin);
    expect(pauseResult.effects?.status?.status).toBe('success');
    poolWasPaused = true;
    await waitForTx(pauseResult.digest);

    // Try to buy (should fail)
    const nusdcCoin = await findNusdcCoin(getUserAddress(), CARD_PRICE);
    const buyTx = buildBuyScratchCard(nusdcCoin);
    await expectTxFail(buyTx, getUserKeypair());

    // Unpause
    const unpauseTx = new Transaction();
    unpauseTx.moveCall({
      target: `${SCRATCHCARD_PACKAGE_ID}::scratchcard::set_paused`,
      arguments: [
        unpauseTx.object(SCRATCHCARD_ADMIN_CAP),
        unpauseTx.object(SCRATCHCARD_POOL),
        unpauseTx.pure.bool(false),
      ],
    });
    const unpauseResult = await execTx(unpauseTx, admin);
    expect(unpauseResult.effects?.status?.status).toBe('success');
    poolWasPaused = false;
  });
});
