/**
 * E2E Tests for error paths
 *
 * Tests edge cases and error conditions in the Baram SDK.
 * All tests in this file can run WITHOUT active executors on devnet.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { BaramClient } from '../client';
import { BaramError } from '../errors';
import type { BudgetInfo } from '../types';
import {
  createUserClient,
  createAgentClient,
  ensureNusdcBalance,
  requestFaucet,
  logTest,
  formatNusdc,
  sleep,
  TEST_USER_ADDRESS,
  TEST_AGENT_ADDRESS,
} from './setup';

describe('Baram Error Paths E2E', () => {
  let userClient: BaramClient;
  let agentClient: BaramClient;

  beforeAll(async () => {
    logTest('Setting up error path tests...');
    userClient = createUserClient();
    agentClient = createAgentClient();

    await ensureNusdcBalance(userClient, 10_000_000); // 10 NUSDC
    await requestFaucet(TEST_AGENT_ADDRESS);
    logTest('Setup complete');
  });

  // ==========================================
  // AER Error Paths
  // ==========================================

  describe('AER error paths', () => {
    it('should return null for non-existent requestId', async () => {
      const aer = await userClient.getAER(999_999_999);
      logTest(`AER for non-existent requestId: ${aer}`);
      expect(aer).toBeNull();
    });

    it('should return null for requestId 0', async () => {
      const aer = await userClient.getAER(0);
      logTest(`AER for requestId 0: ${aer}`);
      expect(aer).toBeNull();
    });
  });

  // ==========================================
  // Budget Error Paths
  // ==========================================

  describe('Budget error paths', () => {
    let testBudgetId: string;
    let deactivatedBudgetId: string;

    beforeAll(async () => {
      // Create a test budget for error path testing
      logTest('Creating test budget for error paths...');
      const result = await userClient.createBudget({
        agent: TEST_AGENT_ADDRESS,
        deposit: 1_000_000, // 1 NUSDC
        maxPerRequest: 500_000, // 0.5 NUSDC
        allowedModels: ['llama-3.3-70b-versatile'],
      });
      testBudgetId = result.budgetId;
      logTest(`Test budget created: ${testBudgetId}`);
      await sleep(3000);

      // Create and immediately deactivate a budget for deactivated tests
      logTest('Creating budget to deactivate...');
      const deactivateResult = await userClient.createBudget({
        agent: TEST_AGENT_ADDRESS,
        deposit: 1_000_000,
        maxPerRequest: 500_000,
        allowedModels: ['llama-3.3-70b-versatile'],
      });
      deactivatedBudgetId = deactivateResult.budgetId;
      await sleep(3000);
      await userClient.deactivateBudget(deactivatedBudgetId);
      await sleep(3000);
      logTest(`Deactivated budget: ${deactivatedBudgetId}`);
    });

    it('should reject executeWithBudget on deactivated budget', async () => {
      await expect(
        agentClient.executeWithBudget({
          budgetId: deactivatedBudgetId,
          prompt: 'test',
          model: 'llama-3.3-70b-versatile',
        }),
      ).rejects.toThrow('deactivated');

      logTest('Deactivated budget correctly rejected');
    });

    it('should reject executeWithBudget with disallowed model', async () => {
      // Budget only allows llama-3.3-70b-versatile
      await expect(
        agentClient.executeWithBudget({
          budgetId: testBudgetId,
          prompt: 'test',
          model: 'llama-3.2-3b-local',
        }),
      ).rejects.toThrow('not allowed');

      logTest('Model constraint correctly enforced');
    });

    it('should reject unauthorized agent for executeWithBudget', async () => {
      // Create a random keypair (not the authorized agent)
      const { Ed25519Keypair } = await import('@mysten/sui/keypairs/ed25519');
      const randomKeypair = Ed25519Keypair.generate();
      const { createDevnetConfig } = await import('../config');

      const unauthorizedClient = new BaramClient({
        config: createDevnetConfig(),
        signer: randomKeypair,
      });

      await expect(
        unauthorizedClient.executeWithBudget({
          budgetId: testBudgetId,
          prompt: 'test',
          model: 'llama-3.3-70b-versatile',
        }),
      ).rejects.toThrow();

      logTest('Unauthorized agent correctly rejected');
    });

    it('should reject withdraw from non-owned budget', async () => {
      // Agent tries to withdraw from user's budget
      await expect(
        agentClient.withdrawFromBudget(testBudgetId, 100_000),
      ).rejects.toThrow();

      logTest('Non-owner withdraw correctly rejected');
    });

    it('should reject deactivation from non-owner', async () => {
      // Agent tries to deactivate user's budget
      await expect(
        agentClient.deactivateBudget(testBudgetId),
      ).rejects.toThrow();

      logTest('Non-owner deactivation correctly rejected');
    });

    it('should reject withdraw exceeding balance', async () => {
      const budget = await userClient.getBudget(testBudgetId) as BudgetInfo;
      const overAmount = budget.balance + 1_000_000; // More than available

      await expect(
        userClient.withdrawFromBudget(testBudgetId, overAmount),
      ).rejects.toThrow();

      logTest('Over-withdrawal correctly rejected');
    });

    it('should reject deposit to deactivated budget', async () => {
      await expect(
        userClient.depositToBudget(deactivatedBudgetId, 1_000_000),
      ).rejects.toThrow();

      logTest('Deposit to deactivated budget correctly rejected');
    });

    it('should return null for getBudget with zero address', async () => {
      const budget = await userClient.getBudget(
        '0x0000000000000000000000000000000000000000000000000000000000000000'
      );
      expect(budget).toBeNull();

      logTest('Zero address budget returns null');
    });

    // Cleanup
    it('should clean up test budget', async () => {
      try {
        await userClient.deactivateBudget(testBudgetId);
        await sleep(3000);
        logTest('Test budget cleaned up');
      } catch {
        logTest('Test budget already deactivated or cleanup failed (non-fatal)');
      }
    });
  });

  // ==========================================
  // Model / Config Error Paths
  // ==========================================

  describe('Model error paths', () => {
    it('should throw for unknown model in execute()', async () => {
      await expect(
        userClient.execute({
          prompt: 'test',
          model: 'nonexistent-model-xyz',
        }),
      ).rejects.toThrow('Unknown model');

      logTest('Unknown model correctly rejected');
    });

    it('should throw for unknown model in executeWithBudget()', async () => {
      // Wait for previous coin operations to finalize
      await sleep(3000);

      // Need a valid budget first
      const result = await userClient.createBudget({
        agent: TEST_AGENT_ADDRESS,
        deposit: 1_000_000,
        maxPerRequest: 500_000,
        allowedModels: [], // Allow all models
      });
      await sleep(3000);

      await expect(
        agentClient.executeWithBudget({
          budgetId: result.budgetId,
          prompt: 'test',
          model: 'nonexistent-model-xyz',
        }),
      ).rejects.toThrow('Unknown model');

      // Cleanup
      await userClient.deactivateBudget(result.budgetId);
      logTest('Unknown model in executeWithBudget correctly rejected');
    }, 60000);
  });
});
