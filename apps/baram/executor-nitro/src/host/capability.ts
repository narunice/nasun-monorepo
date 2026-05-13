/**
 * Host-side capability layer for Plan B atomic-settlement PTBs.
 *
 * Responsibilities (Plan B §4.1, D4):
 *
 * 1. Fetch the active Capability for an agent on every wake. We intentionally
 *    do NOT cache the cap body across requests: a wallet `set_pause_mode` or
 *    `update_risk_limits` can land any moment, and a stale cap would let the
 *    host sign a PTB that the contract then rolls back, burning gas. The
 *    `initialSharedVersion` we use for `tx.sharedObjectRef({ mutable: false })`
 *    IS stable for the object's lifetime, so a process-local cache of that
 *    one number is safe — but only after a successful first fetch.
 *
 * 2. Run the off-chain soft-rail checks (target package, function selector,
 *    asset exposure, slippage, notional, daily loss) before the host signs.
 *    These mirror the on-chain hard-rail checks for the fields the contract
 *    can't see without decoding payload_bytes.
 *
 * 3. Enforce a cognition payout cap (Plan B §4.5). A perverse agent that only
 *    ever emits cognition AERs would drain the user's Budget with no on-chain
 *    action. `dailyCognitionPayoutCap` (env, default 0=off) is a host-side
 *    sliding-window count of cognition payouts in the last 24h; once
 *    exceeded the host refuses to sign any new cognition PTB.
 *
 * Trust model framing (Plan B D12): these are SOFT rails. A malicious host
 * could pass through an out-of-scope action that the on-chain coarse checks
 * (action_type membership, payment cap, pause, owner) still admit. 1차's
 * trust assumption is that the Nasun-run executor is operationally
 * incentivized to refuse out-of-scope actions.
 */

import { capability as capabilitySdk } from '@nasun/baram-sdk';
import type { SuiClient } from '@mysten/sui/client';

import {
  loadActionClasses,
  findFunctionEntry,
  type ActionClassRegistry,
  type ActionFunctionEntry,
} from './action-classes.js';

// ============================================================================
// Capability fetch (no body cache, optional ref cache)
// ============================================================================

export type CapabilityRef = capabilitySdk.CapabilityRef;

/**
 * Process-local cache of `{ objectId → initialSharedVersion }` only. The
 * body is re-fetched every call. Plan B C-3: passing `mutable: false` in
 * `tx.sharedObjectRef` requires the initial shared version, and that value
 * doesn't change for the object's lifetime, so caching it is safe.
 */
const initialSharedVersionCache = new Map<string, bigint>();

export async function fetchCapability(
  client: SuiClient,
  capId: string,
): Promise<CapabilityRef> {
  // F6: pin the type to the deployed AER package id (where the Capability
  // struct lives, baram_aer::capability::Capability) when available so a
  // misbehaving fullnode can't return a same-shape object from another
  // package. Reads at boot from process.env to avoid plumbing a long
  // config object through every preflight call; falls back to "any
  // ::capability::Capability" suffix check inside the SDK helper when env
  // is unset (e.g. during local dev where a single deployment doesn't have
  // a stable id pinned yet).
  const expectedPackageId = process.env.AER_PACKAGE_ID || undefined;
  const ref = await capabilitySdk.fetchCapability(client, capId, {
    expectedPackageId,
  });
  initialSharedVersionCache.set(ref.objectId, ref.initialSharedVersion);
  return ref;
}

export function getCachedInitialSharedVersion(capId: string): bigint | undefined {
  return initialSharedVersionCache.get(capId);
}

// ============================================================================
// Action proposal + soft-rail check
// ============================================================================

/**
 * Subset of an LLM-produced action decision that the host can validate
 * structurally before signing. `actionType` matches the AER envelope
 * `action_type`; `eventClass` is 1=cognition, 2=execution, 3=settlement.
 *
 * For execution actions we additionally need `targetPackage`, `module`,
 * `function`, the input/output asset TypeNames, and the swap payload numbers.
 * For cognition/settlement these are not used.
 */
export interface ActionProposal {
  eventClass: 1 | 2 | 3;
  actionType: string;
  paymentAmount: bigint;
  /** Execution-only fields. Null for cognition/settlement. */
  exec?: {
    targetPackage: string;
    module: string;
    fn: string;
    inputAssetType: string;
    outputAssetType: string;
    inputAmount: bigint;
    maxSlippageBps: number;
    /** Shared Pool object id the swap will target. Validated against
     *  the function entry's `poolId` so the host preflight refuses to
     *  sign a PTB against an unregistered pool (Plan C C3-v2 §4.5). */
    poolId: string;
  } | null;
}

export type SoftRailReason =
  | 'target_not_allowed'
  | 'function_not_in_registry'
  | 'input_asset_not_allowed'
  | 'output_asset_not_allowed'
  | 'slippage_exceeds_cap'
  | 'input_amount_exceeds_notional_cap'
  | 'daily_loss_exceeds_cap'
  | 'pool_id_not_in_registry';

