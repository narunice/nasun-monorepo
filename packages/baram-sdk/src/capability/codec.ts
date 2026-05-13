/**
 * Capability BCS codec.
 *
 * Mirrors the Move struct hierarchy in
 * `apps/baram/contracts-aer/sources/capability.move`. Field order MUST match
 * Move declaration order; do not reorder. Spec: AER_V2_CODEC.md §17.
 *
 * Capability is consumed by reference in the gated AER entry (never serialized
 * by clients). This codec exists to decode `SuiObjectResponse.bcs` content
 * when the indexer or client wants to read a Capability directly.
 */

import { bcs } from '@mysten/sui/bcs';

import {
  MUTATION_KIND_TAG,
  PAUSE_MODE_TAG,
  type Capability,
  type MutationKind,
  type PauseMode,
  type RiskLimits,
} from './types';

export class CapabilityCodecError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'CapabilityCodecError';
  }
}

// ===== Raw BCS shapes (1:1 with Move) =====

const RiskLimitsBcs = bcs.struct('RiskLimits', {
  max_notional_per_action: bcs.u64(),
  max_daily_loss: bcs.u64(),
  max_slippage_bps: bcs.u16(),
  stop_loss_bps: bcs.u16(),
  take_profit_bps: bcs.u16(),
});

// TypeName is serialized by sui-framework as `{ name: String }` (a struct
// holding the canonical type string). Match that shape exactly so vector
// decoding works.
const TypeNameBcs = bcs.struct('TypeName', {
  name: bcs.string(),
});

export const CapabilityBcs = bcs.struct('Capability', {
  id: bcs.Address,
  owner: bcs.Address,
  version: bcs.u64(),
  pause_mode: bcs.u8(),
  revoked: bcs.bool(),
  allowed_actions: bcs.vector(bcs.string()),
  allowed_assets: bcs.vector(TypeNameBcs),
  allowed_targets: bcs.vector(bcs.Address),
  risk_limits: RiskLimitsBcs,
  // Plan C C3-v2 DV6: Option<ID> of the linked AgentEscrow. BCS for
  // Option<T> is a 1-byte tag (0=None, 1=Some) followed by T's bytes.
  escrow_id: bcs.option(bcs.Address),
});

// ===== Enum mappings =====

const PAUSE_MODE_REVERSE: Record<number, PauseMode> = {
  0: 'active',
  1: 'execution_only',
  2: 'wake_blocked',
  3: 'full_suspend',
};

const MUTATION_KIND_REVERSE: Record<number, MutationKind> = {
  1: 'pause',
  2: 'risk',
  3: 'actions',
  4: 'assets',
  5: 'targets',
  6: 'escrow',
};

export function pauseModeFromTag(tag: number): PauseMode {
  return PAUSE_MODE_REVERSE[tag] ?? 'unknown';
}

export function pauseModeToTag(mode: PauseMode): number {
  if (mode === 'unknown') {
    throw new CapabilityCodecError(
      'Cannot encode "unknown" pause_mode. Use a concrete enum value.',
      'CAP_INVALID_PAUSE_MODE_ENCODE',
    );
  }
  return PAUSE_MODE_TAG[mode];
}

export function mutationKindFromTag(tag: number): MutationKind {
  return MUTATION_KIND_REVERSE[tag] ?? 'unknown';
}

export function mutationKindToTag(kind: MutationKind): number {
  if (kind === 'unknown') {
    throw new CapabilityCodecError(
      'Cannot encode "unknown" mutation_kind. Use a concrete enum value.',
      'CAP_INVALID_MUTATION_KIND_ENCODE',
    );
  }
  return MUTATION_KIND_TAG[kind];
}

// ===== Decode =====

/**
 * Decode a BCS-encoded Capability object.
 *
 * Surfaces unknown pause_mode integers as `'unknown'` (forward-compat with
 * phase 2 modes the SDK predates). Risk limits are returned as bigints so
 * arithmetic in the caller stays exact.
 */
export function decodeCapability(bytes: Uint8Array): Capability {
  const raw = CapabilityBcs.parse(bytes);
  const r = raw.risk_limits;
  const risk: RiskLimits = {
    maxNotionalPerAction: BigInt(r.max_notional_per_action),
    maxDailyLoss: BigInt(r.max_daily_loss),
    maxSlippageBps: r.max_slippage_bps,
    stopLossBps: r.stop_loss_bps,
    takeProfitBps: r.take_profit_bps,
  };
  return {
    id: raw.id,
    owner: raw.owner,
    version: BigInt(raw.version),
    pauseMode: pauseModeFromTag(raw.pause_mode),
    revoked: raw.revoked,
    allowedActions: raw.allowed_actions,
    allowedAssets: raw.allowed_assets.map((t) => t.name),
    allowedTargets: raw.allowed_targets,
    riskLimits: risk,
    // bcs.option() decodes Option<T> as `T | null`.
    escrowId: raw.escrow_id ?? null,
  };
}
