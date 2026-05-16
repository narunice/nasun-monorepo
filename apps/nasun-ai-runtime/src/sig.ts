/**
 * Settlement signing helpers for the trader heartbeat path (PR1.A + PR1.5).
 *
 * Companion of `apps/baram/cdk/lambda-src/executor/src/_shared/sig-verify.ts`
 * and `_shared/canonical-hash.ts`. The two sides must stay byte-for-byte
 * aligned on canonical message construction (fixed field order, lowercase
 * hex, pipe delimiter, no whitespace) and on canonical JSON hashing
 * (lexicographic key sort at every depth, no whitespace).
 *
 * actionCallHash:
 *   - HOLD branch  : ZERO_ACTION_CALL_HASH (0x00..00)
 *   - swap branch  : computeActionCallHash({actionCall, escrow, spend})
 *     == sha256(canonicalJson(...)). Lambda recomputes from the wire body
 *     and asserts equality before signing the PTB.
 */

import { createHash } from 'node:crypto';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

export interface SettleSigFields {
  v: 1;
  kind: 'nasun-ai-settle';
  requestId: string;                  // u64 decimal
  promptHash: string;                 // 0x<64 hex lower>
  resultHash: string;                 // 0x<64 hex lower>
  agentAddress: string;               // 0x<64 hex lower>
  principalAddress: string;           // 0x<64 hex lower>
  capabilityId: string;               // 0x<hex lower>
  expectedCapabilityVersion: string;  // u64 decimal
  envelopeHash: string;               // 0x<64 hex lower>
  actionCallHash: string;             // 0x<64 hex lower>
}

export const ZERO_ACTION_CALL_HASH = '0x' + '00'.repeat(32);

export function canonicalSettle(f: SettleSigFields): string {
  return [
    String(f.v),
    f.kind,
    f.requestId,
    f.promptHash.toLowerCase(),
    f.resultHash.toLowerCase(),
    f.agentAddress.toLowerCase(),
    f.principalAddress.toLowerCase(),
    f.capabilityId.toLowerCase(),
    f.expectedCapabilityVersion,
    f.envelopeHash.toLowerCase(),
    f.actionCallHash.toLowerCase(),
  ].join('|');
}

export async function signSettle(
  keypair: Ed25519Keypair,
  fields: SettleSigFields,
): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalSettle(fields));
  const { signature } = await keypair.signPersonalMessage(bytes);
  return signature;
}

/**
 * Canonical JSON for envelope/lineage/wake/replay hashing. Lexicographic
 * key sort at every depth so the same data structure always serializes the
 * same way regardless of construction order. Number arrays (intent ids,
 * payload bytes) survive JSON round-trips fine.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

export function sha256Hex0x(input: string | Uint8Array): string {
  const h = createHash('sha256');
  if (typeof input === 'string') {
    h.update(input, 'utf-8');
  } else {
    h.update(Buffer.from(input));
  }
  return `0x${h.digest('hex')}`;
}

export function canonicalJsonSha256(value: unknown): string {
  return sha256Hex0x(canonicalJson(value));
}

// ============================================================================
// PR1.5 swap action-call hashing
// ============================================================================

/**
 * Wire-level input bound by `actionCallHash`. Must match exactly what the
 * runtime sends to Lambda in the `/execute-capability` body (see
 * host-client.ts `ExecuteCapabilityRequest.{actionCall,escrow,spend}`).
 * Field ordering is irrelevant — canonicalJson sorts at every depth.
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
 * sha256(canonicalJson({actionCall, escrow, spend})). Bound to sig2 via the
 * SettleSigFields.actionCallHash slot. Lambda recomputes from the wire body
 * and asserts byte-equality before signing the PTB.
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
