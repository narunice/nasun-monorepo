/**
 * Escrow PTB builders.
 *
 * Wallet-side helpers for the three flows the wallet (not the agent)
 * needs to compose:
 *   - `buildAtomicSetupTx`  : 3-cmd atomic cap+escrow creation (DV5)
 *   - `buildDepositTx`      : top up an escrow with any Coin<T>
 *   - `buildWithdrawOwnerTx`: recovery escape hatch (DV1)
 *
 * The cap-gated spend flow (`withdraw_for_action` + `settle_action` +
 * `deposit_swap_leftover`) is composed host-side as part of the
 * execution-AER PTB; SDK helpers for it would split that PTB and lose
 * atomicity. Host PTB builder lives in `executor-nitro/src/host`.
 */

import { bcs } from '@mysten/sui/bcs';
import { Transaction, type TransactionResult } from '@mysten/sui/transactions';

import type { CapabilityRiskLimitsArgs } from './tx-types';

// BCS layout of std::type_name::TypeName: `{ name: String }`. Mirrored
// here so we can pre-encode `vector<TypeName>` pure args.
const TypeNamePureBcs = bcs.struct('TypeName', { name: bcs.string() });
const TypeNameVectorBcs = bcs.vector(TypeNamePureBcs);

export interface AtomicSetupArgs {
  /** Package id of the `baram_aer` package (carries `capability` + `escrow` modules). */
  packageId: string;
  /** Shared `CapabilityRegistry` object id (immutable ref). */
  capabilityRegistryId: string;
  /** Action types the cap will accept (1..=16, no duplicates, action_type-format). */
  allowedActions: string[];
  /**
   * Fully-qualified Move TypeName strings (e.g. `0x...::nusdc::NUSDC`).
   * Up to 16, no duplicates. Becomes `cap.allowed_assets` and is the
   * contract-level hard rail for `withdraw_for_action<T>` /
   * `settle_action<U>` / `deposit_swap_leftover<T>` (Plan C C3-v2 DV7).
   */
  allowedAssets: string[];
  /** Package addresses the agent's PTBs may target. Up to 8, no duplicates. */
  allowedTargets: string[];
  /** Risk-limit fields, bigint where Move expects u64. */
  riskLimits: CapabilityRiskLimitsArgs;
}

/**
 * Composes the 3-command atomic setup PTB (Plan C C3-v2 DV5):
 *
 *   Cmd 0: capability::new_capability_and_link(...) -> (Capability, LinkWitness)
 *   Cmd 1: escrow::new_escrow_linked(witness) -> escrow_id
 *   Cmd 2: capability::finalize_link_and_share(cap, escrow_id)
 *
 * All three commands sign as the wallet in a single tx. The PTB rolls
 * back atomically on any failure, so a pre-authorized agent-runner
 * cannot observe the cap in an `escrow_id = None` window.
 *
 * After execution, the cap and escrow are both shared with reciprocal
 * binding (`cap.escrow_id == Some(escrow.id)`, `escrow.capability_id == cap.id`).
 * Caller can read both ids from the tx's effects' `created` array.
 */
export function buildAtomicSetupTx(args: AtomicSetupArgs): Transaction {
  const tx = new Transaction();
  const { packageId, capabilityRegistryId, allowedActions, allowedAssets, allowedTargets, riskLimits } = args;

  // Cmd 0: create capability + emit LinkWitness.
  const [cap, witness]: TransactionResult = tx.moveCall({
    target: `${packageId}::capability::new_capability_and_link`,
    arguments: [
      tx.object(capabilityRegistryId),
      tx.pure.vector('string', allowedActions),
      // allowed_assets: vector<TypeName>. Move's std::type_name::TypeName
      // BCS shape is `{ name: String }`, so we pass a struct-array via
      // the SDK's vec form using the inner string. The on-chain code
      // accepts `vector<TypeName>` here; @mysten/sui serializes
      // pure.vector with TypeName tags when the entry function arg type
      // is decoded from the package's normalized ABI.
      //
      // SDK convention: callers pass the canonical type strings; the
      // PTB construction passes them as a vector<TypeName>. Validate
      // shape and hand off to moveCall which resolves the type tag.
      typeNameVector(tx, allowedAssets),
      tx.pure.vector('address', allowedTargets),
      tx.pure.u64(riskLimits.maxNotionalPerAction),
      tx.pure.u64(riskLimits.maxDailyLoss),
      tx.pure.u16(riskLimits.maxSlippageBps),
      tx.pure.u16(riskLimits.stopLossBps),
      tx.pure.u16(riskLimits.takeProfitBps),
    ],
  });

  // Cmd 1: consume the witness, create + share AgentEscrow, return its id.
  const escrowId = tx.moveCall({
    target: `${packageId}::escrow::new_escrow_linked`,
    arguments: [witness],
  });

  // Cmd 2: stamp escrow_id onto the cap, share the cap.
  tx.moveCall({
    target: `${packageId}::capability::finalize_link_and_share`,
    arguments: [cap, escrowId],
  });

  return tx;
}

