/**
 * Transaction Builder Tests
 * Covers: validation, security checks, BalanceManager ops, order building, faucet, edge cases
 */

import { describe, it, expect, vi } from 'vitest';

// Mock network config before importing transactions (which depends on it)
// vi.mock factory is hoisted — cannot reference top-level variables
vi.mock('../../config/network', () => {
  const id = '0x' + '1'.repeat(64);
  return {
    NETWORK_CONFIG: {
      deepbookPackage: id,
      faucetPackage: id,
      tokenFaucet: id,
      tokensV2Package: id,
      tokenFaucetV2: id,
      claimRecordV2: id,
      rpcUrl: 'https://rpc.devnet.nasun.io',
    },
    POOLS: {
      NBTC_NUSDC: {
        id,
        baseToken: { symbol: 'NBTC', name: 'Nasun BTC', decimals: 8, type: id + '::nbtc::NBTC' },
        quoteToken: { symbol: 'NUSDC', name: 'Nasun USDC', decimals: 6, type: id + '::nusdc::NUSDC' },
        tickSize: 100000,
        lotSize: 1000,
        makerFeeBps: 5,
        takerFeeBps: 10,
      },
    },
    TOKENS: {
      NASUN: { symbol: 'NASUN', name: 'Nasun', decimals: 9, type: '0x2::sui::SUI' },
      NBTC: { symbol: 'NBTC', name: 'Nasun BTC', decimals: 8, type: id + '::nbtc::NBTC' },
      NUSDC: { symbol: 'NUSDC', name: 'Nasun USDC', decimals: 6, type: id + '::nusdc::NUSDC' },
      NETH: { symbol: 'NETH', name: 'Nasun ETH', decimals: 8, type: id + '::neth::NETH' },
      NSOL: { symbol: 'NSOL', name: 'Nasun SOL', decimals: 9, type: id + '::nsol::NSOL' },
    },
  };
});

import {
  buildCreateBalanceManager,
  buildDeposit,
  buildWithdraw,
  buildPlaceLimitOrder,
  buildPlaceMarketOrder,
  buildCancelOrder,
  buildSwapExactBaseForQuote,
  buildSwapExactQuoteForBase,
  buildRequestTokens,
  buildWithdrawAll,
} from './transactions';
import { buildNbtcFaucetTx, buildNusdcFaucetTx } from '@nasun/wallet';
import type { PlaceLimitOrderParams, PlaceMarketOrderParams, PoolConfig } from './types';
import { calcLockedAmounts } from './types';

// ========================================
// Mock Pool for testing
// ========================================
const MOCK_POOL: PoolConfig = {
  id: '0x' + 'a'.repeat(64),
  baseToken: {
    symbol: 'NBTC',
    name: 'Nasun BTC',
    decimals: 8,
    type: '0x' + 'b'.repeat(64) + '::nbtc::NBTC',
  },
  quoteToken: {
    symbol: 'NUSDC',
    name: 'Nasun USDC',
    decimals: 6,
    type: '0x' + 'c'.repeat(64) + '::nusdc::NUSDC',
  },
  tickSize: 100000,   // $0.10 in raw units (6 decimals)
  lotSize: 1000,       // 0.00001 BTC (8 decimals)
  makerFeeBps: 5,
  takerFeeBps: 10,
};

const MOCK_BM_ID = '0x' + 'd'.repeat(64);
const MOCK_COIN_ID = '0x' + 'e'.repeat(64);
const MOCK_ADDRESS = '0x' + 'f'.repeat(64);

// ========================================
// BalanceManager Creation
// ========================================
describe('buildCreateBalanceManager', () => {
  it('returns a valid Transaction object', () => {
    const tx = buildCreateBalanceManager();
    expect(tx).toBeDefined();
    expect(typeof tx.build).toBe('function');
  });
});

// ========================================
// Deposit
// ========================================
describe('buildDeposit', () => {
  it('builds deposit transaction with valid params', () => {
    const tx = buildDeposit(
      MOCK_BM_ID,
      MOCK_COIN_ID,
      MOCK_POOL.baseToken.type!,
    );
    expect(tx).toBeDefined();
  });
});

