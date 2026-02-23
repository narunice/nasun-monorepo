/**
 * Query filter and pagination types for AER records
 */

import type { AERStatus, PaymentTokenType, TierLevel } from './aer';

/**
 * Filter criteria for querying AER records.
 * All fields are optional; when multiple are set, they combine with AND logic.
 */
export interface AERFilter {
  // Address filters
  initiator?: string;
  executor?: string;
  authorizer?: string;

  // Budget filters
  budgetId?: string;
  /** true = only budget-funded, false = only direct payment */
  hasBudget?: boolean;

  // Model filters
  modelName?: string;
  /** OR match: record matches if modelName is in this list */
  modelNames?: string[];

  // Tier / trust filters
  minTier?: TierLevel;
  teeVerified?: boolean;

  // Status filter
  status?: AERStatus;

  // Time range (ms since epoch)
  settledAfter?: number;
  settledBefore?: number;

  // Payment range (raw units)
  minPayment?: number;
  maxPayment?: number;
  paymentToken?: PaymentTokenType;

  // Chain filters
  /** true = has parent in decision chain */
  hasTriggeredBy?: boolean;

  // Result limit
  limit?: number;
}

export interface QueryOptions {
  limit?: number;
  cursor?: string;
  order?: 'ascending' | 'descending';
}

export interface PaginatedResult<T> {
  data: T[];
  hasNextPage: boolean;
  nextCursor: string | null;
}