export interface DepositArgs {
  packageId: string;
  escrowId: string;
  /** Shared-object initial version (read via `fetchEscrow`). */
  escrowInitialSharedVersion: bigint;
  /** Fully-qualified Move TypeName of the coin to deposit. */
  coinType: string;
  /** Existing `Coin<T>` object id owned by the signer. */
  coinObjectId: string;
}

/**
 * Anyone-can-call top-up. Useful for the wallet to fund the agent
 * before paused/active toggle, or for an external payroll address to
 * top up without owner cooperation. No cap-state check; the open
 * `deposit` entry deliberately accepts top-ups from anyone.
 */
export function buildDepositTx(args: DepositArgs): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${args.packageId}::escrow::deposit`,
    typeArguments: [args.coinType],
    arguments: [
      tx.sharedObjectRef({
        objectId: args.escrowId,
        // @mysten/sui's sharedObjectRef accepts string | number. We
        // accept bigint at the API boundary (mirrors @mysten/sui's
        // own pattern elsewhere) and coerce here.
        initialSharedVersion: args.escrowInitialSharedVersion.toString(),
        mutable: true,
      }),
      tx.object(args.coinObjectId),
    ],
  });
  return tx;
}

export interface WithdrawOwnerArgs {
  packageId: string;
  escrowId: string;
  escrowInitialSharedVersion: bigint;
  coinType: string;
  amount: bigint;
  /** Address that should receive the withdrawn coin. */
  recipient: string;
}

/**
 * Recovery escape hatch (Plan C C3-v2 DV1). Wallet-only. Returns a
 * `Coin<T>` to `recipient` regardless of cap state — works when the
 * cap is paused or revoked. The "recoverable" half of the
 * recoverable-delegated-custody framing.
 */
export function buildWithdrawOwnerTx(args: WithdrawOwnerArgs): Transaction {
  const tx = new Transaction();
  const withdrawn = tx.moveCall({
    target: `${args.packageId}::escrow::withdraw_owner`,
    typeArguments: [args.coinType],
    arguments: [
      tx.sharedObjectRef({
        objectId: args.escrowId,
        // @mysten/sui's sharedObjectRef accepts string | number. We
        // accept bigint at the API boundary (mirrors @mysten/sui's
        // own pattern elsewhere) and coerce here.
        initialSharedVersion: args.escrowInitialSharedVersion.toString(),
        mutable: true,
      }),
      tx.pure.u64(args.amount),
    ],
  });
  tx.transferObjects([withdrawn], tx.pure.address(args.recipient));
  return tx;
}

// ===== internal =====

/**
 * Pass a vector<TypeName> argument. Move's std::type_name::TypeName is
 * an unboxed `{ name: String }` struct; @mysten/sui's PTB pure encoder
 * doesn't expose a built-in for it because TypeName is normally
 * synthesized by `type_name::get<T>()` on-chain. We construct it via
 * inline `moveCall`s using the contract's vector ABI.
 *
 * Note: the on-chain `new_capability_and_link` signature is
 * `vector<TypeName>` (not `vector<String>`), so we cannot simply pass
 * `tx.pure.vector('string', ...)` — the entry will reject the wrong
 * type tag. We materialize each TypeName via `type_name::get` for the
 * named generic... but that would require typeArgs. Simpler: use the
 * existing `cap::new_capability` ABI form which expects
 * vector<TypeName> populated via the SDK's pure encoder if the package
 * exposes a constructor helper. For now, route through `pure.vector`
 * with a struct shape that matches BCS layout `{ name: String }`.
 *
 * SDK consumers that need to mint caps with assets should typically
 * use this helper; if their @mysten/sui version does not accept the
 * inline pure form below, fall back to constructing the vector via
 * a small on-chain helper (TODO: add `capability::new_typename_vec`).
 */
function typeNameVector(tx: Transaction, typeStrings: string[]) {
  // Pass as pre-serialized BCS bytes. The on-chain entry declares the
  // arg as `vector<TypeName>`; the runtime type-checker verifies the
  // bytes deserialize under that layout. Since BCS(TypeName) ==
  // BCS({ name: String }) and structs in BCS are just concatenated
  // fields, the bytes match what `type_name::get<T>()` would emit.
  const bytes = TypeNameVectorBcs.serialize(typeStrings.map((s) => ({ name: s }))).toBytes();
  return tx.pure(bytes);
}
