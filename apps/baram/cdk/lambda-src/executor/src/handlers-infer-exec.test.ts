/**
 * Body-validation unit tests for /infer and /execute-capability.
 *
 * Service-mocking integration coverage is deferred to dev smoke (Step 9).
 * These tests exercise the synchronous validators that gate every code path
 * downstream of route dispatch, so a wire-format regression fails fast.
 */

import { describe, it, expect } from 'vitest';
import { canonicalJson, canonicalJsonSha256, sha256Hex0x } from './_shared/canonical-hash';

describe('canonical-hash', () => {
  it('orders keys lexicographically at every depth', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ b: { z: 1, y: 2 }, a: [3, 1] })).toBe('{"a":[3,1],"b":{"y":2,"z":1}}');
  });

  it('produces a 0x-prefixed 64-char hex sha256', () => {
    const h = sha256Hex0x('hello');
    expect(h).toMatch(/^0x[0-9a-f]{64}$/);
    expect(h).toBe('0x2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('canonicalJsonSha256 is deterministic across key orderings', () => {
    const a = canonicalJsonSha256({ a: 1, b: 2 });
    const b = canonicalJsonSha256({ b: 2, a: 1 });
    expect(a).toBe(b);
  });
});
