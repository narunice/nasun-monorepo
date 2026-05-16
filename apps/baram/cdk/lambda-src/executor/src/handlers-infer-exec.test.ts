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
import { validateSwapWireShape } from './index';
import type { ActionCallSpecWire, EscrowBlock, SpendBlock } from './types';

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

describe('validateSwapWireShape (PR1.5 swap wire validator)', () => {
  // BCS-encoded u64 min_out = 1000 -> 8 bytes little-endian base64
  const MIN_OUT_U64_LE = Buffer.from([0xe8, 0x03, 0, 0, 0, 0, 0, 0]).toString('base64');
  const POOL_ID = '0x' + 'a'.repeat(64);
  const ESCROW_ID = '0x' + 'b'.repeat(64);
  const CAP_ID = '0x' + 'c'.repeat(64);
  const PKG_ID = '0x' + 'd'.repeat(64);

  function happyActionCall(): ActionCallSpecWire {
    return {
      targetPackage: PKG_ID,
      module: 'pool',
      fn: 'swap_exact_quote_for_base',
      typeArguments: [
        '0x2::nbtc::NBTC',
        '0x2::nusdc::NUSDC',
      ],
      args: [
        { kind: 'object', id: POOL_ID },
        { kind: 'pipe', from: 'withdraw_coin' },
        { kind: 'pipe', from: 'zero_deep' },
        { kind: 'pure', bytes: MIN_OUT_U64_LE },
        { kind: 'object', id: '0x6' },
      ],
    };
  }
  function happyEscrow(): EscrowBlock {
    return {
      objectId: ESCROW_ID,
      initialSharedVersion: '12345',
      capabilityId: CAP_ID,
      capabilityInitialSharedVersion: '12346',
    };
  }
  function happySpend(): SpendBlock {
    return { coinAssetType: '0x2::nusdc::NUSDC', amount: '1000000' };
  }

  it('passes on a fully valid swap wire body', () => {
    expect(validateSwapWireShape(happyActionCall(), happyEscrow(), happySpend())).toBeNull();
  });

  it.each([
    ['invalid_target_package', (ac: ActionCallSpecWire) => { ac.targetPackage = 'not-hex'; }],
    ['invalid_module', (ac: ActionCallSpecWire) => { ac.module = 'router'; }],
    ['invalid_swap_fn', (ac: ActionCallSpecWire) => { ac.fn = 'transfer'; }],
    ['invalid_type_arguments_length', (ac: ActionCallSpecWire) => { ac.typeArguments = ['0x2::nbtc::NBTC']; }, 'invalid_type_arguments'],
    ['invalid_args_length', (ac: ActionCallSpecWire) => { ac.args = ac.args.slice(0, 4); }],
    ['invalid_pool_arg (kind)', (ac: ActionCallSpecWire) => { ac.args[0] = { kind: 'pure', bytes: 'AAAA' }; }, 'invalid_pool_arg'],
    ['invalid_pool_arg (id)', (ac: ActionCallSpecWire) => { (ac.args[0] as { id: string }).id = '0xzz'; }, 'invalid_pool_arg'],
    ['invalid_coin_in_pipe', (ac: ActionCallSpecWire) => { ac.args[1] = { kind: 'object', id: POOL_ID }; }],
    ['invalid_deep_in_pipe', (ac: ActionCallSpecWire) => { ac.args[2] = { kind: 'pipe', from: 'withdraw_coin' }; }],
    ['invalid_min_out_bytes (non-base64)', (ac: ActionCallSpecWire) => { ac.args[3] = { kind: 'pure', bytes: '!!!' }; }, 'invalid_min_out_bytes'],
    ['min_out_not_u64 (wrong length)', (ac: ActionCallSpecWire) => { ac.args[3] = { kind: 'pure', bytes: 'AAAA' }; }, 'min_out_not_u64'],
    ['invalid_clock_arg', (ac: ActionCallSpecWire) => { (ac.args[4] as { id: string }).id = '0x7'; }],
  ])('rejects actionCall: %s', (_label, mutate, expectedReason?: string) => {
    const ac = happyActionCall();
    mutate(ac);
    const result = validateSwapWireShape(ac, happyEscrow(), happySpend());
    expect(result).not.toBeNull();
    if (expectedReason) expect(result?.reason).toBe(expectedReason);
  });

  it('rejects invalid escrow.objectId', () => {
    const e = happyEscrow();
    e.objectId = 'not-hex';
    expect(validateSwapWireShape(happyActionCall(), e, happySpend())?.reason).toBe('invalid_escrow_id');
  });

  it('rejects non-decimal escrow.initialSharedVersion', () => {
    const e = happyEscrow();
    e.initialSharedVersion = '0x123';
    expect(validateSwapWireShape(happyActionCall(), e, happySpend())?.reason).toBe('invalid_escrow_initial_shared_version');
  });

  it('rejects invalid escrow.capabilityId', () => {
    const e = happyEscrow();
    e.capabilityId = 'short';
    expect(validateSwapWireShape(happyActionCall(), e, happySpend())?.reason).toBe('invalid_escrow_capability_id');
  });

  it('rejects empty spend.coinAssetType', () => {
    const s = happySpend();
    s.coinAssetType = '';
    expect(validateSwapWireShape(happyActionCall(), happyEscrow(), s)?.reason).toBe('invalid_spend_asset_type');
  });

  it('rejects spend.amount = "0"', () => {
    const s = happySpend();
    s.amount = '0';
    expect(validateSwapWireShape(happyActionCall(), happyEscrow(), s)?.reason).toBe('invalid_spend_amount');
  });

  it('rejects non-decimal spend.amount', () => {
    const s = happySpend();
    s.amount = '1.5';
    expect(validateSwapWireShape(happyActionCall(), happyEscrow(), s)?.reason).toBe('invalid_spend_amount');
  });
});
