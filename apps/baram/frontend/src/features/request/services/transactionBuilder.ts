/**
 * Transaction builder for Baram requests
 */

import { Transaction } from '@mysten/sui/transactions';
import { BARAM_CONFIG, AGENT_CONFIG } from '@/config/network';
import type { CoinRef } from './coinService';

const SUI_CLOCK_ID = '0x6';

export interface BuildRequestParams {
  coins: CoinRef[];
  promptHashBytes: number[];
  model: string;
  executorOperator: string;
  price: number;
}

/**
 * Build a create_request transaction
 *
 * @param params - Transaction parameters
 * @returns Transaction object ready for signing
 */
export function buildCreateRequestTransaction(params: BuildRequestParams): Transaction {
  const { coins, promptHashBytes, model, executorOperator, price } = params;
  const tx = new Transaction();

  // If multiple coins, merge them first
  if (coins.length > 1) {
    const [primary, ...rest] = coins;
    tx.mergeCoins(
      tx.object(primary.objectId),
      rest.map(c => tx.object(c.objectId))
    );
  }

  // Split exact amount for payment
  const [paymentCoin] = tx.splitCoins(
    tx.object(coins[0].objectId),
    [tx.pure.u64(price)]
  );

  // Call create_request with selected executor
  tx.moveCall({
    target: `${BARAM_CONFIG.packageId}::baram::create_request`,
    arguments: [
      tx.object(BARAM_CONFIG.registryId), // registry
      paymentCoin, // payment
      tx.pure.vector('u8', promptHashBytes), // prompt_hash
      tx.pure.string(model), // model
      tx.pure.address(executorOperator), // executor from registry
      tx.object(SUI_CLOCK_ID),
    ],
  });

  return tx;
}

/**
 * Build a cancel_request transaction to release escrow funds
 *
 * Used for auto-cancel when executor fails to respond.
 * Only works when request status is PENDING and before timeout.
 */
export function buildCancelRequestTransaction(requestId: number): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM_CONFIG.packageId}::baram::cancel_request`,
    arguments: [
      tx.object(BARAM_CONFIG.registryId),
      tx.pure.u64(requestId),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

// ========== Budget Transaction Builders ==========

export interface BuildCreateBudgetParams {
  coins: CoinRef[];
  deposit: number;
  agent: string;
  maxPerRequest: number;
  allowedModels: string[];
  allowedExecutors: string[];
  expiresAt: number;
}

export function buildCreateBudgetTransaction(params: BuildCreateBudgetParams): Transaction {
  const { coins, deposit, agent, maxPerRequest, allowedModels, allowedExecutors, expiresAt } = params;
  const tx = new Transaction();

  if (coins.length > 1) {
    const [primary, ...rest] = coins;
    tx.mergeCoins(
      tx.object(primary.objectId),
      rest.map(c => tx.object(c.objectId))
    );
  }

  const [depositCoin] = tx.splitCoins(
    tx.object(coins[0].objectId),
    [tx.pure.u64(deposit)]
  );

  tx.moveCall({
    target: `${BARAM_CONFIG.packageId}::budget::create_budget`,
    arguments: [
      depositCoin,
      tx.pure.address(agent),
      tx.pure.u64(maxPerRequest),
      tx.pure.vector('string', allowedModels),
      tx.pure.vector('address', allowedExecutors),
      tx.pure.u64(expiresAt),
      tx.object(SUI_CLOCK_ID),
    ],
  });

  return tx;
}

export function buildDepositToBudgetTransaction(
  budgetId: string,
  coins: CoinRef[],
  amount: number
): Transaction {
  const tx = new Transaction();

  if (coins.length > 1) {
    const [primary, ...rest] = coins;
    tx.mergeCoins(
      tx.object(primary.objectId),
      rest.map(c => tx.object(c.objectId))
    );
  }

  const [depositCoin] = tx.splitCoins(
    tx.object(coins[0].objectId),
    [tx.pure.u64(amount)]
  );

  tx.moveCall({
    target: `${BARAM_CONFIG.packageId}::budget::deposit_to_budget`,
    arguments: [
      tx.object(budgetId),
      depositCoin,
    ],
  });

  return tx;
}

export function buildWithdrawFromBudgetTransaction(
  budgetId: string,
  amount: number
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM_CONFIG.packageId}::budget::withdraw_from_budget`,
    arguments: [
      tx.object(budgetId),
      tx.pure.u64(amount),
    ],
  });
  return tx;
}

export function buildDeactivateBudgetTransaction(budgetId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM_CONFIG.packageId}::budget::deactivate_budget`,
    arguments: [
      tx.object(budgetId),
    ],
  });
  return tx;
}

// ========== Agent Profile Transaction Builders ==========

export function buildCreateAgentTransaction(params: {
  agentAddress: string;
  name: string;
  role: string;
  capabilities: string[];
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${AGENT_CONFIG.packageId}::agent_profile::create_agent`,
    arguments: [
      tx.object(AGENT_CONFIG.registryId),
      tx.pure.address(params.agentAddress),
      tx.pure.string(params.name),
      tx.pure.string(params.role),
      tx.pure.vector('string', params.capabilities),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

export function buildDeactivateAgentTransaction(profileId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${AGENT_CONFIG.packageId}::agent_profile::deactivate_agent`,
    arguments: [
      tx.object(AGENT_CONFIG.registryId),
      tx.object(profileId),
    ],
  });
  return tx;
}

export function buildReactivateAgentTransaction(profileId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${AGENT_CONFIG.packageId}::agent_profile::reactivate_agent`,
    arguments: [
      tx.object(AGENT_CONFIG.registryId),
      tx.object(profileId),
    ],
  });
  return tx;
}

// ========== Budget Constraints Transaction Builders ==========

export function buildUpdateConstraintsTransaction(params: {
  budgetId: string;
  maxPerRequest: number;
  allowedModels: string[];
  allowedExecutors: string[];
  expiresAt: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM_CONFIG.packageId}::budget::update_constraints`,
    arguments: [
      tx.object(params.budgetId),
      tx.pure.u64(params.maxPerRequest),
      tx.pure.vector('string', params.allowedModels),
      tx.pure.vector('address', params.allowedExecutors),
      tx.pure.u64(params.expiresAt),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

export function buildSetSpendingLimitsTransaction(params: {
  budgetId: string;
  dailyLimit: number;
  weeklyLimit: number;
  monthlyLimit: number;
  minIntervalMs: number;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM_CONFIG.packageId}::budget::set_spending_limits`,
    arguments: [
      tx.object(params.budgetId),
      tx.pure.u64(params.dailyLimit),
      tx.pure.u64(params.weeklyLimit),
      tx.pure.u64(params.monthlyLimit),
      tx.pure.u64(params.minIntervalMs),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

export function buildSetCategoriesTransaction(params: {
  budgetId: string;
  allowedCategories: string[];
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM_CONFIG.packageId}::budget::set_categories`,
    arguments: [
      tx.object(params.budgetId),
      tx.pure.vector('string', params.allowedCategories),
    ],
  });
  return tx;
}
