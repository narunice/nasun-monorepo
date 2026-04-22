// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { SOL_DEVNET_RPC, SOL_ADDRESS_RE, isValidSolAddress } from '../solana';

// Testnet-only invariant: uju is a devnet prototype. Mainnet SOL RPC must
// never be introduced. This guard fails CI if SOL_DEVNET_RPC is ever edited
// to point at mainnet-beta.
describe('SOL endpoints are testnet-only (regression guard)', () => {
  it('SOL_DEVNET_RPC contains "devnet"', () => {
    expect(SOL_DEVNET_RPC).toContain('devnet');
  });

  it('SOL_DEVNET_RPC does not contain "mainnet"', () => {
    expect(SOL_DEVNET_RPC).not.toContain('mainnet');
  });

  it('SOL_DEVNET_RPC does not match bare api.solana.com (mainnet-beta host)', () => {
    expect(SOL_DEVNET_RPC).not.toMatch(/^https?:\/\/api\.solana\.com/);
    expect(SOL_DEVNET_RPC).not.toMatch(/mainnet-beta/);
  });

  it('SOL_DEVNET_RPC is the expected devnet endpoint', () => {
    expect(SOL_DEVNET_RPC).toBe('https://api.devnet.solana.com');
  });
});

describe('SOL_ADDRESS_RE', () => {
  it('accepts valid 43-44 char base58 addresses', () => {
    // 44-char all-1s string: valid under regex (all chars in base58 alphabet, length 44)
    expect(isValidSolAddress('11111111111111111111111111111111111111111111')).toBe(true);
    // Typical 44-char address
    expect(isValidSolAddress('4Nd1mYv8N2n5uZ8kKv3q8Uk7n8Vt9s3c2rQ2n6dZyvBF')).toBe(true);
  });

  it('rejects addresses with 0, O, I, l (non-base58 chars)', () => {
    expect(isValidSolAddress('4Nd1mYv8N2n5uZ8kKv3q8Uk7n8Vt9s3c2rQ2n6dZyv0F')).toBe(false);
    expect(isValidSolAddress('4Nd1mYv8N2n5uZ8kKv3q8Uk7n8Vt9s3c2rQ2n6dZyvOF')).toBe(false);
    expect(isValidSolAddress('4Nd1mYv8N2n5uZ8kKv3q8Uk7n8Vt9s3c2rQ2n6dZyvIF')).toBe(false);
    expect(isValidSolAddress('4Nd1mYv8N2n5uZ8kKv3q8Uk7n8Vt9s3c2rQ2n6dZyvlF')).toBe(false);
  });

  it('rejects too short / too long', () => {
    expect(isValidSolAddress('4Nd1mYv8N2n5uZ')).toBe(false);
    expect(isValidSolAddress('4Nd1mYv8N2n5uZ8kKv3q8Uk7n8Vt9s3c2rQ2n6dZyvBF4Nd1mYv8N2n5uZ8kKv3')).toBe(false);
  });

  it('regex is exported for direct use', () => {
    expect(SOL_ADDRESS_RE).toBeInstanceOf(RegExp);
  });
});
