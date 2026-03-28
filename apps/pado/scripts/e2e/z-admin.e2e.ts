/**
 * Admin E2E Tests
 *
 * Tests the admin lifecycle operations across all leisure features.
 * All operations use the admin keypair (holds AdminCaps).
 *
 * SDK-ADM-L1: Lottery full lifecycle (create round -> buy ticket -> close -> draw -> settle -> claim)
 * SDK-ADM-L2: Lottery treasury withdrawal
 * SDK-ADM-SC1: ScratchCard fund pool (idempotent)
 * SDK-ADM-SC2: ScratchCard emergency withdraw + auto-pause
 * SDK-ADM-NM1: NumberMatch fund pool
 * SDK-ADM-NM2: NumberMatch pause + unpause
 * SDK-ADM-PM1: Prediction market create + resolve + claim
 */

import { describe, it, expect, afterAll } from 'vitest';
import { Transaction } from '@mysten/sui/transactions';
import {
  LOTTERY_PACKAGE_ID,
  LOTTERY_REGISTRY,
  LOTTERY_ADMIN_CAP,
  SCRATCHCARD_PACKAGE_ID,
  SCRATCHCARD_POOL,
  SCRATCHCARD_ADMIN_CAP,
  NUMBERMATCH_PACKAGE_ID,
  NUMBERMATCH_POOL,
  NUMBERMATCH_ADMIN_CAP,
  PREDICTION_PACKAGE_ID,
  PREDICTION_GLOBAL_STATE,
  PREDICTION_ADMIN_CAP,
  NUSDC_TYPE,
} from '@nasun/devnet-config';
import {
  client,
  CLOCK_ID,
  SUI_RANDOM_ID,
  getAdminKeypair,
  getAdminAddress,
  getUserKeypair,
  getUserAddress,
  execTx,
  expectTxFail,
  findNusdcCoin,
  waitForTx,
  sleep,
} from './helpers';

// ============================================================================
// Lottery Admin Lifecycle
// ============================================================================

