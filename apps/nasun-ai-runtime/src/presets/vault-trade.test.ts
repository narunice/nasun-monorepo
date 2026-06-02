import { describe, it, expect } from 'vitest';

import {
  decideVaultTrade,
  computeOrderParams,
  buildExecuteTradeTx,
  VAULT_CONFIG,
} from './vault-trade.js';

// ~$71,746 in price-raw (x1e7) terms.
const MARK = 717_464_600_000n;

describe('decideVaultTrade', () => {
  it('HOLDs a killed vault regardless of price', () => {
    const d = decideVaultTrade({
      isKilled: true,
      lastMarkRaw: MARK,
      refPriceRaw: MARK / 2n,
      bandBps: 50,
      allowSell: true,
    });
    expect(d.action).toBe('HOLD');
    expect(d.reason).toMatch(/killed/);
  });

  it('bootstrap-BUYs when the mark is the unseeded 1.0 sentinel (<= NAV_SCALE)', () => {
    // Fresh vault: last_mark_price = NAV_SCALE (1e9), not a real price-raw.
    const d = decideVaultTrade({
      isKilled: false,
      lastMarkRaw: 1_000_000_000n,
      refPriceRaw: MARK,
      bandBps: 50,
      allowSell: false, // would otherwise HOLD forever on the +millions-bps signal
    });
    expect(d.action).toBe('BUY');
    expect(d.reason).toMatch(/sentinel/);
  });

  it('HOLDs on invalid (zero) price inputs', () => {
    expect(decideVaultTrade({ isKilled: false, lastMarkRaw: 0n, refPriceRaw: MARK, bandBps: 50, allowSell: true }).action).toBe('HOLD');
    expect(decideVaultTrade({ isKilled: false, lastMarkRaw: MARK, refPriceRaw: 0n, bandBps: 50, allowSell: true }).action).toBe('HOLD');
  });

  it('BUYs when the reference is at/below the lower band', () => {
    // -1% vs mark, band = 0.5% -> BUY
    const ref = (MARK * 99n) / 100n;
    const d = decideVaultTrade({ isKilled: false, lastMarkRaw: MARK, refPriceRaw: ref, bandBps: 50, allowSell: false });
    expect(d.action).toBe('BUY');
    expect(d.deviationBps).toBeLessThanOrEqual(-50);
  });

  it('SELLs above the upper band only when allowSell', () => {
    const ref = (MARK * 101n) / 100n; // +1%
    const sell = decideVaultTrade({ isKilled: false, lastMarkRaw: MARK, refPriceRaw: ref, bandBps: 50, allowSell: true });
    expect(sell.action).toBe('SELL');
    const held = decideVaultTrade({ isKilled: false, lastMarkRaw: MARK, refPriceRaw: ref, bandBps: 50, allowSell: false });
    expect(held.action).toBe('HOLD');
    expect(held.reason).toMatch(/SELL disabled/);
  });

  it('HOLDs inside the band', () => {
    const ref = (MARK * 10_010n) / 10_000n; // +0.1%, band 0.5%
    const d = decideVaultTrade({ isKilled: false, lastMarkRaw: MARK, refPriceRaw: ref, bandBps: 50, allowSell: true });
    expect(d.action).toBe('HOLD');
  });
});

describe('computeOrderParams', () => {
  it('BUY lifts price (ceil to tick) and sets is_bid=true', () => {
    const o = computeOrderParams({ action: 'BUY', refPriceRaw: 150_000n, slippageBps: 0, stepQtyRaw: 1_000n });
    expect(o.isBid).toBe(true);
    expect(o.priceRaw).toBe(200_000n); // ceil(150000 -> tick 100000)
    expect(o.priceRaw % VAULT_CONFIG.tickSize).toBe(0n);
  });

  it('SELL drops price (floor to tick) and sets is_bid=false', () => {
    const o = computeOrderParams({ action: 'SELL', refPriceRaw: 150_000n, slippageBps: 0, stepQtyRaw: 1_000n });
    expect(o.isBid).toBe(false);
    expect(o.priceRaw).toBe(100_000n); // floor(150000 -> tick 100000)
  });

  it('applies the slippage cushion in the crossing direction', () => {
    const buy = computeOrderParams({ action: 'BUY', refPriceRaw: MARK, slippageBps: 100, stepQtyRaw: 1_000n });
    const sell = computeOrderParams({ action: 'SELL', refPriceRaw: MARK, slippageBps: 100, stepQtyRaw: 1_000n });
    expect(buy.priceRaw).toBeGreaterThan(MARK); // bid lifted above mark
    expect(sell.priceRaw).toBeLessThan(MARK); // ask dropped below mark
  });

  it('floors qty to a lot and computes notional = price*qty/1e9', () => {
    const o = computeOrderParams({ action: 'BUY', refPriceRaw: MARK, slippageBps: 0, stepQtyRaw: 1_500n });
    expect(o.qtyRaw).toBe(1_000n); // 1500 floored to lot 1000
    expect(o.notionalRaw).toBe((o.priceRaw * o.qtyRaw) / 1_000_000_000n);
  });
});

describe('buildExecuteTradeTx', () => {
  it('targets nasun_vault::vault::execute_trade with 10 args and no type args', () => {
    const tx = buildExecuteTradeTx({
      vaultId: '0x' + 'a'.repeat(64),
      capabilityId: '0x' + 'b'.repeat(64),
      poolId: '0x' + 'c'.repeat(64),
      expectedCapVersion: 4n,
      isBid: true,
      priceRaw: 700_000_000_000n,
      qtyRaw: 1_000n,
      expireTsMs: 1_780_000_000_000n,
    });
    const data = tx.getData();
    const cmd = data.commands.find((c) => c.$kind === 'MoveCall')!;
    expect(cmd.MoveCall!.module).toBe('vault');
    expect(cmd.MoveCall!.function).toBe('execute_trade');
    expect(cmd.MoveCall!.package).toBe(VAULT_CONFIG.packageId);
    expect(cmd.MoveCall!.typeArguments).toHaveLength(0);
    expect(cmd.MoveCall!.arguments).toHaveLength(10);
  });
});
