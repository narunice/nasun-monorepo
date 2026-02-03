/**
 * Custom error classes for @nasun/baram-sdk.
 * Enables consumers to catch specific error types programmatically.
 */

export class BaramError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'BaramError';
  }
}

export class InsufficientBalanceError extends BaramError {
  constructor(
    public readonly required: number,
    public readonly available: number,
  ) {
    super(
      `Insufficient NUSDC balance. Need ${required / 1e6} NUSDC, have ${available / 1e6} NUSDC.`,
      'INSUFFICIENT_BALANCE',
    );
    this.name = 'InsufficientBalanceError';
  }
}

export class NoCoinsError extends BaramError {
  constructor() {
    super(
      'No NUSDC coins found. Please get some from the Token Faucet.',
      'NO_COINS',
    );
    this.name = 'NoCoinsError';
  }
}

export class NoExecutorError extends BaramError {
  constructor(model: string, minTier: number) {
    super(
      `No eligible executor found for model "${model}" with tier >= ${minTier}`,
      'NO_EXECUTOR',
    );
    this.name = 'NoExecutorError';
  }
}

export class ExecutorApiError extends BaramError {
  constructor(
    public readonly statusCode: number,
    public readonly responseBody: string,
  ) {
    const truncated = responseBody.length > 500
      ? responseBody.slice(0, 500) + '...[truncated]'
      : responseBody;
    super(`Executor returned ${statusCode}: ${truncated}`, 'EXECUTOR_API_ERROR');
    this.name = 'ExecutorApiError';
  }
}

export class TransactionError extends BaramError {
  constructor(
    message: string,
    public readonly digest?: string,
  ) {
    super(message, 'TRANSACTION_ERROR');
    this.name = 'TransactionError';
  }
}

export class TimeoutError extends BaramError {
  constructor(operation: string, timeoutMs: number) {
    super(`${operation} timed out after ${timeoutMs}ms`, 'TIMEOUT');
    this.name = 'TimeoutError';
  }
}
