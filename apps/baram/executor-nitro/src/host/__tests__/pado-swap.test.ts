import { describe, it, expect } from 'vitest';
import { buildSwapActionCall, quoteMinOut, type PadoSwapConfig } from '../pado-swap.js';

const CFG: PadoSwapConfig = {
  deepbookPackageId: '0x' + 'aa'.repeat(32),
  poolId: '0x' + 'bb'.repeat(32),
  baseType: '0x' + 'cc'.repeat(32) + '::nbtc::NBTC',
  quoteType: '0x' + 'dd'.repeat(32) + '::nusdc::NUSDC',
  deepType: '0x' + 'ee'.repeat(32) + '::deep::DEEP',
};

describe('pado-swap.buildSwapActionCall', () => {
  it('BUY emits swap_exact_quote_for_base with <Base, Quote> typeArgs', () => {
    const spec = buildSwapActionCall({ config: CFG, direction: 'BUY', minOut: 100n });
    expect(spec.targetPackage).toBe(CFG.deepbookPackageId);
    expect(spec.module).toBe('pool');
    expect(spec.fn).toBe('swap_exact_quote_for_base');
    expect(spec.typeArguments).toEqual([CFG.baseType, CFG.quoteType]);
    // pool, withdraw_coin (pipe), zero_deep (pipe), min_out (pure), clock
    expect(spec.args).toHaveLength(5);
    expect(spec.args[0]).toEqual({ kind: 'object', id: CFG.poolId });
    expect(spec.args[1]).toEqual({ kind: 'pipe', from: 'withdraw_coin' });
    expect(spec.args[2]).toEqual({ kind: 'pipe', from: 'zero_deep' });
    expect(spec.args[3].kind).toBe('pure');
    expect(spec.args[4]).toEqual({ kind: 'object', id: '0x6' });
  });

  it('SELL emits swap_exact_base_for_quote with <Base, Quote> typeArgs', () => {
    const spec = buildSwapActionCall({ config: CFG, direction: 'SELL', minOut: 0n });
    expect(spec.fn).toBe('swap_exact_base_for_quote');
    expect(spec.typeArguments).toEqual([CFG.baseType, CFG.quoteType]);
    expect(spec.args[1]).toEqual({ kind: 'pipe', from: 'withdraw_coin' });
    expect(spec.args[2]).toEqual({ kind: 'pipe', from: 'zero_deep' });
  });

  it('encodes minOut as 8-byte LE u64 in the pure arg', () => {
    const spec = buildSwapActionCall({ config: CFG, direction: 'BUY', minOut: 0x0102030405060708n });
    const pureArg = spec.args[3] as { kind: 'pure'; bytes: Uint8Array };
    expect(Array.from(pureArg.bytes)).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it('rejects negative minOut', () => {
    expect(() => buildSwapActionCall({ config: CFG, direction: 'BUY', minOut: -1n })).toThrow();
  });
});

describe('pado-swap.quoteMinOut', () => {
  // Mid price: 1 NBTC = 50_000 NUSDC. Decimals: NBTC=8, NUSDC=6.
  // priceNum/priceDen represent quote-per-base in raw ratio.
  // For 1 NBTC = 50_000 NUSDC:
  //   1 * 1e8 base_raw <-> 50_000 * 1e6 quote_raw
  //   priceNum = 50_000 * 1e6 = 5e10 (quote_raw per 1e8 base_raw)
  //   priceDen = 1e8           (1 base in raw)
  // Then BUY 50 NUSDC (5e7 quote_raw) -> base out = 5e7 * 1e8 / 5e10 = 1e5 base_raw
  const priceNum = 50_000n * 1_000_000n;
  const priceDen = 100_000_000n;

  it('BUY with no slippage returns full expected output', () => {
    const out = quoteMinOut({
      direction: 'BUY',
      sizeInRaw: 50_000_000n,
      priceNum,
      priceDen,
      slippageBps: 0,
    });
    expect(out).toBe(100_000n);
  });

  it('SELL with 100 bps (1.0%) tolerates 1% less', () => {
    const out = quoteMinOut({
      direction: 'SELL',
      sizeInRaw: 100_000n,
      priceNum,
      priceDen,
      slippageBps: 100,
    });
    // expected = 100_000 * 5e10 / 1e8 = 5e7. * (10_000 - 100) / 10_000 = 4.95e7
    expect(out).toBe(49_500_000n);
  });

  it('rejects out-of-range slippage', () => {
    expect(() =>
      quoteMinOut({ direction: 'BUY', sizeInRaw: 1n, priceNum, priceDen, slippageBps: -1 }),
    ).toThrow();
    expect(() =>
      quoteMinOut({ direction: 'BUY', sizeInRaw: 1n, priceNum, priceDen, slippageBps: 10_001 }),
    ).toThrow();
  });

  it('rejects non-positive price', () => {
    expect(() =>
      quoteMinOut({ direction: 'BUY', sizeInRaw: 1n, priceNum: 0n, priceDen, slippageBps: 0 }),
    ).toThrow();
  });
});