// ========================================
// Withdraw
// ========================================
describe('buildWithdraw', () => {
  it('builds withdraw transaction with valid params', () => {
    const tx = buildWithdraw(
      MOCK_BM_ID,
      1000000n,
      MOCK_POOL.quoteToken.type!,
      MOCK_ADDRESS,
    );
    expect(tx).toBeDefined();
  });

  it('throws for zero withdraw amount', () => {
    expect(() =>
      buildWithdraw(MOCK_BM_ID, 0n, MOCK_POOL.quoteToken.type!, MOCK_ADDRESS)
    ).toThrow('Withdraw amount must be positive');
  });

  it('throws for negative withdraw amount', () => {
    expect(() =>
      buildWithdraw(MOCK_BM_ID, -100n, MOCK_POOL.quoteToken.type!, MOCK_ADDRESS)
    ).toThrow('Withdraw amount must be positive');
  });
});

// ========================================
// WithdrawAll
// ========================================
describe('buildWithdrawAll', () => {
  it('builds withdraw-all transaction', () => {
    const tx = buildWithdrawAll(MOCK_BM_ID, MOCK_ADDRESS, MOCK_POOL);
    expect(tx).toBeDefined();
  });
});

// ========================================
// Place Limit Order
// ========================================
describe('buildPlaceLimitOrder', () => {
  it('builds valid limit buy order', () => {
    const params: PlaceLimitOrderParams = {
      price: 97000_000000n,  // $97,000 in NUSDC raw (6 decimals)
      quantity: 100000n,      // 0.001 BTC (8 decimals)
      isBid: true,
    };
    const tx = buildPlaceLimitOrder(MOCK_BM_ID, params, MOCK_POOL);
    expect(tx).toBeDefined();
  });

  it('builds valid limit sell order', () => {
    const params: PlaceLimitOrderParams = {
      price: 100000_000000n,
      quantity: 50000n,
      isBid: false,
    };
    const tx = buildPlaceLimitOrder(MOCK_BM_ID, params, MOCK_POOL);
    expect(tx).toBeDefined();
  });

  // --- Price Validation ---
  it('throws for zero price', () => {
    const params: PlaceLimitOrderParams = {
      price: 0n,
      quantity: 100000n,
      isBid: true,
    };
    expect(() => buildPlaceLimitOrder(MOCK_BM_ID, params, MOCK_POOL))
      .toThrow('[Security] Price must be positive');
  });

  it('throws for negative price', () => {
    const params: PlaceLimitOrderParams = {
      price: -1n,
      quantity: 100000n,
      isBid: true,
    };
    expect(() => buildPlaceLimitOrder(MOCK_BM_ID, params, MOCK_POOL))
      .toThrow('[Security] Price must be positive');
  });

  it('throws for price exceeding MAX_PRICE', () => {
    const params: PlaceLimitOrderParams = {
      price: 100_000_000_000_001n,
      quantity: 100000n,
      isBid: true,
    };
    expect(() => buildPlaceLimitOrder(MOCK_BM_ID, params, MOCK_POOL))
      .toThrow('[Security] Price exceeds maximum allowed value');
  });

  // --- Quantity Validation ---
  it('throws for zero quantity', () => {
    const params: PlaceLimitOrderParams = {
      price: 97000_000000n,
      quantity: 0n,
      isBid: true,
    };
    expect(() => buildPlaceLimitOrder(MOCK_BM_ID, params, MOCK_POOL))
      .toThrow('[Security] Quantity must be positive');
  });

  it('throws for quantity exceeding MAX_QUANTITY', () => {
    const params: PlaceLimitOrderParams = {
      price: 97000_000000n,
      quantity: 100_000_000_000_001n,
      isBid: true,
    };
    expect(() => buildPlaceLimitOrder(MOCK_BM_ID, params, MOCK_POOL))
      .toThrow('[Security] Quantity exceeds maximum allowed value');
  });

  // --- Tick Size Validation ---
  it('throws when price is not a multiple of tick size', () => {
    const params: PlaceLimitOrderParams = {
      price: 97000_050000n,  // not aligned to tickSize 100000
      quantity: 100000n,
      isBid: true,
    };
    expect(() => buildPlaceLimitOrder(MOCK_BM_ID, params, MOCK_POOL))
      .toThrow('Price must be multiple of tick size');
  });

  it('accepts price aligned to tick size', () => {
    const params: PlaceLimitOrderParams = {
      price: 97000_100000n,  // aligned to tickSize 100000
      quantity: 100000n,
      isBid: true,
    };
    const tx = buildPlaceLimitOrder(MOCK_BM_ID, params, MOCK_POOL);
    expect(tx).toBeDefined();
  });

  // --- Lot Size Validation ---
  it('throws when quantity is not a multiple of lot size', () => {
    const params: PlaceLimitOrderParams = {
      price: 97000_000000n,
      quantity: 1500n,  // not aligned to lotSize 1000
      isBid: true,
    };
    expect(() => buildPlaceLimitOrder(MOCK_BM_ID, params, MOCK_POOL))
      .toThrow('Quantity must be multiple of lot size');
  });

  it('accepts quantity aligned to lot size', () => {
    const params: PlaceLimitOrderParams = {
      price: 97000_000000n,
      quantity: 3000n,  // 3 lots
      isBid: true,
    };
    const tx = buildPlaceLimitOrder(MOCK_BM_ID, params, MOCK_POOL);
    expect(tx).toBeDefined();
  });

  // --- Pool Validation ---
  it('throws for missing pool ID', () => {
    const badPool = { ...MOCK_POOL, id: undefined };
    const params: PlaceLimitOrderParams = {
      price: 97000_000000n,
      quantity: 100000n,
      isBid: true,
    };
    expect(() => buildPlaceLimitOrder(MOCK_BM_ID, params, badPool))
      .toThrow('[Security]');
  });

  it('throws for invalid pool ID format', () => {
    const badPool = { ...MOCK_POOL, id: '0xINVALID' };
    const params: PlaceLimitOrderParams = {
      price: 97000_000000n,
      quantity: 100000n,
      isBid: true,
    };
    expect(() => buildPlaceLimitOrder(MOCK_BM_ID, params, badPool))
      .toThrow('[Security] Invalid');
  });

  it('throws for missing token types', () => {
    const badPool = {
      ...MOCK_POOL,
      baseToken: { ...MOCK_POOL.baseToken, type: undefined },
    };
    const params: PlaceLimitOrderParams = {
      price: 97000_000000n,
      quantity: 100000n,
      isBid: true,
    };
    expect(() => buildPlaceLimitOrder(MOCK_BM_ID, params, badPool))
      .toThrow('[Security] Missing token types');
  });

  // --- Edge Cases: Boundary Values ---
  it('accepts minimum valid price (1 tick)', () => {
    const params: PlaceLimitOrderParams = {
      price: 100000n,  // exactly 1 tick (0.10 NUSDC)
      quantity: 1000n,  // 1 lot
      isBid: true,
    };
    const tx = buildPlaceLimitOrder(MOCK_BM_ID, params, MOCK_POOL);
    expect(tx).toBeDefined();
  });

  it('accepts exactly MAX_PRICE', () => {
    // MAX_PRICE = 100_000_000_000_000n
    // Must be tick-aligned: 100_000_000_000_000 % 100000 = 0 ✓
    const params: PlaceLimitOrderParams = {
      price: 100_000_000_000_000n,
      quantity: 1000n,
      isBid: true,
    };
    const tx = buildPlaceLimitOrder(MOCK_BM_ID, params, MOCK_POOL);
    expect(tx).toBeDefined();
  });

  it('accepts exactly MAX_QUANTITY', () => {
    // Must be lot-aligned: 100_000_000_000_000 % 1000 = 0 ✓
    const params: PlaceLimitOrderParams = {
      price: 100000n,
      quantity: 100_000_000_000_000n,
      isBid: true,
    };
    const tx = buildPlaceLimitOrder(MOCK_BM_ID, params, MOCK_POOL);
    expect(tx).toBeDefined();
  });
});

