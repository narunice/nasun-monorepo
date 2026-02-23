/**
 * Transaction builder for Baram requests
 */

import { Transaction } from '@mysten/sui/transactions';
import { BARAM_CONFIG } from '@/config/network';
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
