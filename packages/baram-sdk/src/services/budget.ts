/**
 * Budget service for AI agent delegation
 *
 * Provides functions for creating and managing Budget objects that allow
 * users to delegate compute spending to AI agents with constraints.
 */

import type { SuiClient, SuiObjectResponse } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import type {
  BaramConfig,
  BudgetInfo,
  CreateBudgetParams,
  UpdateBudgetConstraintsParams,
  CoinRef,
} from '../types';
import { BaramError } from '../errors';

const CLOCK_OBJECT_ID = '0x6';

/**
 * Fetch Budget info by object ID
 */
export async function fetchBudget(
  client: SuiClient,
  config: BaramConfig,
  budgetId: string
): Promise<BudgetInfo | null> {
  if (!config.budget) {
    throw new BaramError('Budget contract not configured', 'BUDGET_NOT_CONFIGURED');
  }

  try {
    const response = await client.getObject({
      id: budgetId,
      options: {
        showContent: true,
        showType: true,
      },
    });

    if (!response.data?.content || response.data.content.dataType !== 'moveObject') {
      return null;
    }

    const fields = response.data.content.fields as Record<string, unknown>;

    // Get current timestamp for expiration check
    const now = Date.now();
    const expiresAt = Number(fields.expires_at || 0);

    return {
      id: budgetId,
      owner: fields.owner as string,
      agent: fields.agent as string,
      balance: Number(fields.balance || 0),
      totalDeposited: Number(fields.total_deposited || 0),
      totalSpent: Number(fields.total_spent || 0),
      maxPerRequest: Number(fields.max_per_request || 0),
      allowedModels: (fields.allowed_models as string[]) || [],
      allowedExecutors: (fields.allowed_executors as string[]) || [],
      createdAt: Number(fields.created_at || 0),
      expiresAt,
      requestCount: Number(fields.request_count || 0),
      isActive: fields.is_active as boolean,
      isExpired: expiresAt > 0 && now >= expiresAt,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch all Budgets owned by an address.
 * Budget is a shared object, so we fetch BudgetReceipt (owned) to find budget IDs.
 */
export async function fetchBudgetsByOwner(
  client: SuiClient,
  config: BaramConfig,
  owner: string
): Promise<BudgetInfo[]> {
  if (!config.budget) {
    throw new BaramError('Budget contract not configured', 'BUDGET_NOT_CONFIGURED');
  }

  // Budget is shared, so we query BudgetReceipt (owned by user) instead
  const receiptType = `${config.budget.packageId}::budget::BudgetReceipt`;

  // Paginate through all BudgetReceipt objects
  const allObjects: SuiObjectResponse[] = [];
  let cursor: string | null | undefined = undefined;
  let hasNextPage = true;

  while (hasNextPage) {
    const response = await client.getOwnedObjects({
      owner,
      filter: { StructType: receiptType },
      options: { showContent: true },
      ...(cursor ? { cursor } : {}),
    });
    allObjects.push(...response.data);
    hasNextPage = response.hasNextPage;
    cursor = response.nextCursor;
  }

  const budgets: BudgetInfo[] = [];

  for (const obj of allObjects) {
    if (obj.data?.content && obj.data.content.dataType === 'moveObject') {
      const fields = obj.data.content.fields as Record<string, unknown>;
      const budgetId = fields.budget_id as string;

      // Fetch the actual Budget object
      const budget = await fetchBudget(client, config, budgetId);
      if (budget) {
        budgets.push(budget);
      }
    }
  }

  return budgets;
}

/**
 * Fetch Budgets where the given address is the authorized agent
 */
export async function fetchBudgetsByAgent(
  client: SuiClient,
  config: BaramConfig,
  agent: string
): Promise<BudgetInfo[]> {
  if (!config.budget) {
    throw new BaramError('Budget contract not configured', 'BUDGET_NOT_CONFIGURED');
  }

  // Query BudgetCreated events to find budgets for this agent
  const budgetType = `${config.budget.packageId}::budget::BudgetCreated`;

  const events = await client.queryEvents({
    query: { MoveEventType: budgetType },
    order: 'descending',
    limit: 100,
  });

  const budgetIds: string[] = [];
  for (const event of events.data) {
    const parsedJson = event.parsedJson as Record<string, unknown>;
    if (parsedJson.agent === agent) {
      budgetIds.push(parsedJson.budget_id as string);
    }
  }

  // Fetch each budget
  const budgets: BudgetInfo[] = [];
  for (const id of budgetIds) {
    const budget = await fetchBudget(client, config, id);
    if (budget && budget.isActive) {
      budgets.push(budget);
    }
  }

  return budgets;
}

/**
 * Build create_budget transaction
 */
export function buildCreateBudgetTransaction(
  config: BaramConfig,
  params: CreateBudgetParams,
  coins: CoinRef[]
): Transaction {
  if (!config.budget) {
    throw new BaramError('Budget contract not configured', 'BUDGET_NOT_CONFIGURED');
  }

  const tx = new Transaction();

  // Merge coins if multiple
  let paymentCoin: ReturnType<typeof tx.object>;
  if (coins.length === 1) {
    paymentCoin = tx.object(coins[0].objectId);
  } else {
    const [firstCoin, ...restCoins] = coins;
    paymentCoin = tx.object(firstCoin.objectId);
    if (restCoins.length > 0) {
      tx.mergeCoins(
        paymentCoin,
        restCoins.map((c: CoinRef) => tx.object(c.objectId))
      );
    }
  }

  // Split exact amount
  const [depositCoin] = tx.splitCoins(paymentCoin, [tx.pure.u64(params.deposit)]);

  tx.moveCall({
    target: `${config.budget.packageId}::budget::create_budget`,
    arguments: [
      depositCoin,
      tx.pure.address(params.agent),
      tx.pure.u64(params.maxPerRequest || 0),
      tx.pure.vector('string', params.allowedModels || []),
      tx.pure.vector('address', params.allowedExecutors || []),
      tx.pure.u64(params.expiresAt || 0),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });

  return tx;
}

/**
 * Build deposit_to_budget transaction
 */
export function buildDepositToBudgetTransaction(
  config: BaramConfig,
  budgetId: string,
  amount: number,
  coins: CoinRef[]
): Transaction {
  if (!config.budget) {
    throw new BaramError('Budget contract not configured', 'BUDGET_NOT_CONFIGURED');
  }

  const tx = new Transaction();

  // Merge coins if multiple
  let paymentCoin: ReturnType<typeof tx.object>;
  if (coins.length === 1) {
    paymentCoin = tx.object(coins[0].objectId);
  } else {
    const [firstCoin, ...restCoins] = coins;
    paymentCoin = tx.object(firstCoin.objectId);
    if (restCoins.length > 0) {
      tx.mergeCoins(
        paymentCoin,
        restCoins.map((c: CoinRef) => tx.object(c.objectId))
      );
    }
  }

  // Split exact amount
  const [depositCoin] = tx.splitCoins(paymentCoin, [tx.pure.u64(amount)]);

  tx.moveCall({
    target: `${config.budget.packageId}::budget::deposit_to_budget`,
    arguments: [tx.object(budgetId), depositCoin],
  });

  return tx;
}

/**
 * Build withdraw_from_budget transaction
 */
export function buildWithdrawFromBudgetTransaction(
  config: BaramConfig,
  budgetId: string,
  amount: number
): Transaction {
  if (!config.budget) {
    throw new BaramError('Budget contract not configured', 'BUDGET_NOT_CONFIGURED');
  }

  const tx = new Transaction();

  tx.moveCall({
    target: `${config.budget.packageId}::budget::withdraw_from_budget`,
    arguments: [tx.object(budgetId), tx.pure.u64(amount)],
  });

  return tx;
}

/**
 * Build deactivate_budget transaction
 */
export function buildDeactivateBudgetTransaction(
  config: BaramConfig,
  budgetId: string
): Transaction {
  if (!config.budget) {
    throw new BaramError('Budget contract not configured', 'BUDGET_NOT_CONFIGURED');
  }

  const tx = new Transaction();

  tx.moveCall({
    target: `${config.budget.packageId}::budget::deactivate_budget`,
    arguments: [tx.object(budgetId)],
  });

  return tx;
}

/**
 * Build update_constraints transaction
 */
export function buildUpdateConstraintsTransaction(
  config: BaramConfig,
  params: UpdateBudgetConstraintsParams
): Transaction {
  if (!config.budget) {
    throw new BaramError('Budget contract not configured', 'BUDGET_NOT_CONFIGURED');
  }

  const tx = new Transaction();

  tx.moveCall({
    target: `${config.budget.packageId}::budget::update_constraints`,
    arguments: [
      tx.object(params.budgetId),
      tx.pure.u64(params.maxPerRequest || 0),
      tx.pure.vector('string', params.allowedModels || []),
      tx.pure.vector('address', params.allowedExecutors || []),
      tx.pure.u64(params.expiresAt || 0),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });

  return tx;
}

/**
 * Build create_request_with_budget transaction (for agents)
 */
export function buildCreateRequestWithBudgetTransaction(
  config: BaramConfig,
  budgetId: string,
  promptHashBytes: number[],
  model: string,
  executorOperator: string
): Transaction {
  if (!config.budget) {
    throw new BaramError('Budget contract not configured', 'BUDGET_NOT_CONFIGURED');
  }

  const tx = new Transaction();

  tx.moveCall({
    target: `${config.baram.packageId}::baram::create_request_with_budget`,
    arguments: [
      tx.object(config.baram.registryId),
      tx.object(budgetId),
      tx.pure.vector('u8', promptHashBytes),
      tx.pure.string(model),
      tx.pure.address(executorOperator),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });

  return tx;
}