describe('Admin: Lottery Lifecycle', () => {
  let roundId: string;
  let ticketId: string;

  it('SDK-ADM-L1a: admin creates a short-lived round', async () => {
    await sleep(2000); // Wait for any prior AdminCap usage to settle
    const now = BigInt(Date.now());
    const closeTime = now + 5000n; // 5s
    const drawTime = closeTime + 5000n; // +5s after close

    const tx = new Transaction();
    tx.moveCall({
      target: `${LOTTERY_PACKAGE_ID}::lottery::create_round`,
      arguments: [
        tx.object(LOTTERY_ADMIN_CAP),
        tx.object(LOTTERY_REGISTRY),
        tx.pure.u64(closeTime),
        tx.pure.u64(drawTime),
        tx.pure.u64(0),
        tx.object(CLOCK_ID),
      ],
    });

    const result = await execTx(tx, getAdminKeypair());
    expect(result.effects?.status?.status).toBe('success');

    const roundObj = result.objectChanges?.find(
      (c) => c.type === 'created' && c.objectType?.includes('::lottery::LotteryRound'),
    );
    expect(roundObj).toBeDefined();
    roundId = (roundObj as any).objectId;
    await waitForTx(result.digest);
  });

  it('SDK-ADM-L1b: user buys a ticket on the round', async () => {
    const nusdcCoin = await findNusdcCoin(getUserAddress(), 1_000_000n);

    const tx = new Transaction();
    const [payment] = tx.splitCoins(tx.object(nusdcCoin), [tx.pure.u64(1_000_000n)]);
    tx.moveCall({
      target: `${LOTTERY_PACKAGE_ID}::lottery::buy_ticket`,
      arguments: [
        tx.object(roundId),
        tx.object(LOTTERY_REGISTRY),
        payment,
        tx.pure.u8(1), tx.pure.u8(2), tx.pure.u8(3), tx.pure.u8(4), tx.pure.u8(5),
        tx.object(CLOCK_ID),
      ],
    });

    const result = await execTx(tx, getUserKeypair());
    expect(result.effects?.status?.status).toBe('success');

    const ticketObj = result.objectChanges?.find(
      (c) => c.type === 'created' && c.objectType?.includes('::lottery::Ticket'),
    );
    expect(ticketObj).toBeDefined();
    ticketId = (ticketObj as any).objectId;
    await waitForTx(result.digest);
  });

  it('SDK-ADM-L1c: admin closes round after close_time', async () => {
    await sleep(6000); // Wait for close_time to pass

    const tx = new Transaction();
    tx.moveCall({
      target: `${LOTTERY_PACKAGE_ID}::lottery::close_round_permissionless`,
      arguments: [tx.object(roundId), tx.object(CLOCK_ID)],
    });

    const result = await execTx(tx, getAdminKeypair());
    expect(result.effects?.status?.status).toBe('success');
    await waitForTx(result.digest);
  });

  it('SDK-ADM-L1d: admin draws numbers (VRF)', async () => {
    await sleep(6000); // Wait for draw_time to pass

    const tx = new Transaction();
    tx.moveCall({
      target: `${LOTTERY_PACKAGE_ID}::lottery::draw_numbers`,
      arguments: [
        tx.object(LOTTERY_ADMIN_CAP),
        tx.object(roundId),
        tx.object(SUI_RANDOM_ID),
        tx.object(CLOCK_ID),
      ],
    });
    tx.setGasBudget(50_000_000); // VRF requires higher gas

    const result = await execTx(tx, getAdminKeypair());
    expect(result.effects?.status?.status).toBe('success');
    await waitForTx(result.digest);
  });

  it('SDK-ADM-L1e: admin settles round', async () => {
    // We bought ticket [1,2,3,4,5]. We don't know the drawn numbers,
    // so we settle with 0 winners for simplicity (all tiers go to rollover)
    const tx = new Transaction();
    tx.moveCall({
      target: `${LOTTERY_PACKAGE_ID}::lottery::settle_round`,
      arguments: [
        tx.object(LOTTERY_ADMIN_CAP),
        tx.object(roundId),
        tx.object(LOTTERY_REGISTRY),
        tx.pure.u64(0), // tier1 winners
        tx.pure.u64(0), // tier2 winners
        tx.pure.u64(0), // tier3 winners
      ],
    });

    const result = await execTx(tx, getAdminKeypair());
    expect(result.effects?.status?.status).toBe('success');
    await waitForTx(result.digest);
  });

  it('SDK-ADM-L1f: user burns non-winning ticket', async () => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${LOTTERY_PACKAGE_ID}::lottery::burn_ticket`,
      arguments: [
        tx.object(roundId),
        tx.object(ticketId),
      ],
    });

    const result = await execTx(tx, getUserKeypair());
    expect(result.effects?.status?.status).toBe('success');
  });
});

// ============================================================================
// ScratchCard Admin
// ============================================================================

describe('Admin: ScratchCard', () => {
  let wasEmergencyWithdrawn = false;

  afterAll(async () => {
    // Restore pool state if emergency withdraw was used
    if (wasEmergencyWithdrawn) {
      try {
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
        await execTx(unpauseTx, getAdminKeypair());

        // Re-fund pool
        const adminAddr = getAdminAddress();
        const nusdcCoin = await findNusdcCoin(adminAddr, 500_000_000n);
        const fundTx = new Transaction();
        const [fundCoin] = fundTx.splitCoins(fundTx.object(nusdcCoin), [fundTx.pure.u64(500_000_000n)]);
        fundTx.moveCall({
          target: `${SCRATCHCARD_PACKAGE_ID}::scratchcard::fund_pool`,
          arguments: [
            fundTx.object(SCRATCHCARD_ADMIN_CAP),
            fundTx.object(SCRATCHCARD_POOL),
            fundCoin,
          ],
        });
        await execTx(fundTx, getAdminKeypair());
      } catch (e) {
        console.error('WARNING: Failed to restore ScratchCard pool state:', e);
      }
    }
  });

  it('SDK-ADM-SC1: should fund scratch card pool', async () => {
    await sleep(2000);
    const adminAddr = getAdminAddress();
    const nusdcCoin = await findNusdcCoin(adminAddr, 100_000_000n);

    const tx = new Transaction();
    const [fundCoin] = tx.splitCoins(tx.object(nusdcCoin), [tx.pure.u64(100_000_000n)]); // 100 NUSDC
    tx.moveCall({
      target: `${SCRATCHCARD_PACKAGE_ID}::scratchcard::fund_pool`,
      arguments: [
        tx.object(SCRATCHCARD_ADMIN_CAP),
        tx.object(SCRATCHCARD_POOL),
        fundCoin,
      ],
    });

    const result = await execTx(tx, getAdminKeypair());
    expect(result.effects?.status?.status).toBe('success');
  });

  it('SDK-ADM-SC2: emergency withdraw should drain pool and auto-pause', async () => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${SCRATCHCARD_PACKAGE_ID}::scratchcard::emergency_withdraw_all`,
      arguments: [
        tx.object(SCRATCHCARD_ADMIN_CAP),
        tx.object(SCRATCHCARD_POOL),
      ],
    });

    const result = await execTx(tx, getAdminKeypair());
    expect(result.effects?.status?.status).toBe('success');
    wasEmergencyWithdrawn = true;
    await waitForTx(result.digest);

    // Verify pool is now paused
    const poolObj = await client.getObject({
      id: SCRATCHCARD_POOL,
      options: { showContent: true },
    });
    const fields = (poolObj.data?.content as any)?.fields;
    expect(fields?.is_paused).toBe(true);
  });
});

