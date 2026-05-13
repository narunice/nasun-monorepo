/**
 * AgentEscrow types — minimal SDK surface for Plan C C3-v2.
 *
 * Mirrors the Move struct in `apps/baram/contracts-aer/sources/escrow.move`.
 * v1 deliberately does NOT expose per-asset balance enumeration; that
 * requires a `getDynamicFields` walker which is Plan E (Dashboard escrow
 * view) territory. The host gets balance reads via `getDynamicFieldObject`
 * with a specific TypeName key when it needs them.
 *
 * Spec: `apps/baram/docs/AER_V2_CODEC.md` §18.
 */

/**
 * Minimal AgentEscrow read shape. `balanceKeys` is the list of asset
 * `TypeName` strings the escrow has ever held; entries are removed when
 * a fully-drained `withdraw_owner` zeros the balance. Use this to
 * discover which dynamic fields the escrow currently exposes without
 * walking all DOFs.
 */
export interface AgentEscrow {
  /** Shared object id. */
  id: string;
  /** Wallet address that retains the `withdraw_owner` escape hatch. */
  owner: string;
  /** Object id of the paired `Capability`. */
  capabilityId: string;
  /**
   * Asset TypeNames currently tracked in the escrow's dynamic-field
   * balance map. Order is insertion (first deposit time); removal of
   * a fully-drained asset preserves vector order minus that entry.
   */
  balanceKeys: string[];
}

/**
 * AgentEscrow plus the shared-object reference fields the host needs to
 * compose a PTB. `initialSharedVersion` is required when the PTB wants
 * an explicit `tx.sharedObjectRef({ mutable: true })` rather than the
 * fullnode-inferred `tx.object(id)` form. The escrow is always taken
 * `&mut` by `withdraw_for_action` / `settle_action` / `deposit_*`, so
 * the host MUST pass `mutable: true`.
 */
export interface AgentEscrowRef {
  escrow: AgentEscrow;
  /** Same as `escrow.id` but repeated so callers don't reach in. */
  objectId: string;
  /** Version the object was first shared at. Stable for the object's lifetime. */
  initialSharedVersion: bigint;
}
