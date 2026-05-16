/**
 * Body-validation unit tests for /infer and /execute-capability.
 *
 * Service-mocking integration coverage is deferred to dev smoke (Step 9).
 * These tests exercise the synchronous validators that gate every code path
 * downstream of route dispatch, so a wire-format regression fails fast.
 */

import { describe, it, expect } from 'vitest';
import {
  ZERO_ACTION_CALL_HASH,
  canonicalJson,
  canonicalJsonSha256,
  computeActionCallHash,
  sha256Hex0x,
  type ActionCallHashInput,
} from './_shared/canonical-hash';

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

  it('ZERO_ACTION_CALL_HASH is 0x-prefixed 64-char zero-bytes lower hex', () => {
    expect(ZERO_ACTION_CALL_HASH).toBe('0x' + '00'.repeat(32));
  });
});

// Golden vector pinning the runtime↔Lambda canonical hash contract for the
// PR1.5 swap path. Mirrors apps/nasun-ai-runtime/src/sig.test.ts exactly. If
// this assertion ever fails, runtime sig.ts and Lambda _shared/canonical-hash.ts
// have drifted and every swap-path settle will fail sig2 verification.
// Investigate before bumping the hash.
const SWAP_GOLDEN_SAMPLE: ActionCallHashInput = {
  actionCall: {
    targetPackage: '0xdeepbookv3deepbookv3deepbookv3deepbookv3deepbookv3deepbookv301',
    module: 'pool',
    fn: 'swap_exact_quote_for_base',
    typeArguments: [
      '0xnbtcnbtcnbtcnbtcnbtcnbtcnbtcnbtcnbtcnbtcnbtcnbtcnbtcnbtcnbtc01::nbtc::NBTC',
      '0xnusdcnusdcnusdcnusdcnusdcnusdcnusdcnusdcnusdcnusdcnusdcnusdc01::nusdc::NUSDC',
    ],
    args: [
      { kind: 'object', id: '0xpool00000000000000000000000000000000000000000000000000000000001' },
      { kind: 'pipe', from: 'withdraw_coin' },
      { kind: 'pipe', from: 'zero_deep' },
      { kind: 'pure', bytes: 'AAAAAAAAAAA=' },
      { kind: 'object', id: '0x6' },
    ],
  },
  escrow: {
    objectId: '0xescrow000000000000000000000000000000000000000000000000000000001',
    initialSharedVersion: '12345',
    capabilityId: '0xcap00000000000000000000000000000000000000000000000000000000001',
    capabilityInitialSharedVersion: '12300',
  },
  spend: {
    coinAssetType: '0xnusdcnusdcnusdcnusdcnusdcnusdcnusdcnusdcnusdcnusdcnusdcnusdc01::nusdc::NUSDC',
    amount: '1000000',
  },
};

const SWAP_GOLDEN_HASH = '0x7f0f4b3d450b5abaa4a5c12b3f0f7745393c385e8fb0592602e2ec3d6fdfc215';

describe('computeActionCallHash (PR1.5 runtime↔Lambda golden vector)', () => {
  it('matches the SAMPLE→GOLDEN_HASH contract pinned in sig.test.ts', () => {
    expect(computeActionCallHash(SWAP_GOLDEN_SAMPLE)).toBe(SWAP_GOLDEN_HASH);
  });

  it('is invariant under key-order rearrangement at the top level', () => {
    const reordered: ActionCallHashInput = {
      spend: SWAP_GOLDEN_SAMPLE.spend,
      escrow: SWAP_GOLDEN_SAMPLE.escrow,
      actionCall: SWAP_GOLDEN_SAMPLE.actionCall,
    };
    expect(computeActionCallHash(reordered)).toBe(SWAP_GOLDEN_HASH);
  });
});
