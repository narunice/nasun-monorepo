/**
 * Transaction builders for Nasun AI flows: agent profile registration, budget
 * lifecycle (create/deposit/withdraw/deactivate), constraint and spending limit
 * updates, and create_request / cancel_request. The underlying Move modules
 * still live in the `baram::*` namespace (ARCHIVED but not renamed onchain).
 */

import { Transaction } from '@mysten/sui/transactions';
import { BARAM } from '@nasun/devnet-config';
import type { CoinRef } from './coinService';

const SUI_CLOCK_ID = '0x6';
const SUI_OBJECT_ID_RE = /^0x[0-9a-fA-F]{64}$/;

function validateObjectId(id: string, label: string): void {
  if (!SUI_OBJECT_ID_RE.test(id)) {
    throw new Error(`Invalid ${label}: expected 0x + 64 hex chars`);
  }
}

// ========== Agent Profile ==========

export function buildCreateAgentTransaction(params: {
  agentAddress: string;
  name: string;
  role: string;
  capabilities: string[];
}): Transaction {
  validateObjectId(params.agentAddress, 'agentAddress');
  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM.agentPackageId}::agent_profile::create_agent`,
    arguments: [
      tx.object(BARAM.agentProfileRegistry),
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
  validateObjectId(profileId, 'profileId');
  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM.agentPackageId}::agent_profile::deactivate_agent`,
    arguments: [tx.object(BARAM.agentProfileRegistry), tx.object(profileId)],
  });
  return tx;
}

export function buildReactivateAgentTransaction(profileId: string): Transaction {
  validateObjectId(profileId, 'profileId');
  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM.agentPackageId}::agent_profile::reactivate_agent`,
    arguments: [tx.object(BARAM.agentProfileRegistry), tx.object(profileId)],
  });
  return tx;
}

// ========== Request lifecycle ==========

export interface BuildRequestParams {
  coins: CoinRef[];
  promptHashBytes: number[];
  model: string;
  executorOperator: string;
  price: number;
}

export function buildCreateRequestTransaction(params: BuildRequestParams): Transaction {
  const { coins, promptHashBytes, model, executorOperator, price } = params;
  const tx = new Transaction();

  if (coins.length > 1) {
    const [primary, ...rest] = coins;
    tx.mergeCoins(tx.object(primary.objectId), rest.map((c) => tx.object(c.objectId)));
  }

  const [paymentCoin] = tx.splitCoins(tx.object(coins[0].objectId), [tx.pure.u64(price)]);

  tx.moveCall({
    target: `${BARAM.packageId}::baram::create_request`,
    arguments: [
      tx.object(BARAM.registry),
      paymentCoin,
      tx.pure.vector('u8', promptHashBytes),
      tx.pure.string(model),
      tx.pure.address(executorOperator),
      tx.object(SUI_CLOCK_ID),
    ],
  });
  return tx;
}

export function buildCancelRequestTransaction(requestId: number): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM.packageId}::baram::cancel_request`,
    arguments: [tx.object(BARAM.registry), tx.pure.u64(requestId), tx.object(SUI_CLOCK_ID)],
  });
  return tx;
}

// ========== Budget ==========

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
    tx.mergeCoins(tx.object(primary.objectId), rest.map((c) => tx.object(c.objectId)));
  }

  const [depositCoin] = tx.splitCoins(tx.object(coins[0].objectId), [tx.pure.u64(deposit)]);

  tx.moveCall({
    target: `${BARAM.packageId}::budget::create_budget`,
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
  amount: number,
): Transaction {
  validateObjectId(budgetId, 'budgetId');
  const tx = new Transaction();

  if (coins.length > 1) {
    const [primary, ...rest] = coins;
    tx.mergeCoins(tx.object(primary.objectId), rest.map((c) => tx.object(c.objectId)));
  }

  const [depositCoin] = tx.splitCoins(tx.object(coins[0].objectId), [tx.pure.u64(amount)]);

  tx.moveCall({
    target: `${BARAM.packageId}::budget::deposit_to_budget`,
    arguments: [tx.object(budgetId), depositCoin],
  });
  return tx;
}

export function buildWithdrawFromBudgetTransaction(budgetId: string, amount: number): Transaction {
  validateObjectId(budgetId, 'budgetId');
  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM.packageId}::budget::withdraw_from_budget`,
    arguments: [tx.object(budgetId), tx.pure.u64(amount)],
  });
  return tx;
}

export function buildDeactivateBudgetTransaction(budgetId: string): Transaction {
  validateObjectId(budgetId, 'budgetId');
  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM.packageId}::budget::deactivate_budget`,
    arguments: [tx.object(budgetId)],
  });
  return tx;
}

export function buildUpdateConstraintsTransaction(params: {
  budgetId: string;
  maxPerRequest: number;
  allowedModels: string[];
  allowedExecutors: string[];
  expiresAt: number;
}): Transaction {
  validateObjectId(params.budgetId, 'budgetId');
  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM.packageId}::budget::update_constraints`,
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
  validateObjectId(params.budgetId, 'budgetId');
  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM.packageId}::budget::set_spending_limits`,
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
  validateObjectId(params.budgetId, 'budgetId');
  const tx = new Transaction();
  tx.moveCall({
    target: `${BARAM.packageId}::budget::set_categories`,
    arguments: [
      tx.object(params.budgetId),
      tx.pure.vector('string', params.allowedCategories),
    ],
  });
  return tx;
}
