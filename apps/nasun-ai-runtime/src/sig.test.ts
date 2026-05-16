import { describe, it, expect } from 'vitest';
import {
  ZERO_ACTION_CALL_HASH,
  canonicalJson,
  canonicalJsonSha256,
  computeActionCallHash,
  type ActionCallHashInput,
} from './sig.js';

/**
 * Golden vector pinning the runtime↔Lambda canonical JSON hash contract for
 * the PR1.5 swap path. The matching Lambda assertion (same SAMPLE, same
 * expected hash) lives next to `_shared/canonical-hash.ts` and must stay in
 * lockstep with this file. Drift = sig2 verification failure on every swap.
 */
const SAMPLE: ActionCallHashInput = {
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

const GOLDEN_HASH = '0x7f0f4b3d450b5abaa4a5c12b3f0f7745393c385e8fb0592602e2ec3d6fdfc215';

describe('sig', () => {
  describe('ZERO_ACTION_CALL_HASH', () => {
    it('is 0x-prefixed 64-char lowercase hex of zeroes', () => {
      expect(ZERO_ACTION_CALL_HASH).toBe('0x' + '00'.repeat(32));
    });
  });

  describe('canonicalJson', () => {
    it('sorts keys at every depth', () => {
      const a = canonicalJson({ b: 1, a: { d: 2, c: 3 } });
      const b = canonicalJson({ a: { c: 3, d: 2 }, b: 1 });
      expect(a).toBe(b);
      expect(a).toBe('{"a":{"c":3,"d":2},"b":1}');
    });
  });

  describe('canonicalJsonSha256', () => {
    it('produces stable 0x-prefixed sha256 regardless of construction order', () => {
      const reordered: ActionCallHashInput = {
        spend: SAMPLE.spend,
        escrow: SAMPLE.escrow,
        actionCall: SAMPLE.actionCall,
      };
      expect(canonicalJsonSha256(SAMPLE)).toBe(GOLDEN_HASH);
      expect(canonicalJsonSha256(reordered)).toBe(GOLDEN_HASH);
    });
  });

  describe('computeActionCallHash', () => {
    it('matches the golden vector — runtime↔Lambda canonical hash invariant', () => {
      // If this assertion ever fails, the Lambda _shared/canonical-hash.ts
      // implementation has drifted from sig.ts and every swap-path settle
      // will fail sig2 verification. Investigate before bumping the hash.
      expect(computeActionCallHash(SAMPLE)).toBe(GOLDEN_HASH);
    });
  });
});
