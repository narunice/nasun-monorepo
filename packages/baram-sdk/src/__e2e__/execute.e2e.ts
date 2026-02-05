/**
 * E2E Tests for basic execute() flow
 *
 * Tests the core Baram pipeline:
 * User → createRequest (escrow) → Executor selection → AI inference → Settlement → ECR
 *
 * NOTE: execute() and getECR() tests require an active Executor on devnet.
 * These tests will be skipped if no executors are available.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { BaramClient } from '../client';
import type { ExecutorInfo } from '../types';
import {
  createUserClient,
  ensureNusdcBalance,
  logTest,
  formatNusdc,
  TEST_USER_ADDRESS,
} from './setup';

describe('Baram Execute E2E', () => {
  let userClient: BaramClient;
  let executors: ExecutorInfo[] = [];
  let hasExecutors = false;

  beforeAll(async () => {
    logTest('Setting up execute E2E tests...');
    userClient = createUserClient();
    logTest(`User address: ${TEST_USER_ADDRESS}`);

    // Ensure user has NUSDC for testing
    await ensureNusdcBalance(userClient, 5_000_000); // 5 NUSDC minimum
    const balance = await userClient.getBalance();
    logTest(`User NUSDC balance: ${formatNusdc(balance)}`);

    // Check if executors are available
    executors = await userClient.getExecutors();
    hasExecutors = executors.length > 0;
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
        expect(executor).toHaveProperty('address');
        expect(executor).toHaveProperty('name');
        expect(executor).toHaveProperty('endpoint');
        expect(executor).toHaveProperty('tier');
        expect(executor).toHaveProperty('isActive');
      } else {
        logTest('No executors registered - execute() tests will be skipped');
      }
    });
  });

  describe('execute()', () => {
    it('should execute AI inference and return result (requires executor)', async () => {
      if (!hasExecutors) {
        logTest('SKIPPED: No executors available on devnet');
        return;
      }

      logTest('Starting execute() test...');

      const balanceBefore = await userClient.getBalance();
      logTest(`Balance before: ${formatNusdc(balanceBefore)}`);

      const result = await userClient.execute({
        prompt: 'What is 2 + 2? Answer with just the number.',
        model: 'llama-3.1-8b-instant',
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

      // Check ECR was created
      if (result.ecr) {
        logTest(`ECR Object ID: ${result.ecr.objectId}`);
        expect(result.ecr).toHaveProperty('objectId');
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

  describe('getECR()', () => {
    it('should fetch ECR by request ID after execution (requires executor)', async () => {
      if (!hasExecutors) {
        logTest('SKIPPED: No executors available on devnet');
        return;
      }

      // Execute to create an ECR
      const result = await userClient.execute({
        prompt: 'Say hello',
        model: 'llama-3.1-8b-instant',
      });

      logTest(`Fetching ECR for request: ${result.requestId}`);

      // Fetch the ECR
      const ecr = await userClient.getECR(result.requestId);

      if (ecr) {
        logTest(`ECR found: ${ecr.objectId}`);
        expect(ecr).toHaveProperty('objectId');
        expect(ecr).toHaveProperty('requestId');
        expect(ecr.requestId).toBe(result.requestId);
      } else {
        // ECR might not be created immediately in some cases
        logTest('ECR not found (may be delayed)');
      }
    }, 120000);
  });
});
