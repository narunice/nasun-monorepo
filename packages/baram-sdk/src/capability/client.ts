/**
 * Capability client helpers.
 *
 * Host-side pre-flight: read a Capability from the chain and check whether a
 * proposed action would be accepted by the gated AER entry. These helpers
 * mirror the on-chain `assert_can_execute` cheap-checks set so the host can
 * fail fast WITHOUT emitting an inference receipt that would just abort.
 *
 * Note: these are the "hard rail" checks only. Off-chain ("soft rail")
 * checks - target package, function selector, asset exposure, daily-loss
 * rolling window - live in executor-nitro and are added in Plan B Session B2.
 */

import type { SuiClient } from '@mysten/sui/client';

import { CapabilityBcs, decodeCapability } from './codec';
import type { Capability, CapabilityRef } from './types';

/**
 * Type-tag suffix every Capability object must report. The package id changes
 * across republishes; we anchor on the `<module>::<struct>` suffix that the
 * Move contract never renames. F6 hardening: without this check, a malicious
 * indexer reply could swap in any `<other_pkg>::shared::Whatever` object that
 * happens to BCS-decode under the same layout and we would forge a PTB that
 * the on-chain entry then aborts on, costing gas.
 */
const CAPABILITY_TYPE_SUFFIX = '::capability::Capability';

/**
 * Fetch + decode a Capability shared object by id, plus the shared-object
 * reference fields the host needs to compose a PTB with `mutable: false`.
 *
 * Returns `{ cap, objectId, initialSharedVersion }`. `initialSharedVersion` is
 * the version the object was first shared at; Sui needs it whenever the PTB
 * wants an explicit `tx.sharedObjectRef({ mutable: false })` rather than the
 * fullnode-inferred `tx.object(id)` form.
 *
 * Throws if the object is gone, not a `*::capability::Capability`, BCS is
 * missing, or the owner is not a Shared owner.
 */
export async function fetchCapability(
  client: SuiClient,
  capId: string,
  options?: { expectedPackageId?: string }
): Promise<CapabilityRef> {
  const resp = await client.getObject({
    id: capId,
    options: { showBcs: true, showType: true, showOwner: true },
  });
  if (resp.error || !resp.data) {
    throw new Error(`Capability ${capId} not found: ${JSON.stringify(resp.error)}`);
  }
  const bcsData = resp.data.bcs;
  if (!bcsData || bcsData.dataType !== 'moveObject') {
    throw new Error(`Capability ${capId} has no BCS data on response`);
  }
  // F6 type origin assertion. We accept any package id by default (devnet
  // republishes happen) but require the canonical `::capability::Capability`
  // suffix. Callers in production should pass `expectedPackageId` to lock to
  // the exact deployed package and reject upgrades.
  const moveType = resp.data.type;
  if (typeof moveType !== 'string' || !moveType.endsWith(CAPABILITY_TYPE_SUFFIX)) {
    throw new Error(
      `Capability ${capId} has unexpected type "${moveType}"; expected *${CAPABILITY_TYPE_SUFFIX}`,
    );
  }
  if (options?.expectedPackageId) {
    const expectedType = `${options.expectedPackageId}${CAPABILITY_TYPE_SUFFIX}`;
    if (moveType !== expectedType) {
      throw new Error(
        `Capability ${capId} type "${moveType}" does not match expected "${expectedType}"`,
      );
    }
  }
  const owner = resp.data.owner;
  // Sui owner shape: 'Immutable' | 'AddressOwner' | 'ObjectOwner' |
  // { Shared: { initial_shared_version: number } }. We only support Shared.
  const sharedOwner =
    owner && typeof owner === 'object' && 'Shared' in owner ? owner.Shared : null;
  if (!sharedOwner) {
    throw new Error(`Capability ${capId} is not a Shared object: ${JSON.stringify(owner)}`);
  }
  // `bcsBytes` is base64 in @mysten/sui's response. Convert via atob+Uint8Array
  // to keep the SDK dep-light.
  const raw = base64ToBytes(bcsData.bcsBytes);
  const cap = decodeCapability(raw);
  return {
    cap,
    objectId: capId,
    initialSharedVersion: BigInt(sharedOwner.initial_shared_version),
  };
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Re-export for callers that want to decode BCS bytes they already hold. */
export { CapabilityBcs };

/**
 * Returns true iff `actionType` is in the cap's allowed list.
 *
 * Mirrors `capability::is_action_allowed` on-chain. O(n) over allowed_actions,
 * bounded at 16 entries.
 */
export function checkActionAllowed(cap: Capability, actionType: string): boolean {
  return cap.allowedActions.includes(actionType);
}

/**
 * Returns true iff `paymentAmount` is within the cap's per-action notional
 * limit. Mirrors `capability::assert_can_execute`'s payment check.
 */
export function checkPaymentAllowed(cap: Capability, paymentAmount: bigint): boolean {
  return paymentAmount <= cap.riskLimits.maxNotionalPerAction;
}

/** Cheap pre-flight predicate combining all hard-rail conditions. */
export interface PreflightInput {
  actionType: string;
  paymentAmount: bigint;
  receiptRequester: string;
  expectedVersion: bigint;
}

export type PreflightResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'revoked'
        | 'paused'
        | 'owner_mismatch'
        | 'version_mismatch'
        | 'action_not_allowed'
        | 'payment_exceeds_notional_cap';
    };

/**
 * Same order of checks as `capability::assert_can_execute` on-chain so the
 * host can short-circuit before submitting a PTB that would abort.
 */
export function preflight(cap: Capability, input: PreflightInput): PreflightResult {
  if (cap.revoked) return { ok: false, reason: 'revoked' };
  if (cap.pauseMode !== 'active') return { ok: false, reason: 'paused' };
  if (cap.owner !== input.receiptRequester) return { ok: false, reason: 'owner_mismatch' };
  if (cap.version !== input.expectedVersion) return { ok: false, reason: 'version_mismatch' };
  if (!checkActionAllowed(cap, input.actionType))
    return { ok: false, reason: 'action_not_allowed' };
  if (!checkPaymentAllowed(cap, input.paymentAmount))
    return { ok: false, reason: 'payment_exceeds_notional_cap' };
  return { ok: true };
}
