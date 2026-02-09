/**
 * E2E Tests for Executor registration and query
 *
 * Tests executor-related queries from the SDK.
 * Does NOT require active executors — tests the query layer itself.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { BaramClient } from '../client';
import { SuiClient } from '@mysten/sui/client';
import { createDevnetConfig } from '../config';
import type { ExecutorInfo } from '../types';
import {
  createUserClient,
  logTest,
  TEST_USER_ADDRESS,
} from './setup';

describe('Baram Executor Registration E2E', () => {
  let userClient: BaramClient;
  let suiClient: SuiClient;
  const config = createDevnetConfig();

  beforeAll(async () => {
    logTest('Setting up executor registration tests...');
    userClient = createUserClient();
    suiClient = new SuiClient({ url: config.rpcUrl });
    logTest(`User address: ${TEST_USER_ADDRESS}`);
  });

  describe('getExecutors()', () => {
    it('should return an array (may be empty on devnet)', async () => {
      const executors = await userClient.getExecutors();
      logTest(`Found ${executors.length} executor(s)`);

      expect(Array.isArray(executors)).toBe(true);
    });

    it('should return executors with correct schema', async () => {
      const executors = await userClient.getExecutors();

      if (executors.length === 0) {
        logTest('SKIPPED: No executors available to validate schema');
        return;
      }

      const executor = executors[0];
      logTest(`Validating executor schema: ${executor.name}`);

      // Required fields
      expect(executor).toHaveProperty('id');
      expect(executor).toHaveProperty('operator');
      expect(executor).toHaveProperty('name');
      expect(executor).toHaveProperty('endpointUrl');
      expect(executor).toHaveProperty('teeType');
      expect(executor).toHaveProperty('teeTypeName');
      expect(executor).toHaveProperty('supportedModels');
      expect(executor).toHaveProperty('reputation');
      expect(executor).toHaveProperty('completedJobs');
      expect(executor).toHaveProperty('failedJobs');
      expect(executor).toHaveProperty('registeredAt');
      expect(executor).toHaveProperty('lastActiveAt');
      expect(executor).toHaveProperty('isActive');
      expect(executor).toHaveProperty('tier');
      expect(executor).toHaveProperty('tierName');
      expect(executor).toHaveProperty('isDormant');

      // Type checks
      expect(typeof executor.operator).toBe('string');
      expect(typeof executor.name).toBe('string');
      expect(typeof executor.endpointUrl).toBe('string');
      expect(typeof executor.teeType).toBe('number');
      expect(typeof executor.reputation).toBe('number');
      expect(typeof executor.isActive).toBe('boolean');
      expect(typeof executor.tier).toBe('number');
      expect(Array.isArray(executor.supportedModels)).toBe(true);

      // Value constraints
      expect(executor.teeType).toBeGreaterThanOrEqual(0);
      expect(executor.teeType).toBeLessThanOrEqual(3);
      expect(executor.tier).toBeGreaterThanOrEqual(0);
      expect(executor.tier).toBeLessThanOrEqual(3);
      expect(executor.reputation).toBeGreaterThanOrEqual(0);

      logTest('Executor schema validation passed');
    });

    it('should return only active executors', async () => {
      const executors = await userClient.getExecutors();

      for (const executor of executors) {
        expect(executor.isActive).toBe(true);
      }

      logTest(`All ${executors.length} executor(s) are active`);
    });

    it('should have valid endpoint URLs for all executors', async () => {
      const executors = await userClient.getExecutors();

      for (const executor of executors) {
        // URL must be parseable and use http/https
        const parsed = new URL(executor.endpointUrl);
        expect(['http:', 'https:']).toContain(parsed.protocol);
        logTest(`Executor ${executor.name}: ${executor.endpointUrl} (valid)`);
      }
    });
  });

  describe('ExecutorRegistry on-chain state', () => {
    it('should be able to query registry object', async () => {
      const registry = await suiClient.getObject({
        id: config.executor.registryId,
        options: { showContent: true },
      });

      expect(registry.data).toBeTruthy();
      expect(registry.data?.content?.dataType).toBe('moveObject');

      logTest(`ExecutorRegistry object: ${config.executor.registryId}`);
    });

    it('should be able to query TierRegistry object', async () => {
      const tierRegistry = await suiClient.getObject({
        id: config.executor.tierRegistryId,
        options: { showContent: true },
      });

      expect(tierRegistry.data).toBeTruthy();
      expect(tierRegistry.data?.content?.dataType).toBe('moveObject');

      logTest(`TierRegistry object: ${config.executor.tierRegistryId}`);
    });

    it('should be able to query ProcessedRequests object', async () => {
      const processed = await suiClient.getObject({
        id: config.executor.processedRequestsId,
        options: { showContent: true },
      });

      expect(processed.data).toBeTruthy();
      expect(processed.data?.content?.dataType).toBe('moveObject');

      logTest(`ProcessedRequests object: ${config.executor.processedRequestsId}`);
    });
  });

  describe('AER Registry on-chain state', () => {
    it('should be able to query AERRegistry object', async () => {
      const registry = await suiClient.getObject({
        id: config.aer.registryId,
        options: { showContent: true },
      });

      expect(registry.data).toBeTruthy();
      expect(registry.data?.content?.dataType).toBe('moveObject');

      logTest(`AERRegistry object: ${config.aer.registryId}`);
    });
  });
});