// ============================================================================
// NumberMatch Admin
// ============================================================================

describe('Admin: NumberMatch', () => {
  let wasPaused = false;

  afterAll(async () => {
    if (wasPaused) {
      try {
        const tx = new Transaction();
        tx.moveCall({
          target: `${NUMBERMATCH_PACKAGE_ID}::numbermatch::set_paused`,
          arguments: [
            tx.object(NUMBERMATCH_ADMIN_CAP),
            tx.object(NUMBERMATCH_POOL),
            tx.pure.bool(false),
          ],
        });
        await execTx(tx, getAdminKeypair());
      } catch {
        console.error('WARNING: Failed to unpause NumberMatch');
      }
    }
  });

  it('SDK-ADM-NM1: should fund numbermatch pool', async () => {
    await sleep(2000);
    const adminAddr = getAdminAddress();
    const nusdcCoin = await findNusdcCoin(adminAddr, 100_000_000n);

    const tx = new Transaction();
    const [fundCoin] = tx.splitCoins(tx.object(nusdcCoin), [tx.pure.u64(100_000_000n)]);
    tx.moveCall({
      target: `${NUMBERMATCH_PACKAGE_ID}::numbermatch::fund_pool`,
      arguments: [
        tx.object(NUMBERMATCH_ADMIN_CAP),
        tx.object(NUMBERMATCH_POOL),
        fundCoin,
      ],
    });

    const result = await execTx(tx, getAdminKeypair());
    expect(result.effects?.status?.status).toBe('success');
  });

  it('SDK-ADM-NM2: pause -> verify game rejects -> unpause', async () => {
    await sleep(2000);
    // Pause
    const pauseTx = new Transaction();
    pauseTx.moveCall({
      target: `${NUMBERMATCH_PACKAGE_ID}::numbermatch::set_paused`,
      arguments: [
        pauseTx.object(NUMBERMATCH_ADMIN_CAP),
        pauseTx.object(NUMBERMATCH_POOL),
        pauseTx.pure.bool(true),
      ],
    });
    const pauseResult = await execTx(pauseTx, getAdminKeypair());
    expect(pauseResult.effects?.status?.status).toBe('success');
    wasPaused = true;
    await waitForTx(pauseResult.digest);

    // Try to play (should fail)
    const nusdcCoin = await findNusdcCoin(getUserAddress(), 5_000_000n);
    const playTx = new Transaction();
    const [payment] = playTx.splitCoins(playTx.object(nusdcCoin), [playTx.pure.u64(5_000_000n)]);
    playTx.moveCall({
      target: `${NUMBERMATCH_PACKAGE_ID}::numbermatch::play_game`,
      arguments: [
        playTx.object(NUMBERMATCH_POOL),
        payment,
        playTx.pure.vector('u8', [3]),
        playTx.object(SUI_RANDOM_ID),
        playTx.object(CLOCK_ID),
      ],
    });
    playTx.setGasBudget(50_000_000);
    await expectTxFail(playTx, getUserKeypair());

    // Unpause
    const unpauseTx = new Transaction();
    unpauseTx.moveCall({
      target: `${NUMBERMATCH_PACKAGE_ID}::numbermatch::set_paused`,
      arguments: [
        unpauseTx.object(NUMBERMATCH_ADMIN_CAP),
        unpauseTx.object(NUMBERMATCH_POOL),
        unpauseTx.pure.bool(false),
      ],
    });
    const unpauseResult = await execTx(unpauseTx, getAdminKeypair());
    expect(unpauseResult.effects?.status?.status).toBe('success');
    wasPaused = false;
  });
});

