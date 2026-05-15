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

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(value as Record<string, unknown>).sort()) {
    out[k] = sortKeys((value as Record<string, unknown>)[k]);
  }
  return out;
}
