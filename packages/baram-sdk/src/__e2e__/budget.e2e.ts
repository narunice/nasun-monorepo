/**
 * E2E Tests for Budget delegation feature
 *
 * Tests the complete Budget lifecycle in a single sequential flow:
 * 1. User creates Budget for Agent
 * 2. User deposits/withdraws from Budget
 * 3. Agent executes using Budget
 * 4. User deactivates Budget
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { BaramClient } from '../client';
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

describe('Baram Budget E2E', () => {
  let userClient: BaramClient;
  let agentClient: BaramClient;

  beforeAll(async () => {
    logTest('Setting up Budget E2E tests...');

    userClient = createUserClient();
    agentClient = createAgentClient();

    logTest(`User address: ${TEST_USER_ADDRESS}`);
    logTest(`Agent address: ${TEST_AGENT_ADDRESS}`);

    // Check if Budget is supported
    if (!userClient.hasBudgetSupport()) {
      throw new Error('Budget feature not configured in SDK');
    }

    // Ensure user has NUSDC for creating Budget
    await ensureNusdcBalance(userClient, 20_000_000); // 20 NUSDC
    const userBalance = await userClient.getBalance();
    logTest(`User NUSDC balance: ${formatNusdc(userBalance)}`);

    // Ensure agent has gas for transactions (but no NUSDC needed)
    await requestFaucet(TEST_AGENT_ADDRESS);
    logTest('Agent has gas for transactions');
  });

  it('should support Budget feature', () => {
    expect(userClient.hasBudgetSupport()).toBe(true);
    expect(agentClient.hasBudgetSupport()).toBe(true);
  });

  it('should create, manage, and use Budget (full lifecycle)', async () => {
    // ==========================================
    // Step 1: Create Budget
    // ==========================================
    logTest('Step 1: Creating Budget...');

    const balanceBefore = await userClient.getBalance();
    logTest(`User balance before: ${formatNusdc(balanceBefore)}`);

    const depositAmount = 5_000_000; // 5 NUSDC
    const createResult = await userClient.createBudget({
      agent: TEST_AGENT_ADDRESS,
      deposit: depositAmount,
      maxPerRequest: 1_000_000, // 1 NUSDC max per request
      allowedModels: ['llama-3.3-70b-versatile'],
      allowedExecutors: [], // All executors allowed
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    const budgetId = createResult.budgetId;
    logTest(`Budget created: ${budgetId}`);
    logTest(`TX Digest: ${createResult.txDigest}`);

    expect(budgetId).toBeTruthy();
    expect(createResult.txDigest).toBeTruthy();

    // Wait for state to sync
    await sleep(2000);

    // ==========================================
    // Step 2: Verify Budget exists and has correct data
    // ==========================================
    logTest('Step 2: Verifying Budget...');

    const budget = await userClient.getBudget(budgetId);
    logTest(`Budget info: ${JSON.stringify(budget, null, 2)}`);

    expect(budget).toBeTruthy();
    expect(budget!.id).toBe(budgetId);
    expect(budget!.owner).toBe(TEST_USER_ADDRESS);
    expect(budget!.agent).toBe(TEST_AGENT_ADDRESS);
    expect(budget!.isActive).toBe(true);
    expect(budget!.balance).toBe(depositAmount);
    expect(budget!.maxPerRequest).toBe(1_000_000);
    expect(budget!.allowedModels).toContain('llama-3.3-70b-versatile');

    // ==========================================
    // Step 3: Test getOwnedBudgets
    // ==========================================
    logTest('Step 3: Testing getOwnedBudgets...');

    const ownedBudgets = await userClient.getOwnedBudgets();
    logTest(`User owns ${ownedBudgets.length} Budget(s)`);

    const foundOwnedBudget = ownedBudgets.find((b) => b.id === budgetId);
    expect(foundOwnedBudget).toBeTruthy();

    // ==========================================
    // Step 4: Test getAgentBudgets
    // ==========================================
    logTest('Step 4: Testing getAgentBudgets...');

    const agentBudgets = await agentClient.getAgentBudgets();
    logTest(`Agent has access to ${agentBudgets.length} Budget(s)`);

    const foundAgentBudget = agentBudgets.find((b) => b.id === budgetId);
    expect(foundAgentBudget).toBeTruthy();

    // ==========================================
    // Step 5: Deposit more funds
    // ==========================================
    logTest('Step 5: Depositing additional funds...');

    const budgetBeforeDeposit = await userClient.getBudget(budgetId);
    const balanceBeforeDeposit = budgetBeforeDeposit!.balance;

    const depositMoreAmount = 2_000_000; // 2 NUSDC
    const depositTx = await userClient.depositToBudget(budgetId, depositMoreAmount);
    logTest(`Deposit TX: ${depositTx}`);

    await sleep(2000);

    const budgetAfterDeposit = await userClient.getBudget(budgetId);
    logTest(`Budget balance after deposit: ${formatNusdc(budgetAfterDeposit!.balance)}`);

    expect(budgetAfterDeposit!.balance).toBe(balanceBeforeDeposit + depositMoreAmount);

    // ==========================================
    // Step 6: Test constraint validation (model not allowed)
    // ==========================================
    logTest('Step 6: Testing model constraint validation...');

    // llama-3.2-3b-local is not in the allowed models list
    await expect(
      agentClient.executeWithBudget({
        budgetId,
        prompt: 'test',
        model: 'llama-3.2-3b-local',
      }),
    ).rejects.toThrow('not allowed');

    logTest('Model constraint validation works correctly');

    // ==========================================
    // Step 7: Withdraw funds
    // ==========================================
    logTest('Step 7: Withdrawing funds...');

    const budgetBeforeWithdraw = await userClient.getBudget(budgetId);
    const userBalanceBeforeWithdraw = await userClient.getBalance();

    const withdrawAmount = 1_000_000; // 1 NUSDC
    const withdrawTx = await userClient.withdrawFromBudget(budgetId, withdrawAmount);
    logTest(`Withdraw TX: ${withdrawTx}`);

    await sleep(2000);

    const budgetAfterWithdraw = await userClient.getBudget(budgetId);
    const userBalanceAfterWithdraw = await userClient.getBalance();

    logTest(`Budget balance after withdraw: ${formatNusdc(budgetAfterWithdraw!.balance)}`);
    logTest(`User balance after withdraw: ${formatNusdc(userBalanceAfterWithdraw)}`);

    expect(budgetAfterWithdraw!.balance).toBe(budgetBeforeWithdraw!.balance - withdrawAmount);
    expect(userBalanceAfterWithdraw).toBeGreaterThan(userBalanceBeforeWithdraw);

    // ==========================================
    // Step 8: Deactivate Budget
    // ==========================================
    logTest('Step 8: Deactivating Budget...');

    const budgetBeforeDeactivate = await userClient.getBudget(budgetId);
    const userBalanceBeforeDeactivate = await userClient.getBalance();
    logTest(`Budget balance before deactivate: ${formatNusdc(budgetBeforeDeactivate!.balance)}`);

    const deactivateTx = await userClient.deactivateBudget(budgetId);
    logTest(`Deactivate TX: ${deactivateTx}`);

    await sleep(2000);

    const budgetAfterDeactivate = await userClient.getBudget(budgetId);
    const userBalanceAfterDeactivate = await userClient.getBalance();

    logTest(`Budget isActive after: ${budgetAfterDeactivate!.isActive}`);
    logTest(`Budget balance after: ${formatNusdc(budgetAfterDeactivate!.balance)}`);
    logTest(`User balance after deactivate: ${formatNusdc(userBalanceAfterDeactivate)}`);

    expect(budgetAfterDeactivate!.isActive).toBe(false);
    expect(budgetAfterDeactivate!.balance).toBe(0);
    expect(userBalanceAfterDeactivate).toBeGreaterThan(userBalanceBeforeDeactivate);

    // ==========================================
    // Step 9: Test deactivated budget rejection
    // ==========================================
    logTest('Step 9: Testing deactivated budget rejection...');

    await expect(
      agentClient.executeWithBudget({
        budgetId,
        prompt: 'test',
        model: 'llama-3.3-70b-versatile',
      }),
    ).rejects.toThrow('deactivated');

    logTest('Deactivated budget rejection works correctly');

    logTest('Budget lifecycle test completed successfully!');
  }, 180000); // 3 minute timeout for full lifecycle

  it('should return null for non-existent Budget', async () => {
    const budget = await userClient.getBudget('0x0000000000000000000000000000000000000000000000000000000000000000');
    expect(budget).toBeNull();
  });

  it('should reject unauthorized agent', async () => {
    // Create a Budget for testing unauthorized access
    const createResult = await userClient.createBudget({
      agent: TEST_AGENT_ADDRESS,
      deposit: 1_000_000,
      maxPerRequest: 500_000,
      allowedModels: ['llama-3.3-70b-versatile'],
    });

    await sleep(2000);

    // Create a new client with a different keypair (unauthorized)
    const { Ed25519Keypair } = await import('@mysten/sui/keypairs/ed25519');
    const randomKeypair = Ed25519Keypair.generate();
    const { createDevnetConfig } = await import('../config');

    const unauthorizedClient = new BaramClient({
      config: createDevnetConfig(),
      signer: randomKeypair,
    });

    await expect(
      unauthorizedClient.executeWithBudget({
        budgetId: createResult.budgetId,
        prompt: 'test',
        model: 'llama-3.3-70b-versatile',
      }),
    ).rejects.toThrow();

    // Cleanup: deactivate the test budget
    await userClient.deactivateBudget(createResult.budgetId);
  }, 60000);
});
