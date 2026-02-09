/**
 * AER SDK error classes
 */

export class AERError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'AERError';
  }
}

export class AERNotFoundError extends AERError {
  constructor(identifier: string) {
    super(`AER record not found: ${identifier}`, 'NOT_FOUND');
    this.name = 'AERNotFoundError';
  }
}

export class ChainDepthExceededError extends AERError {
  constructor(maxDepth: number) {
    super(
      `Decision chain traversal exceeded max depth: ${maxDepth}`,
      'CHAIN_DEPTH_EXCEEDED',
    );
    this.name = 'ChainDepthExceededError';
  }
}

export class RpcError extends AERError {
  constructor(operation: string, cause?: Error) {
    super(
      `RPC call failed during ${operation}: ${cause?.message ?? 'unknown'}`,
      'RPC_ERROR',
    );
    this.name = 'RpcError';
  }
}
