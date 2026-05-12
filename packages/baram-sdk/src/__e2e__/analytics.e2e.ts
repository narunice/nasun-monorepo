/**
 * E2E tests for AER analytics operations against Nasun devnet.
 * Fetches real data then runs analytics on it.
 *
 * Tests gracefully skip when devnet has no AER records.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createAERClient, logTest } from './setup';
import type { AERRecord } from '../types/aer';
import { AERClient } from '../client';

let client: AERClient;
let records: AERRecord[] = [];
let hasData = false;

beforeAll(async () => {
  client = createAERClient();
  logTest('AER Analytics E2E: Fetching records from devnet...');

  const result = await client.getRecent({ limit: 25 });
  records = result.data;
  hasData = records.length > 0;
  logTest(`AER Analytics E2E: Loaded ${records.length} records for analysis`);
});

describe('Analytics E2E', () => {
  it('should produce valid empty summary when no data', () => {
    if (hasData) {
      logTest('SKIP: Has data - tested in data-present test below');
      return;
    }
    const summary = client.summarize(records);
    expect(summary.totalRecords).toBe(0);
    expect(summary.totalPaymentNusdc).toBe(0);
    logTest('Empty summary produced successfully');
  });

  it('should summarize real records (requires data)', () => {
    if (!hasData) {
      logTest('SKIP: No AER records on devnet');
      return;
    }
    const summary = client.summarize(records);
    expect(summary.totalRecords).toBe(records.length);
    expect(summary.totalRecords).toBeGreaterThan(0);
    expect(typeof summary.totalPaymentNusdc).toBe('number');
    expect(typeof summary.avgExecutionTimeMs).toBe('number');
    expect(typeof summary.medianExecutionTimeMs).toBe('number');

    logTest(`Summary: ${summary.totalRecords} records`);
    logTest(`  Total NUSDC: ${summary.totalPaymentNusdc}, avg: ${summary.avgPaymentNusdc}`);
    logTest(`  Avg exec time: ${summary.avgExecutionTimeMs}ms, median: ${summary.medianExecutionTimeMs}ms`);
    logTest(`  TEE verified: ${summary.teeVerifiedPercentage}%`);
    logTest(`  Budget funded: ${summary.budgetFundedCount}, Direct: ${summary.directFundedCount}`);
    logTest(`  Models: ${JSON.stringify(summary.modelDistribution)}`);
    logTest(`  Tiers: ${JSON.stringify(summary.tierDistribution)}`);
  });

  it('should group by model name (requires data)', () => {
    if (!hasData) {
      logTest('SKIP: No AER records on devnet');
      return;
    }
    const groups = client.groupBy(records, 'modelName');
    expect(groups.size).toBeGreaterThan(0);

    for (const [model, recs] of groups) {
      logTest(`  Model "${model}": ${recs.length} records`);
      expect(recs.every((r) => r.modelName === model)).toBe(true);
    }
  });

  it('should group by executor (requires data)', () => {
    if (!hasData) {
      logTest('SKIP: No AER records on devnet');
      return;
    }
    const groups = client.groupBy(records, 'executor');
    expect(groups.size).toBeGreaterThan(0);

    for (const [exec, recs] of groups) {
      logTest(`  Executor ${exec.slice(0, 10)}...: ${recs.length} records`);
      expect(recs.every((r) => r.executor === exec)).toBe(true);
    }
  });

  it('should compute spending timeline (requires data)', () => {
    if (!hasData) {
      logTest('SKIP: No AER records on devnet');
      return;
    }
    const timeline = client.spendingTimeline(records, 'hour');
    expect(timeline.length).toBeGreaterThan(0);

    for (const entry of timeline) {
      expect(entry.periodEnd).toBeGreaterThan(entry.periodStart);
      expect(typeof entry.totalSpent).toBe('number');
      expect(typeof entry.recordCount).toBe('number');
    }

    const nonEmpty = timeline.filter((e) => e.recordCount > 0);
    logTest(`Timeline (hourly): ${timeline.length} buckets, ${nonEmpty.length} non-empty`);
  });

  it('should compute trust profile (requires data)', () => {
    if (!hasData) {
      logTest('SKIP: No AER records on devnet');
      return;
    }
    const profile = client.trustProfile(records);
    expect(profile.totalRecords).toBe(records.length);
    expect(typeof profile.teeVerifiedPercentage).toBe('number');
    expect(typeof profile.avgExecutorTier).toBe('number');
    expect(typeof profile.avgExecutorReputation).toBe('number');
    expect(typeof profile.executorDiversity).toBe('number');
    expect(profile.executorDiversity).toBeGreaterThan(0);

    logTest(`Trust Profile:`);
    logTest(`  TEE verified: ${profile.teeVerifiedPercentage.toFixed(1)}%`);
    logTest(`  Avg tier: ${profile.avgExecutorTier.toFixed(2)}`);
    logTest(`  Executor diversity: ${profile.executorDiversity}`);
    logTest(`  Top executors: ${profile.topExecutors.length}`);
  });

  it('should handle budget utilization (if budget-funded records exist)', async () => {
    const budgetRecords = records.filter((r) => r.budgetId !== null);

    if (budgetRecords.length > 0) {
      const budgetId = budgetRecords[0].budgetId!;
      const utilization = await client.getBudgetUtilization(budgetId);

      expect(utilization.budgetId).toBe(budgetId);
      expect(utilization.totalRecords).toBeGreaterThan(0);
      expect(utilization.totalSpent).toBeGreaterThan(0);

      logTest(`Budget Utilization for ${budgetId.slice(0, 10)}...:`);
      logTest(`  Total records: ${utilization.totalRecords}`);
      logTest(`  Total spent: ${utilization.totalSpent}`);
      logTest(`  Latest remaining: ${utilization.latestBudgetRemaining}`);
      logTest(`  Burn rate: ${utilization.estimatedBurnRate}`);
      logTest(`  Agents: ${utilization.agents.length}`);
    } else {
      logTest('No budget-funded records found, skipping budget utilization test');
    }
  });
});
