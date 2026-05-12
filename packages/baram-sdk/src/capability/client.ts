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
import type { Capability } from './types';

/**
 * Fetch + decode a Capability shared object by id.
 *
 * Uses `showBcs: true` so the SDK can decode deterministically rather than
 * going through Sui's JSON repr. Throws if the object is gone, not a
 * Capability, or BCS is missing in the response.
 */
export async function fetchCapability(client: SuiClient, capId: string): Promise<Capability> {
  const resp = await client.getObject({
    id: capId,
    options: { showBcs: true, showType: true },
  });
  if (resp.error || !resp.data) {
    throw new Error(`Capability ${capId} not found: ${JSON.stringify(resp.error)}`);
  }
  const bcsData = resp.data.bcs;
  if (!bcsData || bcsData.dataType !== 'moveObject') {
    throw new Error(`Capability ${capId} has no BCS data on response`);
  }
  // `bcsBytes` is base64 in @mysten/sui's response. Convert via the same
  // helper @mysten/sui ships internally; using atob+Uint8Array keeps the SDK
  // dep-light.
  const raw = base64ToBytes(bcsData.bcsBytes);
  return decodeCapability(raw);
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
