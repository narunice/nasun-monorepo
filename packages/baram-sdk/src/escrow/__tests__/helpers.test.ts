import { describe, expect, it } from 'vitest';
import { Transaction } from '@mysten/sui/transactions';

import {
  buildAtomicSetupTx,
  buildDepositTx,
  buildWithdrawOwnerTx,
} from '../helpers';

const PKG = '0xdb118fd931572cf42af8613dce1cc18471419d1ba937b63c832d4361aad5b8e5';
const CAP_REG = '0x893a15ed9d53375fc8690a6e5cfacc11a77e78988785cd265f81d49cb3699905';
const ESCROW = '0x000000000000000000000000000000000000000000000000000000000000beef';
const COIN_TYPE = `${PKG}::nusdc::NUSDC`;
const COIN_OBJ = '0x000000000000000000000000000000000000000000000000000000000000c0de';

/**
 * Extract the per-command MoveCall targets (`pkg::module::function`).
 * `tx.getData().commands` is the documented public surface;
 * non-MoveCall commands (TransferObjects, SplitCoins, etc.) yield an
 * empty string at their index.
 */
function moveCallTargets(tx: Transaction): string[] {
  const data = tx.getData();
  return data.commands.map((c) => {
    if (c.$kind === 'MoveCall' && c.MoveCall) {
      return `${c.MoveCall.package}::${c.MoveCall.module}::${c.MoveCall.function}`;
    }
    return '';
  });
}

describe('escrow PTB helpers', () => {
  it('buildAtomicSetupTx composes the 3-command setup PTB in order', () => {
    const tx = buildAtomicSetupTx({
      packageId: PKG,
      capabilityRegistryId: CAP_REG,
      allowedActions: ['trade.swap.v1'],
      allowedAssets: [COIN_TYPE],
      allowedTargets: ['0x0000000000000000000000000000000000000000000000000000000000000abc'],
      riskLimits: {
        maxNotionalPerAction: 100_000_000n,
        maxDailyLoss: 1_000_000_000n,
        maxSlippageBps: 100,
        stopLossBps: 200,
        takeProfitBps: 500,
      },
    });
    const targets = moveCallTargets(tx);
    // Filter out empty entries (non-MoveCall commands like
    // transferObjects emit '' at their index).
    const calls = targets.filter((t) => t.length > 0);
    expect(calls.length).toBe(3);
    expect(calls[0]).toContain('capability::new_capability_and_link');
    expect(calls[1]).toContain('escrow::new_escrow_linked');
    expect(calls[2]).toContain('capability::finalize_link_and_share');
  });

  it('buildDepositTx emits a single escrow::deposit moveCall', () => {
    const tx = buildDepositTx({
      packageId: PKG,
      escrowId: ESCROW,
      escrowInitialSharedVersion: 1n,
      coinType: COIN_TYPE,
      coinObjectId: COIN_OBJ,
    });
    const targets = moveCallTargets(tx);
    expect(targets.length).toBe(1);
    expect(targets[0]).toContain('escrow::deposit');
  });

  it('buildWithdrawOwnerTx emits withdraw_owner + transferObjects', () => {
    const tx = buildWithdrawOwnerTx({
      packageId: PKG,
      escrowId: ESCROW,
      escrowInitialSharedVersion: 1n,
      coinType: COIN_TYPE,
      amount: 500n,
      recipient: '0x0000000000000000000000000000000000000000000000000000000000000abc',
    });
    const targets = moveCallTargets(tx);
    // First call is the moveCall; transferObjects appears as a TransferObjects command (no target).
    expect(targets[0]).toContain('escrow::withdraw_owner');
  });
});
