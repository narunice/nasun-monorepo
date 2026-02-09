/**
 * E2E Tests for Budget edge cases
 *
 * Tests boundary conditions and lifecycle edge cases for Budget delegation.
 * All tests can run WITHOUT active executors on devnet.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { BaramClient } from '../client';
import {
  createUserClient,
  ensureNusdcBalance,
  logTest,
  formatNusdc,
  sleep,
  TEST_USER_ADDRESS,
  TEST_AGENT_ADDRESS,
} from './setup';

describe('Baram Budget Edge Cases E2E', () => {
  let userClient: BaramClient;

  beforeAll(async () => {
    logTest('Setting up budget edge case tests...');
    userClient = createUserClient();

    await ensureNusdcBalance(userClient, 20_000_000); // 20 NUSDC
    const balance = await userClient.getBalance();
    logTest(`User NUSDC balance: ${formatNusdc(balance)}`);
  });

  it('should create and immediately deactivate a budget', async () => {
    logTest('Creating budget for immediate deactivation...');

    const result = await userClient.createBudget({
      agent: TEST_AGENT_ADDRESS,
      deposit: 1_000_000, // 1 NUSDC
      maxPerRequest: 500_000,
    });
    logTest(`Budget created: ${result.budgetId}`);

    await sleep(3000);

    // Deactivate immediately
    const deactivateTx = await userClient.deactivateBudget(result.budgetId);
    logTest(`Deactivated: ${deactivateTx}`);

    await sleep(3000);

    const budget = await userClient.getBudget(result.budgetId);
    expect(budget).toBeTruthy();
    expect(budget!.isActive).toBe(false);
    expect(budget!.balance).toBe(0);

    logTest('Immediate deactivation works correctly — funds returned');
  }, 60000);

  it('should accumulate balance across multiple deposits', async () => {
    // Wait for previous test's coin operations to finalize
    await sleep(3000);
    logTest('Testing multiple deposits...');

    const result = await userClient.createBudget({
      agent: TEST_AGENT_ADDRESS,
      deposit: 1_000_000, // 1 NUSDC initial
      maxPerRequest: 500_000,
    });

    await sleep(3000);

    const budgetAfterCreate = await userClient.getBudget(result.budgetId);
    expect(budgetAfterCreate!.balance).toBe(1_000_000);
    logTest(`After create: ${formatNusdc(budgetAfterCreate!.balance)}`);

    // Deposit 1: +0.5 NUSDC
    await userClient.depositToBudget(result.budgetId, 500_000);
    await sleep(3000);

    const budgetAfterDeposit1 = await userClient.getBudget(result.budgetId);
    expect(budgetAfterDeposit1!.balance).toBe(1_500_000);
    logTest(`After deposit 1: ${formatNusdc(budgetAfterDeposit1!.balance)}`);

    // Deposit 2: +1.5 NUSDC
    await userClient.depositToBudget(result.budgetId, 1_500_000);
    await sleep(3000);

    const budgetAfterDeposit2 = await userClient.getBudget(result.budgetId);
    expect(budgetAfterDeposit2!.balance).toBe(3_000_000);
    logTest(`After deposit 2: ${formatNusdc(budgetAfterDeposit2!.balance)}`);

    // Verify totalDeposited tracks cumulative deposits
    expect(budgetAfterDeposit2!.totalDeposited).toBe(3_000_000);

    // Cleanup
    await userClient.deactivateBudget(result.budgetId);
    logTest('Multiple deposit test passed');
  }, 60000);

  it('should handle partial withdrawal correctly', async () => {
    // Wait for previous test's coin operations to finalize
    await sleep(3000);
    logTest('Testing partial withdrawal...');

    const result = await userClient.createBudget({
      agent: TEST_AGENT_ADDRESS,
      deposit: 5_000_000, // 5 NUSDC
      maxPerRequest: 1_000_000,
    });

    await sleep(3000);

    // Withdraw 2 NUSDC (partial)
    const userBalanceBefore = await userClient.getBalance();
    await userClient.withdrawFromBudget(result.budgetId, 2_000_000);
    await sleep(3000);

    const budgetAfterWithdraw = await userClient.getBudget(result.budgetId);
    expect(budgetAfterWithdraw!.balance).toBe(3_000_000);
    expect(budgetAfterWithdraw!.isActive).toBe(true);

    // User should have received the withdrawn amount
    const userBalanceAfter = await userClient.getBalance();
    expect(userBalanceAfter).toBeGreaterThan(userBalanceBefore);

    logTest(`Budget balance: ${formatNusdc(budgetAfterWithdraw!.balance)}`);
    logTest(`User balance change: +${formatNusdc(userBalanceAfter - userBalanceBefore)}`);

    // Cleanup
    await userClient.deactivateBudget(result.budgetId);
    logTest('Partial withdrawal test passed');
  }, 60000);

  it('should handle full withdrawal (balance -> 0) while staying active', async () => {
    // Wait for previous test's coin operations to finalize
    await sleep(3000);
    logTest('Testing full withdrawal...');

    const result = await userClient.createBudget({
      agent: TEST_AGENT_ADDRESS,
      deposit: 2_000_000, // 2 NUSDC
      maxPerRequest: 1_000_000,
    });

    await sleep(3000);

    // Withdraw entire balance
    await userClient.withdrawFromBudget(result.budgetId, 2_000_000);
    await sleep(3000);

    const budget = await userClient.getBudget(result.budgetId);
    expect(budget!.balance).toBe(0);
    // Budget should still be "active" — just zero balance
    // (deactivation is a separate explicit action)
    expect(budget!.isActive).toBe(true);

    logTest(`Budget balance: ${budget!.balance}, isActive: ${budget!.isActive}`);

    // Cleanup
    await userClient.deactivateBudget(result.budgetId);
    logTest('Full withdrawal test passed');
  }, 60000);

  it('should reject executeWithBudget on insufficient budget balance', async () => {
    // Wait for previous test's coin operations to finalize
    await sleep(3000);
    logTest('Testing insufficient budget balance...');

    // MIN_DEPOSIT = 100_000 (0.1 NUSDC) = model price for llama-3.3-70b
    // Strategy: create at minimum, then withdraw to make balance < model price
    const result = await userClient.createBudget({
      agent: TEST_AGENT_ADDRESS,
      deposit: 100_000, // 0.1 NUSDC — meets MIN_DEPOSIT
      maxPerRequest: 500_000,
      allowedModels: ['llama-3.3-70b-versatile'],
    });
    await sleep(3000);

    // Withdraw half — balance becomes 50_000 < model price 100_000
    await userClient.withdrawFromBudget(result.budgetId, 50_000);
    await sleep(3000);

    const budget = await userClient.getBudget(result.budgetId);
    logTest(`Budget balance after withdrawal: ${formatNusdc(budget!.balance)}`);
    expect(budget!.balance).toBe(50_000);

    const { createAgentClient } = await import('./setup');
    const agent = createAgentClient();

    await expect(
      agent.executeWithBudget({
        budgetId: result.budgetId,
        prompt: 'test',
        model: 'llama-3.3-70b-versatile',
      }),
    ).rejects.toThrow('Insufficient');

    // Cleanup
    await userClient.deactivateBudget(result.budgetId);
    logTest('Insufficient budget balance correctly rejected');
  }, 60000);
});
