import { describe, it, expect } from 'vitest';

import { parseTradeDecision, type TradeRiskLimits } from './trader.js';

const LIMITS: TradeRiskLimits = {
  maxNotionalQuoteRaw: 2_000_000n, // 2 NUSDC
  dailyMaxQuoteRaw: 20_000_000n, // 20 NUSDC
  maxSlippageBps: 100,
};

describe('parseTradeDecision (no limits)', () => {
  it('parses a HOLD with reason', () => {
    const d = parseTradeDecision('{"action":"HOLD","sizeNUSDC":0,"reason":"flat"}');
    expect(d.action).toBe('HOLD');
    expect(d.reason).toBe('flat');
    expect(d.riskGate).toBeUndefined();
  });

  it('extracts the JSON block from code-fenced LLM output', () => {
    const d = parseTradeDecision(
      'Sure!\n```json\n{"action":"BUY","sizeNUSDC":1,"reason":"x"}\n```',
    );
    expect(d.action).toBe('BUY');
    expect(d.sizeNUSDC).toBe(1);
  });

  it('throws on missing action', () => {
    expect(() => parseTradeDecision('{"sizeNUSDC":1}')).toThrow();
  });

  it('throws on negative size', () => {
    expect(() =>
      parseTradeDecision('{"action":"BUY","sizeNUSDC":-1,"reason":"x"}'),
    ).toThrow();
  });
});

describe('parseTradeDecision (risk-gated)', () => {
  const balances = {
    dailySpentQuoteRaw: 0n,
    nbtcBalanceRaw: 100_000_000n,
    nusdcBalanceRaw: 100_000_000n,
  };

  it('demotes BUY exceeding max notional to HOLD with reason', () => {
    const d = parseTradeDecision(
      '{"action":"BUY","sizeNUSDC":5,"reason":"go big"}',
      LIMITS,
      balances,
    );
    expect(d.action).toBe('HOLD');
    expect(d.riskGate).toMatch(/size_exceeds_notional_cap/);
    expect(d.reason).toBe('go big');
  });

  it('demotes when daily cap would be exceeded', () => {
    const d = parseTradeDecision(
      '{"action":"BUY","sizeNUSDC":2,"reason":"another buy"}',
      LIMITS,
      { ...balances, dailySpentQuoteRaw: 19_500_000n }, // 19.5 of 20 cap
    );
    expect(d.action).toBe('HOLD');
    expect(d.riskGate).toMatch(/daily_cap_would_exceed/);
  });

  it('demotes BUY when NUSDC balance is insufficient', () => {
    const d = parseTradeDecision(
      '{"action":"BUY","sizeNUSDC":2,"reason":"top up"}',
      LIMITS,
      { ...balances, nusdcBalanceRaw: 1_000_000n },
    );
    expect(d.action).toBe('HOLD');
    expect(d.riskGate).toMatch(/insufficient_quote_balance/);
  });

  it('demotes SELL when NBTC balance is zero', () => {
    const d = parseTradeDecision(
      '{"action":"SELL","sizeNUSDC":1,"reason":"trim"}',
      LIMITS,
      { ...balances, nbtcBalanceRaw: 0n },
    );
    expect(d.action).toBe('HOLD');
    expect(d.riskGate).toMatch(/sell_with_zero_base_balance/);
  });

  it('passes a within-cap BUY through unchanged', () => {
    const d = parseTradeDecision(
      '{"action":"BUY","sizeNUSDC":1,"reason":"steady"}',
      LIMITS,
      balances,
    );
    expect(d.action).toBe('BUY');
    expect(d.sizeNUSDC).toBe(1);
    expect(d.riskGate).toBeUndefined();
  });

  it('HOLD bypasses the risk gate even with limits', () => {
    const d = parseTradeDecision(
      '{"action":"HOLD","sizeNUSDC":99,"reason":"wait"}',
      LIMITS,
      balances,
    );
    expect(d.action).toBe('HOLD');
    expect(d.riskGate).toBeUndefined();
  });
});