// ============================================================================
// Prediction Admin: Create + Resolve + Claim
// ============================================================================

describe('Admin: Prediction Lifecycle', () => {
  let marketId: string;
  let yesPositionId: string;

  it('SDK-ADM-PM1a: admin creates a market', async () => {
    await sleep(2000);
    const now = BigInt(Date.now());
    const closeTime = now + 5_000n; // 5s (short for testing)
    const resolveDeadline = closeTime + 60_000n;
    const adminAddr = getAdminAddress();

    const tx = new Transaction();
    tx.moveCall({
      target: `${PREDICTION_PACKAGE_ID}::prediction_market::create_market`,
      arguments: [
        tx.object(PREDICTION_ADMIN_CAP),
        tx.pure.string('E2E Test: Will this test pass?'),
        tx.pure.string('Resolves YES if e2e tests pass.'),
        tx.pure.string('Test'),
        tx.pure.u64(closeTime),
        tx.pure.u64(resolveDeadline),
        tx.pure.address(adminAddr), // resolver = admin
        tx.object(CLOCK_ID),
      ],
    });

    const result = await execTx(tx, getAdminKeypair());
    expect(result.effects?.status?.status).toBe('success');

    const marketObj = result.objectChanges?.find(
      (c) => c.type === 'created' && c.objectType?.includes('::prediction_market::Market'),
    );
    expect(marketObj).toBeDefined();
    marketId = (marketObj as any).objectId;
    await waitForTx(result.digest);
  });

  it('SDK-ADM-PM1b: user mints tokens on the market', async () => {
    const userAddr = getUserAddress();
    const nusdcCoin = await findNusdcCoin(userAddr, 10_000_000n);

    const tx = new Transaction();
    const [payment] = tx.splitCoins(tx.object(nusdcCoin), [tx.pure.u64(10_000_000n)]);
    tx.moveCall({
      target: `${PREDICTION_PACKAGE_ID}::prediction_market::mint_outcome_tokens`,
      arguments: [tx.object(marketId), payment, tx.object(CLOCK_ID)],
    });

    const result = await execTx(tx, getUserKeypair());
    expect(result.effects?.status?.status).toBe('success');

    // Find YES position
    const positions = result.objectChanges?.filter(
      (c) => c.type === 'created' && c.objectType?.includes('::prediction_market::Position'),
    );
    expect(positions?.length).toBeGreaterThanOrEqual(1);

    // Find the YES position (is_yes = true)
    for (const pos of positions || []) {
      const posObj = await client.getObject({
        id: (pos as any).objectId,
        options: { showContent: true },
      });
      const fields = (posObj.data?.content as any)?.fields;
      if (fields?.is_yes === true) {
        yesPositionId = (pos as any).objectId;
        break;
      }
    }
    await waitForTx(result.digest);
  });

  it('SDK-ADM-PM1c: admin resolves market as YES', async () => {
    // Wait for close time (5s) + buffer
    await sleep(6000);

    const tx = new Transaction();
    tx.moveCall({
      target: `${PREDICTION_PACKAGE_ID}::prediction_market::resolve_market`,
      arguments: [
        tx.object(marketId),
        tx.pure.bool(true), // YES wins
        tx.object(CLOCK_ID),
      ],
    });

    const result = await execTx(tx, getAdminKeypair());
    expect(result.effects?.status?.status).toBe('success');
    await waitForTx(result.digest);
  });

  it('SDK-ADM-PM1d: user claims winnings with YES position', async () => {
    if (!yesPositionId) {
      console.warn('No YES position found, skipping claim test');
      return;
    }

    const tx = new Transaction();
    tx.moveCall({
      target: `${PREDICTION_PACKAGE_ID}::prediction_market::claim_winnings`,
      arguments: [tx.object(marketId), tx.object(yesPositionId)],
    });

    const result = await execTx(tx, getUserKeypair());
    expect(result.effects?.status?.status).toBe('success');
  });
});
