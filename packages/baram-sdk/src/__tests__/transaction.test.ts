import { describe, it, expect } from 'vitest';
import { buildCreateRequestTransaction, buildCancelRequestTransaction } from '../services/transaction';
import { createDevnetConfig } from '../config';

describe('buildCreateRequestTransaction', () => {
  const config = createDevnetConfig();

  it('creates a Transaction object with single coin', () => {
    const tx = buildCreateRequestTransaction(config, {
      coins: [{ objectId: '0x0000000000000000000000000000000000000000000000000000000000000aaa', version: '1', digest: 'abc' }],
      promptHashBytes: new Array(32).fill(0),
      model: 'llama-3.3-70b-versatile',
      executorOperator: '0x0000000000000000000000000000000000000000000000000000000000000001',
      price: 100_000,
    });

    expect(tx).toBeDefined();
    // Transaction should be serializable (basic sanity)
    expect(() => tx.getData()).not.toThrow();
  });

  it('creates a Transaction with multiple coins (merge)', () => {
    const tx = buildCreateRequestTransaction(config, {
      coins: [
        { objectId: '0x0000000000000000000000000000000000000000000000000000000000000aaa', version: '1', digest: 'abc' },
        { objectId: '0x0000000000000000000000000000000000000000000000000000000000000bbb', version: '1', digest: 'def' },
      ],
      promptHashBytes: new Array(32).fill(1),
      model: 'llama-3.3-70b-versatile',
      executorOperator: '0x0000000000000000000000000000000000000000000000000000000000000001',
      price: 100_000,
    });

    expect(tx).toBeDefined();
  });
});

describe('buildCancelRequestTransaction', () => {
  const config = createDevnetConfig();

  it('creates a cancel Transaction', () => {
    const tx = buildCancelRequestTransaction(config, 42);
    expect(tx).toBeDefined();
    expect(() => tx.getData()).not.toThrow();
  });
});
