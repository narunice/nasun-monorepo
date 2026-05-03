import { describe, it, expect } from 'vitest';
import { pickCoinsForAmount, totalBalance } from './coin-selection';
import type { CoinStruct } from '@mysten/sui/client';

function coin(id: string, balance: bigint): CoinStruct {
  return {
    coinObjectId: id,
    coinType: '0x2::sui::SUI',
    balance: balance.toString(),
    digest: 'd',
    version: '1',
    previousTransaction: 'p',
  };
}

describe('pickCoinsForAmount', () => {
  it('throws when coins empty', () => {
    expect(() => pickCoinsForAmount([], 100n)).toThrow();
  });

  it('picks smallest sufficient coin when one exists', () => {
    const c = [coin('a', 1000n), coin('b', 200n), coin('c', 500n)];
    const sel = pickCoinsForAmount(c, 150n);
    expect(sel.primary.coinObjectId).toBe('b'); // smallest >= 150
    expect(sel.extras).toEqual([]);
  });

  it('uses exact match when available', () => {
    const c = [coin('a', 100n), coin('b', 200n)];
    const sel = pickCoinsForAmount(c, 100n);
    expect(sel.primary.coinObjectId).toBe('a');
    expect(sel.extras).toEqual([]);
  });

  it('merges all into largest when no single coin suffices', () => {
    const c = [coin('a', 100n), coin('b', 200n), coin('c', 50n)];
    const sel = pickCoinsForAmount(c, 250n); // total 350, need merge
    expect(sel.primary.coinObjectId).toBe('b'); // largest
    expect(sel.extras).toEqual(['a', 'c']); // sorted desc by balance
  });

  it('merge extras are sorted by balance descending', () => {
    const c = [
      coin('a', 5n),
      coin('b', 50n),
      coin('c', 10n),
      coin('d', 100n),
    ];
    const sel = pickCoinsForAmount(c, 200n);
    expect(sel.primary.coinObjectId).toBe('d');
    expect(sel.extras).toEqual(['b', 'c', 'a']);
  });
});

describe('totalBalance', () => {
  it('sums coin balances', () => {
    const c = [coin('a', 10n), coin('b', 20n), coin('c', 30n)];
    expect(totalBalance(c)).toBe(60n);
  });

  it('returns 0 for empty array', () => {
    expect(totalBalance([])).toBe(0n);
  });
});