export type SoftRailResult = { ok: true } | { ok: false; reason: SoftRailReason };

/**
 * Daily-loss callback. The host doesn't own the PostgreSQL projection; the
 * api-server does. Callers pass in a function (typically a thin api-server
 * client) returning the rolling 24h realized loss for the agent's owner.
 * If you don't have the projection wired yet, return `null` to skip the
 * check (host logs a warn). Plan B explicitly documents this as a
 * defense-in-depth check, not a blocking guarantee.
 */
export type QueryDailyLoss = (ownerAddress: string) => Promise<bigint | null>;

/**
 * Run the off-chain checks in the same order the on-chain hard rail runs
 * them, so the host fails fast in approximately the same way the contract
 * would. Asset checks come first because they're the cheapest and the
 * commonest reason for a host-side rejection.
 *
 * `eventClass=cognition|settlement` short-circuits the execution-only checks
 * (target package, function selector, asset exposure, slippage): the proposal
 * just doesn't have those fields to check.
 */
export function checkSoftRail(
  cap: CapabilityRef['cap'],
  proposal: ActionProposal,
  registry: ActionClassRegistry,
  dailyLossWindow: bigint | null,
): SoftRailResult {
  // Cognition / settlement: payment cap is on-chain, nothing else to check.
  if (proposal.eventClass !== 2) return { ok: true };
  if (!proposal.exec) {
    // An execution AER missing the exec block is a host bug, not a soft-rail
    // failure. Surface it as a target_not_allowed so the caller refuses to
    // sign; the alternative (returning ok) would let the PTB go through
    // without selector validation.
    return { ok: false, reason: 'function_not_in_registry' };
  }
  const exec = proposal.exec;

  if (!cap.allowedTargets.includes(exec.targetPackage)) {
    return { ok: false, reason: 'target_not_allowed' };
  }

  const fnEntry: ActionFunctionEntry | undefined = findFunctionEntry(
    registry,
    proposal.actionType,
    exec.targetPackage,
    exec.module,
    exec.fn,
  );
  if (!fnEntry) {
    return { ok: false, reason: 'function_not_in_registry' };
  }

  if (fnEntry.poolId !== exec.poolId) {
    return { ok: false, reason: 'pool_id_not_in_registry' };
  }

  // Asset exposure: cap.allowed_assets is the contract-level authority;
  // the function entry's allowedInputAssets / allowedOutputAssets are a
  // structural narrower (a swap fn that legally returns NUSDC can't be
  // routed when the proposal claims NBTC output). Both must accept.
  if (
    !cap.allowedAssets.includes(exec.inputAssetType) ||
    !fnEntry.allowedInputAssets.includes(exec.inputAssetType)
  ) {
    return { ok: false, reason: 'input_asset_not_allowed' };
  }
  if (
    !cap.allowedAssets.includes(exec.outputAssetType) ||
    !fnEntry.allowedOutputAssets.includes(exec.outputAssetType)
  ) {
    return { ok: false, reason: 'output_asset_not_allowed' };
  }

  if (exec.maxSlippageBps > cap.riskLimits.maxSlippageBps) {
    return { ok: false, reason: 'slippage_exceeds_cap' };
  }

  // Defense-in-depth: contract enforces `payment_amount <= max_notional`, but
  // the actual swap input may be larger than the inference fee. If the
  // executor lets a 10_000 NUSDC swap through against a 100 NUSDC notional
  // cap because only the inference fee was checked, the soft rail catches it.
  if (exec.inputAmount > cap.riskLimits.maxNotionalPerAction) {
    return { ok: false, reason: 'input_amount_exceeds_notional_cap' };
  }

  if (dailyLossWindow !== null && dailyLossWindow > cap.riskLimits.maxDailyLoss) {
    return { ok: false, reason: 'daily_loss_exceeds_cap' };
  }

  return { ok: true };
}

// ============================================================================
// Cognition payout cap (Plan B §4.5, F5)
// ============================================================================

const COGNITION_WINDOW_MS = 24 * 60 * 60 * 1000;

interface CognitionTracker {
  /** Ring of `{ at, capId }` for the last 24h. */
  events: Array<{ at: number; capId: string }>;
  /** Cap as configured. 0 = disabled. */
  cap: number;
}

const cognitionTrackers = new Map<string, CognitionTracker>();

/**
 * Per-wallet (= cap.owner) cognition payout cap. Pass the env's
 * `dailyCognitionPayoutCap` once at boot; subsequent calls reuse the same
 * tracker. Defaults to 0 (disabled) when the env is missing.
 *
 * F17: idempotent. If a tracker already exists, we update only the cap
 * value (so an operator can raise/lower it at boot via env reload) and
 * leave the existing events ring intact. Two concurrent first-time
 * requests for the same wallet would otherwise race and reset each
 * other's ring back to empty.
 */
