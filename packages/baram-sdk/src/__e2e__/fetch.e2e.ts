/**
 * E2E tests for AER fetch operations against Nasun devnet.
 * Uses existing AER records — no write operations needed.
 *
 * Tests gracefully skip when devnet has no AER records
 * (e.g., after a chain reset).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createAERClient, logTest } from './setup';
import type { AERRecord } from '../types/aer';
import { AERClient } from '../client';

let client: AERClient;
let recentRecords: AERRecord[] = [];
let hasData = false;

beforeAll(async () => {
  client = createAERClient();
  logTest('AER SDK E2E: Fetching recent records from devnet...');

  const result = await client.getRecent({ limit: 10 });
  recentRecords = result.data;
  hasData = recentRecords.length > 0;
  logTest(`AER SDK E2E: Found ${recentRecords.length} recent AER records`);
});

describe('Fetch E2E', () => {
  it('should connect to devnet and query events', async () => {
    // This test passes even with 0 records — it verifies the RPC connection works
    const result = await client.getRecent({ limit: 1 });
    expect(Array.isArray(result.data)).toBe(true);
    expect(typeof result.hasNextPage).toBe('boolean');
    logTest('RPC connection and event query successful');
  });

  it('should return null for non-existent request ID', async () => {
    const result = await client.getByRequestId(999999);
    expect(result).toBeNull();
  });

  it('should fetch recent AER records (requires data)', () => {
    if (!hasData) {
      logTest('SKIP: No AER records on devnet');
      return;
    }
    expect(recentRecords.length).toBeGreaterThan(0);
    logTest(`Found ${recentRecords.length} recent records`);
  });

  it('recent records should have correct structure (requires data)', () => {
    if (!hasData) {
      logTest('SKIP: No AER records on devnet');
      return;
    }
    const r = recentRecords[0];
    expect(r.objectId).toBeTruthy();
    expect(typeof r.requestId).toBe('number');
    expect(r.initiator).toBeTruthy();
    expect(r.executor).toBeTruthy();
    expect(r.modelName).toBeTruthy();
    expect(typeof r.paymentAmount).toBe('number');
    expect(typeof r.executionTimeMs).toBe('number');
    expect(typeof r.teeVerified).toBe('boolean');
    expect(r.statusName).toBeTruthy();
    expect(r.executorTierName).toBeTruthy();
    logTest(`First record: requestId=${r.requestId}, model=${r.modelName}, payment=${r.paymentAmount}`);
  });

  it('should fetch a single record by object ID (requires data)', async () => {
    if (!hasData) {
      logTest('SKIP: No AER records on devnet');
      return;
    }
    const target = recentRecords[0];
    const fetched = await client.getByObjectId(target.objectId);
    expect(fetched.objectId).toBe(target.objectId);
    expect(fetched.requestId).toBe(target.requestId);
    logTest(`Fetched by objectId: ${target.objectId}`);
  });

  it('should fetch by request ID (requires data)', async () => {
    if (!hasData) {
      logTest('SKIP: No AER records on devnet');
      return;
    }
    const target = recentRecords[0];
    const fetched = await client.getByRequestId(target.requestId);
    expect(fetched).not.toBeNull();
    expect(fetched!.requestId).toBe(target.requestId);
    logTest(`Fetched by requestId: ${target.requestId}`);
  });

  it('should paginate with cursor (requires data)', async () => {
    if (!hasData) {
      logTest('SKIP: No AER records on devnet');
      return;
    }
    const page1 = await client.getRecent({ limit: 2 });
    expect(page1.data.length).toBeGreaterThan(0);

    if (page1.hasNextPage && page1.nextCursor) {
      const page2 = await client.getRecent({ limit: 2, cursor: page1.nextCursor });
      expect(page2.data.length).toBeGreaterThan(0);
      const page1Ids = new Set(page1.data.map((r) => r.objectId));
      const overlap = page2.data.filter((r) => page1Ids.has(r.objectId));
      expect(overlap.length).toBe(0);
      logTest(`Pagination: page1=${page1.data.length}, page2=${page2.data.length}`);
    }
  });

  it('should fetch records by executor address (requires data)', async () => {
    if (!hasData) {
      logTest('SKIP: No AER records on devnet');
      return;
    }
    const executor = recentRecords[0].executor;
    const records = await client.getByExecutor(executor, { limit: 5 });
    expect(records.length).toBeGreaterThan(0);
    expect(records.every((r) => r.executor === executor)).toBe(true);
    logTest(`By executor ${executor}: ${records.length} records`);
  });

  it('should query with filter (requires data)', async () => {
    if (!hasData) {
      logTest('SKIP: No AER records on devnet');
      return;
    }
    const modelName = recentRecords[0].modelName;
    const results = await client.query({ modelName, limit: 5 });
    expect(results.every((r) => r.modelName === modelName)).toBe(true);
    logTest(`Query filter modelName=${modelName}: ${results.length} results`);
  });

  it('JSON fields should be parsed (when present)', () => {
    for (const r of recentRecords) {
      if (r.feeDetail !== null) {
        expect(typeof r.feeDetail).toBe('object');
        logTest(`Parsed feeDetail: ${JSON.stringify(r.feeDetail)}`);
      }
      if (r.modelMetadata !== null) {
        expect(typeof r.modelMetadata).toBe('object');
        logTest(`Parsed modelMetadata: ${JSON.stringify(r.modelMetadata)}`);
      }
      if (r.constraints !== null) {
        expect(typeof r.constraints).toBe('object');
        logTest(`Parsed constraints: ${JSON.stringify(r.constraints)}`);
      }
    }
  });
});
