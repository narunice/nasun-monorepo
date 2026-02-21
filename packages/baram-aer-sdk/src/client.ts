/**
 * AERClient — read-only client for querying and analyzing AI Execution Reports.
 * No signer/keypair required; all operations are read-only on-chain queries
 * and in-memory analytics.
 *
 * Supports dual-mode: indexer API (when indexerUrl is configured) with RPC fallback.
 * Single-record queries (getByRequestId, getByObjectId) always use RPC for freshness.
 */

import { SuiClient } from '@mysten/sui/client';
import type { AERConfig } from './config';
import type { AERRecord } from './types/aer';
import type { AERFilter, QueryOptions, PaginatedResult } from './types/filter';
import type {
  AERSummary,
  GroupByDimension,
  TimeGranularity,
  SpendingTimelineEntry,
  TrustProfile,
} from './types/analytics';
import type { BudgetUtilization } from './types/budget';

import {
  fetchAERObject,
  fetchAERByRequestId,
  fetchRecentAEREvents,
  fetchAERByAddress,
  fetchAERByBudgetId,
} from './services/fetch';
import {
  indexerGetRecent,
  indexerGetByAddress,
  indexerGetByBudgetId,
  indexerTraceChain,
  shouldFallback,
} from './services/indexer';
import { applyFilter } from './services/filter';
import {
  summarize,
  groupBy,
  spendingTimeline,
  trustProfile,
} from './services/analytics';
import { computeBudgetUtilization } from './services/budget-analytics';
import { traceChainBackward, traceChainForward } from './services/chain';

export interface AERClientOptions {
  config: AERConfig;
  /** Provide a pre-existing SuiClient to reuse connections */
  client?: SuiClient;
  /** Indexer API base URL. When set, list queries use indexer with RPC fallback. */
  indexerUrl?: string;
  /** Indexer request timeout in ms before falling back to RPC. Default: 5000 */
  indexerTimeoutMs?: number;
  /** Called when indexer fails and RPC fallback is used. For monitoring/logging. */
  onFallback?: (method: string, error: unknown) => void;
}

const DEFAULT_INDEXER_TIMEOUT_MS = 5000;

export class AERClient {
  private readonly client: SuiClient;
  private readonly config: AERConfig;
  private readonly indexerUrl: string | undefined;
  private readonly indexerTimeoutMs: number;
  private readonly onFallback: ((method: string, error: unknown) => void) | undefined;

  constructor(options: AERClientOptions) {
    this.config = options.config;
    this.client = options.client ?? new SuiClient({ url: options.config.rpcUrl });
    this.indexerUrl = options.indexerUrl;
    this.indexerTimeoutMs = options.indexerTimeoutMs ?? DEFAULT_INDEXER_TIMEOUT_MS;
    this.onFallback = options.onFallback;
  }

  // === Single Record Queries (always RPC — freshness required) ===

  async getByRequestId(requestId: number): Promise<AERRecord | null> {
    return fetchAERByRequestId(this.client, this.config, requestId);
  }

  async getByObjectId(objectId: string): Promise<AERRecord> {
    return fetchAERObject(this.client, objectId);
  }

  // === List Queries (indexer when available, RPC fallback) ===

  async getRecent(options?: QueryOptions): Promise<PaginatedResult<AERRecord>> {
    if (this.indexerUrl) {
      try {
        return await indexerGetRecent(this.indexerUrl, this.indexerTimeoutMs, options);
      } catch (err) {
        if (!shouldFallback(err)) throw err;
        this.onFallback?.('getRecent', err);
      }
    }
    return fetchRecentAEREvents(this.client, this.config, options);
  }

  async query(filter: AERFilter): Promise<AERRecord[]> {
    // For indexer-backed queries, we could translate AERFilter to query params.
    // For now, fetch via getRecent + in-memory filter (same as before).
    const limit = Math.min(filter.limit ?? 50, 200);
    const result = await this.getRecent({
      limit: Math.min(Math.max(limit * 2, 100), 200),
    });
    return applyFilter(result.data, { ...filter, limit });
  }

