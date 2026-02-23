/**
 * @nasun/baram-sdk — Read-only SDK for querying and analyzing AI Execution Reports.
 *
 * The "black box" for AI agents: capture, query, filter, and analyze
 * on-chain execution records without requiring a signer.
 */

// Client
export { AERClient } from './client';
export type { AERClientOptions } from './client';

// Config
export { createDevnetConfig } from './config';
export type { AERConfig } from './config';

// Types
export type {
  AERRecord,
  PaymentTokenType,
  AERStatus,
  TierLevel,
  TierName,
  FeeDetail,
  ModelMetadata,
  ExecutionConstraints,
} from './types/aer';
export { TIER_NAMES, STATUS_NAMES, PAYMENT_TOKEN_NAMES } from './types/aer';
export type { AERFilter, QueryOptions, PaginatedResult } from './types/filter';
export type {
  AERSummary,
  GroupByDimension,
  TimeGranularity,
  SpendingTimelineEntry,
  TrustProfile,
} from './types/analytics';
export type { BudgetUtilization } from './types/budget';

// Errors
export { AERError, AERNotFoundError, ChainDepthExceededError, RpcError } from './errors';
export { IndexerError, shouldFallback } from './services/indexer';

// Services (for advanced usage / tree-shaking)
export { parseAERFields } from './services/parse';
export { applyFilter } from './services/filter';
export { summarize, groupBy, spendingTimeline, trustProfile } from './services/analytics';
export { computeBudgetUtilization } from './services/budget-analytics';

// Utils
export { formatNusdc, formatNusdcValue, formatNasun, formatTimestamp, truncateHash, truncateAddress, formatDuration } from './utils/format';
export { bytesToHex, hexToBytes } from './utils/bytes';
