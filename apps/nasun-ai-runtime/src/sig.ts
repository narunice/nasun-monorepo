/**
 * Settlement signing helpers for the trader heartbeat path (PR1.A).
 *
 * Companion of `apps/baram/cdk/lambda-src/executor/src/_shared/sig-verify.ts`.
 * The two files must stay byte-for-byte aligned on canonical message
 * construction — fixed field order, lowercase hex, pipe delimiter, no
 * whitespace.
 *
 * actionCallHash is reserved in PR1.A. The runtime emits the zero-bytes
 * value when no swap is attached; PR1.5 will compute
 * sha256(canonicalJson({actionCall, escrow, spend})) and fill it in.
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

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(value as Record<string, unknown>).sort()) {
    out[k] = sortKeys((value as Record<string, unknown>)[k]);
  }
  return out;
}
