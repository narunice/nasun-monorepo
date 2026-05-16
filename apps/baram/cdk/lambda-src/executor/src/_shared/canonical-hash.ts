/**
 * Canonical JSON hashing shared between Lambda and the runtime.
 *
 * The runtime signs `envelopeHash = sha256(canonicalJson(envelope))` so the
 * Lambda must recompute the exact same bytes to verify. Stable across
 * Node/V8 versions: keys sorted lexicographically at every depth, no
 * whitespace, no trailing newline. JSON.stringify is sufficient given the
 * envelope schema contains only plain objects, arrays, strings, and
 * finite numbers.
 */

import { createHash } from 'crypto';

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

export function sha256Hex0x(input: string | Uint8Array): string {
  const h = createHash('sha256').update(input).digest('hex');
  return `0x${h}`;
}

export function canonicalJsonSha256(value: unknown): string {
  return sha256Hex0x(canonicalJson(value));
}

// ============================================================================
// PR1.5 swap action-call hashing
// ============================================================================

export const ZERO_ACTION_CALL_HASH = '0x' + '00'.repeat(32);

/**
 * Wire-level input bound by `actionCallHash`. Must mirror runtime's
 * `ActionCallHashInput` in apps/nasun-ai-runtime/src/sig.ts exactly — drift
 * here means every swap-path sig2 verify fails. Field ordering is irrelevant;
 * canonicalJson sorts at every depth. The matching golden vector test pins
 * the SAMPLE → GOLDEN_HASH contract on both sides.
 */
export interface ActionCallHashInput {
  actionCall: {
    targetPackage: string;
    module: string;
    fn: string;
    typeArguments: string[];
    args: Array<{
      kind: 'object' | 'pure' | 'pipe';
      id?: string;
      bytes?: string;
      from?: 'withdraw_coin' | 'zero_deep';
    }>;
  };
  escrow: {
    objectId: string;
    initialSharedVersion: string;
    capabilityId: string;
    capabilityInitialSharedVersion: string;
  };
  spend: {
    coinAssetType: string;
    amount: string;
  };
}

/**
 * sha256(canonicalJson({actionCall, escrow, spend})). Lambda recomputes from
 * the wire body and asserts byte-equality against the runtime-provided
 * `actionCallHash` (sig2-covered) before signing the PTB.
 */
export function computeActionCallHash(input: ActionCallHashInput): string {
  return canonicalJsonSha256(input);
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(value as Record<string, unknown>).sort()) {
    out[k] = sortKeys((value as Record<string, unknown>)[k]);
  }
  return out;
}
