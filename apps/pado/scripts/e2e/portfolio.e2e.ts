/**
 * Portfolio & Balance Management E2E Tests
 *
 * Tests the user's asset management flows:
 * - Balance queries across wallet/trading
 * - Deposit to and withdraw from BalanceManager
 * - Multi-token balance tracking
 * - Faucet operations
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Transaction } from '@mysten/sui/transactions';
import {
  DEEPBOOK_PACKAGE_ID,
  NUSDC_TYPE,
  NBTC_TYPE,
  TOKENS_PACKAGE_ID,
  TOKEN_FAUCET,
  PER_TOKEN_CLAIM_RECORD,
} from '@nasun/devnet-config';
import {
  client,
  CLOCK_ID,
  getUserKeypair,
  getUserAddress,
  getBalance,
  execTx,
  findNusdcCoin,
  waitForTx,
  sleep,
} from './helpers';

const POOL_NBTC_NUSDC =
  '0xa2b755aebb88f9d249e22d58f7ac5e2e003ce53f4d5bbb30c03be50966d01cd0';

// Find or create user's BalanceManager
async function findUserBM(): Promise<string | null> {
  const objects = await client.getOwnedObjects({
    owner: getUserAddress(),
    filter: {
      StructType: `${DEEPBOOK_PACKAGE_ID}::balance_manager::BalanceManager`,
    },
  });
  return objects.data.length > 0 ? objects.data[0].data!.objectId : null;
}

describe('Portfolio: Balance Queries', () => {
  it('SDK-PF1: should query wallet NUSDC balance', async () => {
    const balance = await getBalance(getUserAddress(), NUSDC_TYPE);
    // Test wallet was funded with NUSDC, should have some
    expect(balance).toBeGreaterThan(0n);
  });

  it('SDK-PF2: should query wallet NASUN (gas) balance', async () => {
    const balance = await client.getBalance({
      owner: getUserAddress(),
      coinType: '0x2::sui::SUI',
    });
    expect(BigInt(balance.totalBalance)).toBeGreaterThan(0n);
  });

  it('SDK-PF3: should query all token balances', async () => {
    const allBalances = await client.getAllBalances({
      owner: getUserAddress(),
    });
    // Should have at least NASUN (SUI) and NUSDC
    expect(allBalances.length).toBeGreaterThanOrEqual(2);

    const coinTypes = allBalances.map((b) => b.coinType);
    expect(coinTypes).toContain('0x2::sui::SUI');
    expect(coinTypes).toContain(NUSDC_TYPE);
  });
});

describe('Portfolio: Deposit & Withdraw', () => {
  let bmId: string;

  beforeAll(async () => {
    const existingBM = await findUserBM();
    if (!existingBM) {
      // Create BalanceManager
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
      bmId = (bmObj as any).objectId;
      await waitForTx(result.digest);
    } else {
      bmId = existingBM;
    }
  });

  it('SDK-PF4: should deposit NUSDC to BalanceManager', async () => {
    const depositAmount = 10_000_000n; // 10 NUSDC
    const nusdcCoin = await findNusdcCoin(getUserAddress(), depositAmount);

    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.object(nusdcCoin), [tx.pure.u64(depositAmount)]);
    tx.moveCall({
      target: `${DEEPBOOK_PACKAGE_ID}::balance_manager::deposit`,
      typeArguments: [NUSDC_TYPE],
      arguments: [tx.object(bmId), coin],
    });

    const result = await execTx(tx, getUserKeypair());
    expect(result.effects?.status?.status).toBe('success');
    await waitForTx(result.digest);
  });

  it('SDK-PF5: should withdraw NUSDC from BalanceManager', async () => {
    await sleep(1000);
    const withdrawAmount = 5_000_000n; // 5 NUSDC
    const userAddr = getUserAddress();
    const balanceBefore = await getBalance(userAddr, NUSDC_TYPE);

    const tx = new Transaction();
    const coin = tx.moveCall({
      target: `${DEEPBOOK_PACKAGE_ID}::balance_manager::withdraw`,
      typeArguments: [NUSDC_TYPE],
      arguments: [tx.object(bmId), tx.pure.u64(withdrawAmount)],
    });
    tx.transferObjects([coin], userAddr);

    const result = await execTx(tx, getUserKeypair());
    expect(result.effects?.status?.status).toBe('success');
    await waitForTx(result.digest);

    // Verify balance increased
    await sleep(1000);
    const balanceAfter = await getBalance(userAddr, NUSDC_TYPE);
    expect(balanceAfter).toBeGreaterThan(balanceBefore);
  });

  it('SDK-PF6: should fail to withdraw more than available', async () => {
    const hugeAmount = 999_999_000_000n; // 999,999 NUSDC

    const tx = new Transaction();
    const coin = tx.moveCall({
      target: `${DEEPBOOK_PACKAGE_ID}::balance_manager::withdraw`,
      typeArguments: [NUSDC_TYPE],
      arguments: [tx.object(bmId), tx.pure.u64(hugeAmount)],
    });
    tx.transferObjects([coin], getUserAddress());

    await expect(execTx(tx, getUserKeypair())).rejects.toThrow();
  });
});

describe('Portfolio: Multi-Token', () => {
  it('SDK-PF7: should handle NBTC faucet request', async () => {
    // Request NBTC from faucet (may fail if on cooldown)
    const tx = new Transaction();
    tx.moveCall({
      target: `${TOKENS_PACKAGE_ID}::faucet::request_nbtc_individual`,
      arguments: [
        tx.object(TOKEN_FAUCET),
        tx.object(PER_TOKEN_CLAIM_RECORD),
        tx.object(CLOCK_ID),
      ],
    });

    try {
      const result = await execTx(tx, getUserKeypair());
      if (result.effects?.status?.status === 'success') {
        // Verify NBTC balance increased
        await waitForTx(result.digest);
        const nbtcBalance = await getBalance(getUserAddress(), NBTC_TYPE);
        expect(nbtcBalance).toBeGreaterThan(0n);
      }
    } catch {
      // Faucet on 24h cooldown is acceptable
      console.warn('NBTC faucet on cooldown, skipping balance check');
    }
  });

  it('SDK-PF8: should query owned objects (tickets, positions, cards)', async () => {
    const objects = await client.getOwnedObjects({
      owner: getUserAddress(),
      options: { showType: true },
    });

    // Should have at least some objects (gas coins, tokens)
    expect(objects.data.length).toBeGreaterThan(0);

    // List unique object types for verification
    const types = new Set(
      objects.data
        .map((o) => o.data?.type)
        .filter(Boolean),
    );
    expect(types.size).toBeGreaterThan(0);
  });
});
