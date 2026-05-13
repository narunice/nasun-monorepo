/**
 * Capability v1 TypeScript types.
 *
 * Mirrors the Move struct hierarchy in
 * `apps/baram/contracts-aer/sources/capability.move`. Field order matches the
 * canonical BCS wire order; do not reorder.
 *
 * Plan B introduces the capability primitive that gates the AER creation path.
 * The host reads a Capability (immutable ref, never consumed) on every wake
 * and the gated AER entry snapshots `version` into `AER.why.capabilityVersion`.
 *
 * Spec: `apps/baram/docs/AER_V2_CODEC.md` §17.
 */

/**
 * Phase 1 honored set: `'active' | 'wake_blocked'`.
 *
 * `'execution_only'` and `'full_suspend'` are reserved integers (1 and 3) but
 * the contract rejects them in `set_pause_mode` with E_PAUSE_MODE_NOT_SUPPORTED
 * (559) to avoid latent semantics divergence with host behavior. Frontend
 * surfaces them as disabled "phase 2" options. Decoders surface them faithfully
 * if they ever appear on-chain in a future phase.
 */
export type PauseMode = 'active' | 'execution_only' | 'wake_blocked' | 'full_suspend' | 'unknown';

export const PAUSE_MODE_TAG = {
  active: 0,
  execution_only: 1,
  wake_blocked: 2,
  full_suspend: 3,
} as const;

/** Mutation kind enum (CapabilityMutated event). */
export type MutationKind =
  | 'pause'
  | 'risk'
  | 'actions'
  | 'assets'
  | 'targets'
  | 'escrow'
  | 'unknown';

export const MUTATION_KIND_TAG = {
  pause: 1,
  risk: 2,
  actions: 3,
  assets: 4,
  targets: 5,
  // Plan C C3-v2 DV5/DV6: emitted by `finalize_link_and_share` (atomic
  // setup PTB Cmd 2) and `set_escrow` (post-creation rebind).
  escrow: 6,
} as const;

export interface RiskLimits {
  maxNotionalPerAction: bigint;
  maxDailyLoss: bigint;
  maxSlippageBps: number;
  stopLossBps: number;
  takeProfitBps: number;
}

export interface Capability {
  /** Shared object id of the Capability. */
  id: string;
  /** Wallet that signed `new_capability`. Only this address can mutate. */
  owner: string;
  /** Monotonic mutation counter. Snapshotted into AER.why.capabilityVersion. */
  version: bigint;
  /** Phase 1 honored values: `'active'` (0), `'wake_blocked'` (2). */
  pauseMode: PauseMode;
  /** Terminal flag. Once true, all gated AER entries abort with E_CAPABILITY_REVOKED. */
  revoked: boolean;
  /** Action types the agent is permitted to emit through the gated entry. */
  allowedActions: string[];
  /** Sui TypeNames (`<package>::<module>::<type>`) of permitted assets. */
  allowedAssets: string[];
  /** Package addresses the agent's PTBs may target. */
  allowedTargets: string[];
  riskLimits: RiskLimits;
  /**
   * Object id of the `AgentEscrow` paired with this capability for
   * delegated-spend execution (Plan C C3-v2 DV6). `null` for caps
   * created via the legacy `new_capability` constructor or caps
   * deliberately unlinked via `set_escrow(None)`. The atomic-setup
   * PTB (`new_capability_and_link` + `new_escrow_linked` +
   * `finalize_link_and_share`) leaves this `Some(escrowId)` from
   * version 1.
   */
  escrowId: string | null;
}

// Events surfaced from on-chain mutations. Off-chain indexers project these
// into the capability_history view; the SDK exposes them for clients that
// want to render the trail directly.

export interface CapabilityCreatedEvent {
  capId: string;
  owner: string;
}

export interface CapabilityMutatedEvent {
  capId: string;
  newVersion: bigint;
  mutationKind: MutationKind;
  owner: string;
}

export interface CapabilityRevokedEvent {
  capId: string;
  owner: string;
}

/**
 * Capability paired with the shared-object reference fields the host needs to
 * construct a PTB. `initialSharedVersion` is required by
 * `tx.sharedObjectRef({ mutable: false })`; without it the SDK falls back to
 * `tx.object(id)`, which lets the fullnode infer mutability and may upgrade the
 * reference to mutable, putting the cap read on the consensus-serialized path.
 *
 * Plan B code-review C-3: the gated AER entry takes `&Capability` (immutable),
 * so the host MUST pass `mutable: false`. That requires the
 * initialSharedVersion to be plumbed through alongside the decoded body.
 */
export interface CapabilityRef {
  cap: Capability;
  /** Same as `cap.id` but repeated so callers don't accidentally reach in. */
  objectId: string;
  /** Version the object was first shared at. Stable for the object's lifetime. */
  initialSharedVersion: bigint;
}
