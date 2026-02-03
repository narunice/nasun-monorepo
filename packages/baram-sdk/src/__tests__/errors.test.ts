import { describe, it, expect } from 'vitest';
import {
  BaramError,
  InsufficientBalanceError,
  NoCoinsError,
  NoExecutorError,
  ExecutorApiError,
  TransactionError,
  TimeoutError,
} from '../errors';

describe('BaramError', () => {
  it('has code and message properties', () => {
    const err = new BaramError('test message', 'TEST_CODE');
    expect(err.message).toBe('test message');
    expect(err.code).toBe('TEST_CODE');
    expect(err.name).toBe('BaramError');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(BaramError);
  });
});

describe('InsufficientBalanceError', () => {
  it('formats NUSDC amounts correctly', () => {
    const err = new InsufficientBalanceError(100_000, 50_000);
    expect(err.code).toBe('INSUFFICIENT_BALANCE');
    expect(err.required).toBe(100_000);
    expect(err.available).toBe(50_000);
    expect(err.message).toContain('0.1');
    expect(err.message).toContain('0.05');
    expect(err).toBeInstanceOf(BaramError);
  });
});

describe('NoCoinsError', () => {
  it('has correct code and message', () => {
    const err = new NoCoinsError();
    expect(err.code).toBe('NO_COINS');
    expect(err.message).toContain('Token Faucet');
    expect(err).toBeInstanceOf(BaramError);
  });
});

describe('NoExecutorError', () => {
  it('includes model and tier info', () => {
    const err = new NoExecutorError('llama-3.1-8b-instant', 2);
    expect(err.code).toBe('NO_EXECUTOR');
    expect(err.message).toContain('llama-3.1-8b-instant');
    expect(err.message).toContain('2');
    expect(err).toBeInstanceOf(BaramError);
  });
});

describe('ExecutorApiError', () => {
  it('includes status code and body', () => {
    const err = new ExecutorApiError(500, 'Internal Server Error');
    expect(err.code).toBe('EXECUTOR_API_ERROR');
    expect(err.statusCode).toBe(500);
    expect(err.responseBody).toBe('Internal Server Error');
    expect(err.message).toContain('500');
    expect(err).toBeInstanceOf(BaramError);
  });
});

describe('TransactionError', () => {
  it('includes optional digest', () => {
    const err = new TransactionError('TX failed', 'abc123');
    expect(err.code).toBe('TRANSACTION_ERROR');
    expect(err.digest).toBe('abc123');
    expect(err).toBeInstanceOf(BaramError);
  });

  it('works without digest', () => {
    const err = new TransactionError('TX failed');
    expect(err.digest).toBeUndefined();
  });
});

describe('TimeoutError', () => {
  it('formats timeout message', () => {
    const err = new TimeoutError('Executor API call', 30000);
    expect(err.code).toBe('TIMEOUT');
    expect(err.message).toContain('30000ms');
    expect(err.message).toContain('Executor API call');
    expect(err).toBeInstanceOf(BaramError);
  });
});