  // === Address-based Queries (indexer when available) ===

  async getByInitiator(address: string, options?: QueryOptions): Promise<AERRecord[]> {
    if (this.indexerUrl) {
      try {
        return await indexerGetByAddress(
          this.indexerUrl, this.indexerTimeoutMs, address, 'initiator', options,
        );
      } catch (err) {
        if (!shouldFallback(err)) throw err;
        this.onFallback?.('getByInitiator', err);
      }
    }
    return fetchAERByAddress(this.client, this.config, address, 'initiator', options);
  }

  async getByExecutor(address: string, options?: QueryOptions): Promise<AERRecord[]> {
    if (this.indexerUrl) {
      try {
        return await indexerGetByAddress(
          this.indexerUrl, this.indexerTimeoutMs, address, 'executor', options,
        );
      } catch (err) {
        if (!shouldFallback(err)) throw err;
        this.onFallback?.('getByExecutor', err);
      }
    }
    return fetchAERByAddress(this.client, this.config, address, 'executor', options);
  }

  async getByAuthorizer(address: string, options?: QueryOptions): Promise<AERRecord[]> {
    if (this.indexerUrl) {
      try {
        return await indexerGetByAddress(
          this.indexerUrl, this.indexerTimeoutMs, address, 'authorizer', options,
        );
      } catch (err) {
        if (!shouldFallback(err)) throw err;
        this.onFallback?.('getByAuthorizer', err);
      }
    }
    return fetchAERByAddress(this.client, this.config, address, 'authorizer', options);
  }

  // === Budget Queries (indexer when available) ===

  async getByBudgetId(budgetId: string, options?: QueryOptions): Promise<AERRecord[]> {
    if (this.indexerUrl) {
      try {
        return await indexerGetByBudgetId(
          this.indexerUrl, this.indexerTimeoutMs, budgetId, options,
        );
      } catch (err) {
        if (!shouldFallback(err)) throw err;
        this.onFallback?.('getByBudgetId', err);
      }
    }
    return fetchAERByBudgetId(this.client, this.config, budgetId, options);
  }

  async getBudgetUtilization(budgetId: string): Promise<BudgetUtilization> {
    const records = await this.getByBudgetId(budgetId);
    return computeBudgetUtilization(budgetId, records);
  }

  // === Decision Chain Traversal (indexer when available) ===

  async traceChainBackward(objectId: string, maxDepth?: number): Promise<AERRecord[]> {
    if (this.indexerUrl) {
      try {
        return await indexerTraceChain(
          this.indexerUrl, this.indexerTimeoutMs, objectId, 'backward', maxDepth,
        );
      } catch (err) {
        if (!shouldFallback(err)) throw err;
        this.onFallback?.('traceChainBackward', err);
      }
    }
    return traceChainBackward(this.client, this.config, objectId, maxDepth);
  }

  async traceChainForward(objectId: string, maxDepth?: number): Promise<AERRecord[]> {
    if (this.indexerUrl) {
      try {
        return await indexerTraceChain(
          this.indexerUrl, this.indexerTimeoutMs, objectId, 'forward', maxDepth,
        );
      } catch (err) {
        if (!shouldFallback(err)) throw err;
        this.onFallback?.('traceChainForward', err);
      }
    }
    return traceChainForward(this.client, this.config, objectId, maxDepth);
  }

  // === Analytics (synchronous, pure functions) ===

  summarize(records: AERRecord[]): AERSummary {
    return summarize(records);
  }

  groupBy(records: AERRecord[], dimension: GroupByDimension): Map<string, AERRecord[]> {
    return groupBy(records, dimension);
  }

  spendingTimeline(
    records: AERRecord[],
    granularity: TimeGranularity,
  ): SpendingTimelineEntry[] {
    return spendingTimeline(records, granularity);
  }

  trustProfile(records: AERRecord[]): TrustProfile {
    return trustProfile(records);
  }
}
