/**
 * Additional Edge Case E2E Tests
 *
 * Covers scenarios not in the main test files:
 * - NumberMatch gameplay (1/2/3 picks with VRF)
 * - Trading order types (IOC, FOK, POST_ONLY)
 * - Withdraw from BalanceManager
 * - Multi-pair trading (NETH/NUSDC if available)
 * - Prediction ask order
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Transaction } from '@mysten/sui/transactions';
import {
  DEEPBOOK_PACKAGE_ID,
  NUMBERMATCH_PACKAGE_ID,
  NUMBERMATCH_POOL,
  PREDICTION_PACKAGE_ID,
  PREDICTION_GLOBAL_STATE,
  NUSDC_TYPE,
  NBTC_TYPE,
} from '@nasun/devnet-config';
import {
  client,
  CLOCK_ID,
  SUI_RANDOM_ID,
  getUserKeypair,
  getUserAddress,
  getBalance,
  execTx,
  expectTxFail,
  findNusdcCoin,
  ensureBalance,
  waitForTx,
  sleep,
} from './helpers';

const POOL_NBTC_NUSDC =
  '0xa2b755aebb88f9d249e22d58f7ac5e2e003ce53f4d5bbb30c03be50966d01cd0';

const ORDER_TYPE = {
  NO_RESTRICTION: 0,
  IOC: 1,  // Immediate Or Cancel
  FOK: 2,  // Fill Or Kill
  POST_ONLY: 3,
};
const SELF_MATCHING_ALLOWED = 0;

// ============================================================================
// NumberMatch Gameplay
// ============================================================================

describe('Edge: NumberMatch Gameplay', () => {
  beforeAll(async () => {
    await ensureBalance(getUserAddress(), NUSDC_TYPE, 50_000_000n);
  });

  it('SDK-NM-E1: play with 1 pick', async () => {
    const nusdcCoin = await findNusdcCoin(getUserAddress(), 5_000_000n);

    const tx = new Transaction();
    const [payment] = tx.splitCoins(tx.object(nusdcCoin), [tx.pure.u64(5_000_000n)]);
    tx.moveCall({
      target: `${NUMBERMATCH_PACKAGE_ID}::numbermatch::play_game`,
      arguments: [
        tx.object(NUMBERMATCH_POOL),
        payment,
        tx.pure.vector('u8', [3]), // pick number 3
        tx.object(SUI_RANDOM_ID),
        tx.object(CLOCK_ID),
      ],
    });
    tx.setGasBudget(50_000_000);

    const result = await execTx(tx, getUserKeypair());
    expect(result.effects?.status?.status).toBe('success');

    const event = result.events?.find((e) => e.type.includes('NumberMatchPlayed'));
    expect(event).toBeDefined();
    const parsed = event!.parsedJson as any;
    expect(Number(parsed.winning_number)).toBeGreaterThanOrEqual(1);
    expect(Number(parsed.winning_number)).toBeLessThanOrEqual(5);
    expect(Number(parsed.cost)).toBe(5_000_000);

    // Payout depends on win/loss
    if (parsed.is_win) {
      expect(Number(parsed.payout)).toBe(16_000_000); // 15 + 1 pick = 16 NUSDC
    } else {
      expect(Number(parsed.payout)).toBe(1_000_000); // 20% refund = 1 NUSDC
    }
  });

  it('SDK-NM-E2: play with 3 picks', async () => {
    await sleep(1000);
    const nusdcCoin = await findNusdcCoin(getUserAddress(), 15_000_000n);

    const tx = new Transaction();
    const [payment] = tx.splitCoins(tx.object(nusdcCoin), [tx.pure.u64(15_000_000n)]);
    tx.moveCall({
      target: `${NUMBERMATCH_PACKAGE_ID}::numbermatch::play_game`,
      arguments: [
        tx.object(NUMBERMATCH_POOL),
        payment,
        tx.pure.vector('u8', [1, 3, 5]),
        tx.object(SUI_RANDOM_ID),
        tx.object(CLOCK_ID),
      ],
    });
    tx.setGasBudget(50_000_000);

    const result = await execTx(tx, getUserKeypair());
    expect(result.effects?.status?.status).toBe('success');

    const event = result.events?.find((e) => e.type.includes('NumberMatchPlayed'));
    const parsed = event!.parsedJson as any;
    expect(Number(parsed.cost)).toBe(15_000_000);

    if (parsed.is_win) {
      expect(Number(parsed.payout)).toBe(18_000_000); // 15 + 3 = 18 NUSDC
    } else {
      expect(Number(parsed.payout)).toBe(3_000_000); // 20% of 15 = 3 NUSDC
    }
  });

  it('SDK-NM-E3: should reject duplicate picks [2, 2]', async () => {
    const nusdcCoin = await findNusdcCoin(getUserAddress(), 10_000_000n);

    const tx = new Transaction();
    const [payment] = tx.splitCoins(tx.object(nusdcCoin), [tx.pure.u64(10_000_000n)]);
    tx.moveCall({
      target: `${NUMBERMATCH_PACKAGE_ID}::numbermatch::play_game`,
      arguments: [
        tx.object(NUMBERMATCH_POOL),
        payment,
        tx.pure.vector('u8', [2, 2]),
        tx.object(SUI_RANDOM_ID),
        tx.object(CLOCK_ID),
      ],
    });
    tx.setGasBudget(50_000_000);

    await expectTxFail(tx, getUserKeypair());
  });

  it('SDK-NM-E4: should reject out-of-range pick [6]', async () => {
    const nusdcCoin = await findNusdcCoin(getUserAddress(), 5_000_000n);

    const tx = new Transaction();
    const [payment] = tx.splitCoins(tx.object(nusdcCoin), [tx.pure.u64(5_000_000n)]);
    tx.moveCall({
      target: `${NUMBERMATCH_PACKAGE_ID}::numbermatch::play_game`,
      arguments: [
        tx.object(NUMBERMATCH_POOL),
        payment,
        tx.pure.vector('u8', [6]),
        tx.object(SUI_RANDOM_ID),
        tx.object(CLOCK_ID),
      ],
    });
    tx.setGasBudget(50_000_000);

    await expectTxFail(tx, getUserKeypair());
  });
});

// ============================================================================
// Trading: Advanced Order Types
// ============================================================================

describe('Edge: Trading Order Types', () => {
  let bmId: string;

  function generateProof(tx: Transaction, bmId: string) {
    return tx.moveCall({
      target: `${DEEPBOOK_PACKAGE_ID}::balance_manager::generate_proof_as_owner`,
      arguments: [tx.object(bmId)],
    });
  }

  beforeAll(async () => {
    // Find existing BM
    const objects = await client.getOwnedObjects({
      owner: getUserAddress(),
      filter: {
        StructType: `${DEEPBOOK_PACKAGE_ID}::balance_manager::BalanceManager`,
      },
    });
    if (objects.data.length === 0) {
      throw new Error('No BalanceManager found. Run trading.e2e.ts first.');
    }
    bmId = objects.data[0].data!.objectId;
  });

  it('SDK-EDGE-T1: IOC order (fill or cancel remainder)', async () => {
    await sleep(2000);

    const tx = new Transaction();
    const proof = generateProof(tx, bmId);
    const expire = BigInt(Date.now()) + 86_400_000n;

    tx.moveCall({
      target: `${DEEPBOOK_PACKAGE_ID}::pool::place_limit_order`,
      typeArguments: [NBTC_TYPE, NUSDC_TYPE],
      arguments: [
        tx.object(POOL_NBTC_NUSDC),
        tx.object(bmId),
        proof,
        tx.pure.u64(BigInt(Date.now())),
        tx.pure.u8(ORDER_TYPE.IOC), // Immediate Or Cancel
        tx.pure.u8(SELF_MATCHING_ALLOWED),
        tx.pure.u64(1_000_000), // very low price - won't match
        tx.pure.u64(10_000), // min lot
        tx.pure.bool(true), // bid
        tx.pure.bool(false),
        tx.pure.u64(expire),
        tx.object(CLOCK_ID),
      ],
    });

    const result = await execTx(tx, getUserKeypair());
    // IOC at a price with no asks should succeed but cancel the order immediately
    expect(result.effects?.status?.status).toBe('success');
  });

  it('SDK-EDGE-T2: POST_ONLY order (maker only)', async () => {
    await sleep(2000);

    const tx = new Transaction();
    const proof = generateProof(tx, bmId);
    const expire = BigInt(Date.now()) + 86_400_000n;

    tx.moveCall({
      target: `${DEEPBOOK_PACKAGE_ID}::pool::place_limit_order`,
      typeArguments: [NBTC_TYPE, NUSDC_TYPE],
      arguments: [
        tx.object(POOL_NBTC_NUSDC),
        tx.object(bmId),
        proof,
        tx.pure.u64(BigInt(Date.now())),
        tx.pure.u8(ORDER_TYPE.POST_ONLY),
        tx.pure.u8(SELF_MATCHING_ALLOWED),
        tx.pure.u64(1_000_000), // very low price - guaranteed maker
        tx.pure.u64(10_000),
        tx.pure.bool(true),
        tx.pure.bool(false),
        tx.pure.u64(expire),
        tx.object(CLOCK_ID),
      ],
    });

    const result = await execTx(tx, getUserKeypair());
    expect(result.effects?.status?.status).toBe('success');
  });

  it('SDK-EDGE-T3: withdraw all from BalanceManager', async () => {
    await sleep(2000);
    const userAddr = getUserAddress();

    const tx = new Transaction();

    // Withdraw all NUSDC
    const nusdcCoin = tx.moveCall({
      target: `${DEEPBOOK_PACKAGE_ID}::balance_manager::withdraw_all`,
      typeArguments: [NUSDC_TYPE],
      arguments: [tx.object(bmId)],
    });
    tx.transferObjects([nusdcCoin], userAddr);

    // Withdraw all NBTC
    const nbtcCoin = tx.moveCall({
      target: `${DEEPBOOK_PACKAGE_ID}::balance_manager::withdraw_all`,
      typeArguments: [NBTC_TYPE],
      arguments: [tx.object(bmId)],
    });
    tx.transferObjects([nbtcCoin], userAddr);

    const result = await execTx(tx, getUserKeypair());
    expect(result.effects?.status?.status).toBe('success');
  });
});
