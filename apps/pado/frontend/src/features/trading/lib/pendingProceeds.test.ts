/**
 * Pending proceeds tests
 *
 * The decoding is the load-bearing part: a wrong offset would report a user's
 * stranded maker proceeds as zero, which is the exact failure this module exists
 * to prevent.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const BM_ID = '0x' + '3'.repeat(64);

// vi.mock factories are hoisted, so they cannot close over top-level constants.
vi.mock('../../../config/network', () => {
  const pkg = '0x' + '1'.repeat(64);
  return {
    NETWORK_CONFIG: { deepbookPackage: pkg },
    POOLS: {
      NBTC_NUSDC: {
        id: '0x' + '2'.repeat(64),
        baseToken: { symbol: 'NBTC', decimals: 8, type: pkg + '::nbtc::NBTC' },
        quoteToken: { symbol: 'NUSDC', decimals: 6, type: pkg + '::nusdc::NUSDC' },
        tickSize: 100000,
        lotSize: 1000,
        makerFeeBps: 1.5,
        takerFeeBps: 4,
      },
    },
  };
});

const devInspect = vi.fn();
vi.mock('../../../lib/sui-client', () => ({
  getSuiClient: () => ({ devInspectTransactionBlock: devInspect }),
}));

import {
  getPendingProceeds,
  buildClaimPendingProceeds,
  buildClaimAcrossManagers,
  type PendingProceeds,
} from './pendingProceeds';
import { POOLS } from '../../../config/network';
import type { PoolConfig } from '../types';
import type { Transaction } from '@mysten/sui/transactions';

/** u64 little-endian, the encoding devInspect returns for return values */
function u64(value: bigint): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < 8; i++) bytes.push(Number((value >> BigInt(i * 8)) & 0xffn));
  return bytes;
}

function inspectResult(openOrders: number[], base: bigint, quote: bigint, deep = 0n) {
  return {
    results: [
      { returnValues: [[openOrders, '0x2::vec_set::VecSet<u128>']] },
      {
        returnValues: [
          [u64(base), 'u64'],
          [u64(quote), 'u64'],
          [u64(deep), 'u64'],
        ],
      },
    ],
  };
}

beforeEach(() => devInspect.mockClear());

describe('getPendingProceeds', () => {
  it('reports settled proceeds when the account has no working orders', async () => {
    devInspect.mockResolvedValue(inspectResult([0], 25_680_000n, 121_302_050_000n));

    const [entry] = await getPendingProceeds(BM_ID);

    expect(entry.poolKey).toBe('NBTC_NUSDC');
    expect(entry.baseRaw).toBe(25_680_000n);
    expect(entry.quoteRaw).toBe(121_302_050_000n);
    expect(entry.hasOpenOrders).toBe(false);
  });

  it('flags pools where part of the amount backs working orders', async () => {
    devInspect.mockResolvedValue(inspectResult([1, 7], 0n, 500n));

    const [entry] = await getPendingProceeds(BM_ID);

    expect(entry.hasOpenOrders).toBe(true);
  });

  it('omits pools holding nothing', async () => {
    devInspect.mockResolvedValue(inspectResult([0], 0n, 0n));

    expect(await getPendingProceeds(BM_ID)).toEqual([]);
  });

  it('degrades to empty rather than throwing when the read fails', async () => {
    devInspect.mockImplementationOnce(() => Promise.reject(new Error('rpc down')));

    expect(await getPendingProceeds(BM_ID)).toEqual([]);
  });

  it('degrades to empty when devInspect reports an execution error', async () => {
    devInspect.mockResolvedValue({ error: 'InsufficientGas', results: [] });

    expect(await getPendingProceeds(BM_ID)).toEqual([]);
  });
});

describe('buildClaimPendingProceeds', () => {
  const pool = POOLS.NBTC_NUSDC as unknown as PoolConfig;
  const entry = (hasOpenOrders: boolean, balanceManagerId = BM_ID): PendingProceeds => ({
    balanceManagerId,
    poolKey: 'NBTC_NUSDC',
    pool,
    baseRaw: 0n,
    quoteRaw: 1_000_000n,
    hasOpenOrders,
  });
  const settleCalls = (tx: ReturnType<typeof buildClaimPendingProceeds>) =>
    tx
      .getData()
      .commands.filter((c) => c.$kind === 'MoveCall')
      .map((c) => c.MoveCall!.function);

  it('emits one permissionless settlement per claimable pool', () => {
    expect(settleCalls(buildClaimPendingProceeds(BM_ID, [entry(false), entry(false)]))).toEqual([
      'withdraw_settled_amounts_permissionless',
      'withdraw_settled_amounts_permissionless',
    ]);
  });

  // locked_balance covers order collateral too, so a pool with working orders
  // may have nothing settled. Settling it aborts with ENoBalanceToSettle and
  // takes the whole transaction down with it.
  it('skips pools with working orders', () => {
    expect(settleCalls(buildClaimPendingProceeds(BM_ID, [entry(true)]))).toEqual([]);
  });

  it('keeps only the claimable pools in a mixed set', () => {
    expect(
      settleCalls(buildClaimPendingProceeds(BM_ID, [entry(true), entry(false), entry(true)]))
    ).toEqual(['withdraw_settled_amounts_permissionless']);
  });

  // A user can own more than one BalanceManager, and each strands its proceeds
  // separately. withdraw_settled_amounts_permissionless credits only the
  // manager it is handed, so routing every entry to its own manager is what
  // lets one button recover funds spread across them.
  describe('buildClaimAcrossManagers', () => {
    const SECOND_BM = `0x${'b'.repeat(64)}`;

    const settleArgs = (tx: Transaction) =>
      tx
        .getData()
        .commands.filter((c) => c.$kind === 'MoveCall')
        .map((c) => {
          const managerArg = c.MoveCall!.arguments[1];
          const inputs = tx.getData().inputs;
          const input = managerArg.$kind === 'Input' ? inputs[managerArg.Input] : undefined;
          return input?.$kind === 'UnresolvedObject' ? input.UnresolvedObject.objectId : undefined;
        });

    it('routes each pool to the manager that stranded it', () => {
      const tx = buildClaimAcrossManagers([entry(false), entry(false, SECOND_BM)]);
      expect(settleArgs(tx)).toEqual([BM_ID, SECOND_BM]);
    });

    it('still drops pools with working orders', () => {
      const tx = buildClaimAcrossManagers([entry(true), entry(true, SECOND_BM)]);
      expect(settleArgs(tx)).toEqual([]);
    });
  });
});
