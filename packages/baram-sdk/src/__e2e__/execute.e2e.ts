/**
 * E2E Tests for basic execute() flow
 *
 * Tests the core Baram pipeline:
 * User → createRequest (escrow) → Executor selection → AI inference → Settlement → AER
 *
 * NOTE: execute() and getAER() tests require an active Executor on devnet.
 * These tests will be skipped if no executors are available.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { BaramClient } from '../client';
import type { ExecutorInfo } from '../types';
import {
  createUserClient,
  ensureNusdcBalance,
  isExecutorReachable,
  logTest,
  formatNusdc,
  TEST_USER_ADDRESS,
} from './setup';

describe('Baram Execute E2E', () => {
  let userClient: BaramClient;
  let executors: ExecutorInfo[] = [];
  let hasExecutors = false;
  let executorReachable = false;
  // Shared across tests to avoid coin version conflicts from consecutive execute() calls
  let lastExecuteRequestId: number | null = null;

  beforeAll(async () => {
    logTest('Setting up execute E2E tests...');
    userClient = createUserClient();
    logTest(`User address: ${TEST_USER_ADDRESS}`);

    // Ensure user has NUSDC for testing
    await ensureNusdcBalance(userClient, 5_000_000); // 5 NUSDC minimum
    const balance = await userClient.getBalance();
    logTest(`User NUSDC balance: ${formatNusdc(balance)}`);

    // Check if executors are available and reachable
    executors = await userClient.getExecutors();
    hasExecutors = executors.length > 0;
    if (hasExecutors) {
      executorReachable = await isExecutorReachable(executors[0].endpointUrl);
      logTest(`Executor endpoint reachable: ${executorReachable}`);
    }
    logTest(`Executors available: ${hasExecutors} (${executors.length} found)`);
  });

  describe('getBalance()', () => {
    it('should return NUSDC balance', async () => {
      const balance = await userClient.getBalance();
      logTest(`Balance check: ${formatNusdc(balance)}`);

      expect(typeof balance).toBe('number');
      expect(balance).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getExecutors()', () => {
    it('should return list of executors (may be empty)', async () => {
      const fetchedExecutors = await userClient.getExecutors();
      logTest(`Found ${fetchedExecutors.length} executors`);

      expect(Array.isArray(fetchedExecutors)).toBe(true);

      if (fetchedExecutors.length > 0) {
        const executor = fetchedExecutors[0];
        logTest(`First executor: ${executor.name} (tier ${executor.tier})`);
        expect(executor).toHaveProperty('operator');
        expect(executor).toHaveProperty('name');
        expect(executor).toHaveProperty('endpointUrl');
        expect(executor).toHaveProperty('tier');
        expect(executor).toHaveProperty('isActive');
      } else {
        logTest('No executors registered - execute() tests will be skipped');
      }
    });
  });

  describe('execute()', () => {
    it('should execute AI inference and return result (requires executor)', async () => {
      if (!hasExecutors || !executorReachable) {
        logTest('SKIPPED: No reachable executor on devnet');
        return;
      }

      logTest('Starting execute() test...');

      const balanceBefore = await userClient.getBalance();
      logTest(`Balance before: ${formatNusdc(balanceBefore)}`);

      const result = await userClient.execute({
        prompt: 'What is 2 + 2? Answer with just the number.',
        model: 'llama-3.3-70b-versatile',
        minTier: 0,
      });

      logTest(`Execute completed!`);
      logTest(`Response: ${result.response.substring(0, 100)}...`);
      logTest(`Request ID: ${result.requestId}`);
      logTest(`TX Digest: ${result.txDigest}`);

      // Verify result structure
      expect(result).toHaveProperty('response');
      expect(result).toHaveProperty('requestId');
      expect(result).toHaveProperty('txDigest');
      expect(typeof result.response).toBe('string');
      expect(result.response.length).toBeGreaterThan(0);

      // Store requestId for getAER() test reuse
      lastExecuteRequestId = result.requestId;

      // Check AER was created
      if (result.aer) {
        logTest(`AER Object ID: ${result.aer.objectId}`);
        expect(result.aer).toHaveProperty('objectId');
      }

      // Verify balance decreased (payment was made)
      const balanceAfter = await userClient.getBalance();
      logTest(`Balance after: ${formatNusdc(balanceAfter)}`);
      expect(balanceAfter).toBeLessThan(balanceBefore);
    }, 120000); // 2 minute timeout

    it('should throw error for unknown model', async () => {
      await expect(
        userClient.execute({
          prompt: 'test',
          model: 'nonexistent-model-12345',
        }),
      ).rejects.toThrow();
    });
  });

  describe('getAER()', () => {
    it('should fetch AER by request ID after execution (requires executor)', async () => {
      if (!hasExecutors || !executorReachable || lastExecuteRequestId === null) {
        logTest('SKIPPED: No reachable executor or execute() test did not run');
        return;
      }

      // Reuse requestId from the execute() test to avoid coin version conflicts
      logTest(`Fetching AER for request: ${lastExecuteRequestId}`);

      const aer = await userClient.getAER(lastExecuteRequestId);

      if (aer) {
        logTest(`AER found: ${aer.objectId}`);
        expect(aer).toHaveProperty('objectId');
        expect(aer).toHaveProperty('requestId');
        expect(aer.requestId).toBe(lastExecuteRequestId);
      } else {
        logTest('AER not found (may be delayed)');
      }
    }, 30000);
  });
});
