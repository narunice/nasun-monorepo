/**
 * @nasun/baram-sdk - escrow namespace.
 *
 * Plan C C3-v2 introduces `AgentEscrow`, the user-owned shared treasury
 * paired 1:1 with a `Capability` for delegated-spend execution.
 *
 * Import as:
 *   import { escrow } from '@nasun/baram-sdk';
 *   const { escrow: e, initialSharedVersion } = await escrow.fetchEscrow(client, escrowId);
 *   const tx = escrow.buildAtomicSetupTx({ ... });
 *
 * Spec: `apps/baram/docs/AER_V2_CODEC.md` §18.
 */

export type { AgentEscrow, AgentEscrowRef } from './types';

export {
  AgentEscrowBcs,
  EscrowCodecError,
  decodeAgentEscrow,
} from './codec';

export { fetchEscrow } from './client';

export {
  buildAtomicSetupTx,
  buildDepositTx,
  buildWithdrawOwnerTx,
} from './helpers';
export type { AtomicSetupArgs, DepositArgs, WithdrawOwnerArgs } from './helpers';
export type { CapabilityRiskLimitsArgs } from './tx-types';
