/**
 * AERClient — read-only client for querying and analyzing AI Execution Reports.
 * No signer/keypair required; all operations are read-only on-chain queries
 * and in-memory analytics.
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
}

export class AERClient {
  private readonly client: SuiClient;
  private readonly config: AERConfig;

  constructor(options: AERClientOptions) {
    this.config = options.config;
    this.client = options.client ?? new SuiClient({ url: options.config.rpcUrl });
  }

  // === Single Record Queries ===

  async getByRequestId(requestId: number): Promise<AERRecord | null> {
    return fetchAERByRequestId(this.client, this.config, requestId);
  }

  async getByObjectId(objectId: string): Promise<AERRecord> {
    return fetchAERObject(this.client, objectId);
  }

  // === List Queries ===

  async getRecent(options?: QueryOptions): Promise<PaginatedResult<AERRecord>> {
    return fetchRecentAEREvents(this.client, this.config, options);
  }

  async query(filter: AERFilter): Promise<AERRecord[]> {
    const limit = Math.min(filter.limit ?? 50, 200);
    const result = await fetchRecentAEREvents(this.client, this.config, {
      limit: Math.min(Math.max(limit * 2, 100), 200),
    });
    return applyFilter(result.data, { ...filter, limit });
  }

  // === Address-based Queries ===

  async getByInitiator(address: string, options?: QueryOptions): Promise<AERRecord[]> {
    return fetchAERByAddress(this.client, this.config, address, 'initiator', options);
  }

  async getByExecutor(address: string, options?: QueryOptions): Promise<AERRecord[]> {
    return fetchAERByAddress(this.client, this.config, address, 'executor', options);
  }

  async getByAuthorizer(address: string, options?: QueryOptions): Promise<AERRecord[]> {
    return fetchAERByAddress(this.client, this.config, address, 'authorizer', options);
  }

  // === Budget Queries ===

  async getByBudgetId(budgetId: string, options?: QueryOptions): Promise<AERRecord[]> {
    return fetchAERByBudgetId(this.client, this.config, budgetId, options);
  }

  async getBudgetUtilization(budgetId: string): Promise<BudgetUtilization> {
    const records = await fetchAERByBudgetId(this.client, this.config, budgetId);
    return computeBudgetUtilization(budgetId, records);
  }

  // === Decision Chain Traversal ===

  async traceChainBackward(objectId: string, maxDepth?: number): Promise<AERRecord[]> {
    return traceChainBackward(this.client, this.config, objectId, maxDepth);
  }

  async traceChainForward(objectId: string, maxDepth?: number): Promise<AERRecord[]> {
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
