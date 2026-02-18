import { describe, it, expect } from 'vitest';
import { TOKENS, POOLS, NETWORK_CONFIG, getNetworkType, isFaucetAvailable } from './network';

// ========================================
// TOKENS Configuration (Sprint 3B)
// ========================================
describe('TOKENS', () => {
  it('defines NASUN token', () => {
    expect(TOKENS.NASUN.symbol).toBe('NSN');
    expect(TOKENS.NASUN.decimals).toBe(9);
    expect(TOKENS.NASUN.type).toBe('0x2::sui::SUI');
  });

  it('defines NBTC token', () => {
    expect(TOKENS.NBTC.symbol).toBe('NBTC');
    expect(TOKENS.NBTC.decimals).toBe(8);
  });

  it('defines NUSDC token', () => {
    expect(TOKENS.NUSDC.symbol).toBe('NUSDC');
    expect(TOKENS.NUSDC.decimals).toBe(6);
  });

  it('defines NETH token with 8 decimals', () => {
    expect(TOKENS.NETH.symbol).toBe('NETH');
    expect(TOKENS.NETH.name).toBe('Nasun ETH');
    expect(TOKENS.NETH.decimals).toBe(8);
  });

  it('defines NSOL token with 9 decimals', () => {
    expect(TOKENS.NSOL.symbol).toBe('NSOL');
    expect(TOKENS.NSOL.name).toBe('Nasun SOL');
    expect(TOKENS.NSOL.decimals).toBe(9);
  });

  it('all tokens have required fields', () => {
    for (const [, token] of Object.entries(TOKENS)) {
      expect(token.symbol).toBeTruthy();
      expect(token.name).toBeTruthy();
      expect(typeof token.decimals).toBe('number');
      expect(token.decimals).toBeGreaterThanOrEqual(0);
    }
  });
});

// ========================================
// POOLS Configuration (Sprint 3B)
// ========================================
describe('POOLS', () => {
  it('defines NBTC_NUSDC pool', () => {
    expect(POOLS.NBTC_NUSDC.baseToken).toBe(TOKENS.NBTC);
    expect(POOLS.NBTC_NUSDC.quoteToken).toBe(TOKENS.NUSDC);
    expect(POOLS.NBTC_NUSDC.tickSize).toBe(100000);
    expect(POOLS.NBTC_NUSDC.lotSize).toBe(1000);
  });

  it('defines NASUN_NUSDC pool', () => {
    expect(POOLS.NASUN_NUSDC.baseToken).toBe(TOKENS.NASUN);
    expect(POOLS.NASUN_NUSDC.quoteToken).toBe(TOKENS.NUSDC);
    expect(POOLS.NASUN_NUSDC.tickSize).toBe(10000);
    expect(POOLS.NASUN_NUSDC.lotSize).toBe(1000000000);
  });

  it('defines NETH_NUSDC pool (Sprint 3B)', () => {
    expect(POOLS.NETH_NUSDC.baseToken).toBe(TOKENS.NETH);
    expect(POOLS.NETH_NUSDC.quoteToken).toBe(TOKENS.NUSDC);
    expect(POOLS.NETH_NUSDC.tickSize).toBe(100000);   // $0.10
    expect(POOLS.NETH_NUSDC.lotSize).toBe(1000);       // 0.00001 ETH (8 dec)
  });

  it('defines NSOL_NUSDC pool (Sprint 3B)', () => {
    expect(POOLS.NSOL_NUSDC.baseToken).toBe(TOKENS.NSOL);
    expect(POOLS.NSOL_NUSDC.quoteToken).toBe(TOKENS.NUSDC);
    expect(POOLS.NSOL_NUSDC.tickSize).toBe(10000);
    expect(POOLS.NSOL_NUSDC.lotSize).toBe(1000000000); // 1.0 SOL
  });

  it('all pools use NUSDC as quote token', () => {
    for (const pool of Object.values(POOLS)) {
      expect(pool.quoteToken).toBe(TOKENS.NUSDC);
    }
  });

  it('all pools have standard fees (5 maker, 10 taker bps)', () => {
    for (const pool of Object.values(POOLS)) {
      expect(pool.makerFeeBps).toBe(5);
      expect(pool.takerFeeBps).toBe(10);
    }
  });
});

// ========================================
// NETWORK_CONFIG
// ========================================
describe('NETWORK_CONFIG', () => {
  it('has V2 token config fields', () => {
    expect('tokensV2Package' in NETWORK_CONFIG).toBe(true);
    expect('nethType' in NETWORK_CONFIG).toBe(true);
    expect('nsolType' in NETWORK_CONFIG).toBe(true);
  });

  it('has V2 pool config fields', () => {
    expect('poolNethNusdc' in NETWORK_CONFIG).toBe(true);
    expect('poolNsolNusdc' in NETWORK_CONFIG).toBe(true);
  });

  it('has keeper config fields (Sprint 4)', () => {
    expect('deepbookPackage' in NETWORK_CONFIG).toBe(true);
  });
});

// ========================================
// getNetworkType
// ========================================
describe('getNetworkType', () => {
  it('returns a valid network type', () => {
    const result = getNetworkType();
    expect(['devnet', 'testnet', 'mainnet']).toContain(result);
  });
});

// ========================================
// isFaucetAvailable
// ========================================
describe('isFaucetAvailable', () => {
  it('returns boolean', () => {
    expect(typeof isFaucetAvailable()).toBe('boolean');
  });
});