// ========================================
// Place Market Order
// ========================================
describe('buildPlaceMarketOrder', () => {
  it('builds valid market buy order', () => {
    const params: PlaceMarketOrderParams = {
      quantity: 100000n,
      isBid: true,
    };
    const tx = buildPlaceMarketOrder(MOCK_BM_ID, params, MOCK_POOL);
    expect(tx).toBeDefined();
  });

  it('builds valid market sell order', () => {
    const params: PlaceMarketOrderParams = {
      quantity: 50000n,
      isBid: false,
    };
    const tx = buildPlaceMarketOrder(MOCK_BM_ID, params, MOCK_POOL);
    expect(tx).toBeDefined();
  });

  it('throws for zero quantity', () => {
    const params: PlaceMarketOrderParams = {
      quantity: 0n,
      isBid: true,
    };
    expect(() => buildPlaceMarketOrder(MOCK_BM_ID, params, MOCK_POOL))
      .toThrow('[Security] Quantity must be positive');
  });

  it('throws for quantity exceeding MAX', () => {
    const params: PlaceMarketOrderParams = {
      quantity: 100_000_000_000_001n,
      isBid: true,
    };
    expect(() => buildPlaceMarketOrder(MOCK_BM_ID, params, MOCK_POOL))
      .toThrow('[Security] Quantity exceeds maximum');
  });

  it('throws for invalid pool ID', () => {
    const badPool = { ...MOCK_POOL, id: 'invalid-id' };
    const params: PlaceMarketOrderParams = {
      quantity: 100000n,
      isBid: true,
    };
    expect(() => buildPlaceMarketOrder(MOCK_BM_ID, params, badPool))
      .toThrow('[Security]');
  });
});