export function configureCognitionCap(walletAddress: string, cap: number): void {
  const existing = cognitionTrackers.get(walletAddress);
  if (existing) {
    existing.cap = cap;
    return;
  }
  cognitionTrackers.set(walletAddress, { events: [], cap });
}

/**
 * Returns `true` iff a fresh cognition payout would push the tracker over
 * the cap. Does NOT record the payout — call `recordCognitionPayout` on
 * actual settlement success to keep the count honest.
 */
export function cognitionCapExceeded(walletAddress: string): boolean {
  const t = cognitionTrackers.get(walletAddress);
  if (!t || t.cap <= 0) return false;
  pruneWindow(t);
  return t.events.length >= t.cap;
}

export function recordCognitionPayout(walletAddress: string, capId: string): void {
  const t = cognitionTrackers.get(walletAddress);
  if (!t || t.cap <= 0) return;
  pruneWindow(t);
  t.events.push({ at: Date.now(), capId });
}

function pruneWindow(t: CognitionTracker): void {
  const cutoff = Date.now() - COGNITION_WINDOW_MS;
  while (t.events.length > 0 && t.events[0].at < cutoff) {
    t.events.shift();
  }
}

// ============================================================================
// Entry point: pre-flight everything except the actual PTB
// ============================================================================

export interface PreflightInput {
  capId: string;
  walletAddress: string;
  proposal: ActionProposal;
  /** Optional expected cap.version. If provided and != cap.version,
   *  preflight short-circuits with `version_mismatch`. PTB also re-checks
   *  via `expected_capability_version` on-chain, so this is purely a fast
   *  fail for operator misconfig / stale clients. */
  expectedCapabilityVersion?: bigint;
  queryDailyLoss?: QueryDailyLoss;
}

export interface PreflightOk {
  ok: true;
  capRef: CapabilityRef;
}

export interface PreflightDeny {
  ok: false;
  reason:
    | 'revoked'
    | 'paused'
    | 'owner_mismatch'
    | 'version_mismatch'
    | 'action_not_allowed'
    | 'payment_exceeds_notional_cap'
    | 'cognition_cap_exceeded'
    | SoftRailReason;
}

/**
 * Combined hard + soft rail preflight. The caller (server.ts /execute
 * handler) hits this BEFORE forwarding the request to the enclave, so the
 * inference itself never happens for a disallowed action.
 *
 * Order mirrors Move's `capability::assert_can_execute` exactly (revoked →
 * pause → owner → version → action → payment) so a host-side rejection
 * surfaces with the same reason the on-chain entry would.
 *
 * The race between `fetchCapability` and `signAndExecuteTransaction` is
 * caught by the PTB's `expected_capability_version`. The preflight version
 * check here is operator-facing: a caller passing a stale `expectedVersion`
 * (e.g., from a cached cap snapshot) gets a fast 4xx instead of burning
 * gas on a doomed PTB.
 */
export async function preflight(
  client: SuiClient,
  registry: ActionClassRegistry,
  input: PreflightInput,
): Promise<PreflightOk | PreflightDeny> {
  const capRef = await fetchCapability(client, input.capId);
  const cap = capRef.cap;

  if (cap.revoked) return { ok: false, reason: 'revoked' };
  if (cap.pauseMode !== 'active') return { ok: false, reason: 'paused' };
  if (cap.owner !== input.walletAddress) return { ok: false, reason: 'owner_mismatch' };
  if (
    input.expectedCapabilityVersion !== undefined &&
    input.expectedCapabilityVersion !== cap.version
  ) {
    return { ok: false, reason: 'version_mismatch' };
  }
  if (!cap.allowedActions.includes(input.proposal.actionType)) {
    return { ok: false, reason: 'action_not_allowed' };
  }
  if (input.proposal.paymentAmount > cap.riskLimits.maxNotionalPerAction) {
    return { ok: false, reason: 'payment_exceeds_notional_cap' };
  }

  // Cognition cap: only blocks cognition AERs. Execution AERs bypass.
  if (input.proposal.eventClass === 1 && cognitionCapExceeded(input.walletAddress)) {
    return { ok: false, reason: 'cognition_cap_exceeded' };
  }

  const dailyLoss = input.queryDailyLoss
    ? await input.queryDailyLoss(cap.owner)
    : null;

  const soft = checkSoftRail(cap, input.proposal, registry, dailyLoss);
  if (!soft.ok) return { ok: false, reason: soft.reason };

  return { ok: true, capRef };
}

/**
 * Convenience loader used by server boot. Always read action-classes.json
 * from a single canonical path so a misconfigured working directory surfaces
 * loudly at boot rather than mid-request.
 */
export { loadActionClasses };