// ========================================
// Cancel Order
// ========================================
describe('buildCancelOrder', () => {
  it('builds cancel transaction', () => {
    const tx = buildCancelOrder(MOCK_BM_ID, '12345', MOCK_POOL);
    expect(tx).toBeDefined();
  });
});

// ========================================
// Swap - Slippage Protection
// ========================================
describe('buildSwapExactBaseForQuote - Slippage Protection', () => {
  it('builds valid swap with positive minOutput', () => {
    const tx = buildSwapExactBaseForQuote(
      MOCK_COIN_ID,
      '0x' + '1'.repeat(64), // deep coin
      1000000n,              // minQuoteOut
      MOCK_ADDRESS,
    );
    expect(tx).toBeDefined();
  });

  it('throws when minOutput is zero (no slippage protection)', () => {
    expect(() =>
      buildSwapExactBaseForQuote(
        MOCK_COIN_ID,
        '0x' + '1'.repeat(64),
        0n,
        MOCK_ADDRESS,
      )
    ).toThrow('[Security] Minimum output must be positive');
  });

  it('throws when minOutput is negative', () => {
    expect(() =>
      buildSwapExactBaseForQuote(
        MOCK_COIN_ID,
        '0x' + '1'.repeat(64),
        -1n,
        MOCK_ADDRESS,
      )
    ).toThrow('[Security] Minimum output must be positive');
  });
});

describe('buildSwapExactQuoteForBase - Slippage Protection', () => {
  it('builds valid swap with positive minOutput', () => {
    const tx = buildSwapExactQuoteForBase(
      MOCK_COIN_ID,
      '0x' + '1'.repeat(64),
      100000n,
      MOCK_ADDRESS,
    );
    expect(tx).toBeDefined();
  });

  it('throws when minOutput is zero', () => {
    expect(() =>
      buildSwapExactQuoteForBase(
        MOCK_COIN_ID,
        '0x' + '1'.repeat(64),
        0n,
        MOCK_ADDRESS,
      )
    ).toThrow('[Security] Minimum output must be positive');
  });
});

// ========================================
// Faucet - Token Requests
// ========================================
describe('Faucet Transaction Builders', () => {
  it('buildRequestTokens returns transaction', () => {
    const tx = buildRequestTokens();
    expect(tx).toBeDefined();
  });

  it('buildNbtcFaucetTx returns transaction', () => {
    const tx = buildNbtcFaucetTx();
    expect(tx).toBeDefined();
  });

  it('buildNusdcFaucetTx returns transaction', () => {
    const tx = buildNusdcFaucetTx();
    expect(tx).toBeDefined();
  });
});

// ========================================
// Locked Amount Calculation
// ========================================
describe('calcLockedAmounts', () => {
  it('calculates locked quote for buy orders', () => {
    const orders = [
      { price: 97000, quantity: 0.01, isBid: true },
      { price: 98000, quantity: 0.02, isBid: true },
    ];
    const { lockedQuote, lockedBase } = calcLockedAmounts(orders);
    expect(lockedQuote).toBeCloseTo(97000 * 0.01 + 98000 * 0.02, 2);
    expect(lockedBase).toBe(0);
  });

  it('calculates locked base for sell orders', () => {
    const orders = [
      { price: 97000, quantity: 0.05, isBid: false },
      { price: 98000, quantity: 0.03, isBid: false },
    ];
    const { lockedQuote, lockedBase } = calcLockedAmounts(orders);
    expect(lockedQuote).toBe(0);
    expect(lockedBase).toBeCloseTo(0.08, 6);
  });

  it('handles mixed buy and sell orders', () => {
    const orders = [
      { price: 97000, quantity: 0.01, isBid: true },
      { price: 98000, quantity: 0.02, isBid: false },
    ];
    const { lockedQuote, lockedBase } = calcLockedAmounts(orders);
    expect(lockedQuote).toBeCloseTo(970, 2);
    expect(lockedBase).toBeCloseTo(0.02, 6);
  });

  it('returns zeros for empty array', () => {
    const { lockedQuote, lockedBase } = calcLockedAmounts([]);
    expect(lockedQuote).toBe(0);
    expect(lockedBase).toBe(0);
  });
});
