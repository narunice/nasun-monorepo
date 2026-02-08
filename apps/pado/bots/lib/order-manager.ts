/**
 * Order Manager Module
 *
 * Handles DeepBook V3 order placement and cancellation.
 * Uses MARKET config for pool and token types.
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import {
  DEEPBOOK_PACKAGE,
  MARKET,
  CLOCK_ID,
  ORDER_TYPE,
  SELF_MATCHING,
  type OrderSpec,
  type BotState,
  timestamp,
} from './config.js';

// ========================================
// Transaction Builders
// ========================================

function generateProofAsOwner(tx: Transaction, balanceManagerId: string) {
  return tx.moveCall({
    target: `${DEEPBOOK_PACKAGE}::balance_manager::generate_proof_as_owner`,
    arguments: [tx.object(balanceManagerId)],
  });
}

/**
 * Build transaction to cancel all orders and place new orders
 */
export function buildCancelAndPlaceOrders(
  balanceManagerId: string,
  orders: OrderSpec[],
  state: BotState,
): Transaction {
  const tx = new Transaction();

  const tradeProof = generateProofAsOwner(tx, balanceManagerId);

  // Cancel all existing orders
  tx.moveCall({
    target: `${DEEPBOOK_PACKAGE}::pool::cancel_all_orders`,
    typeArguments: [MARKET.baseType, MARKET.quoteType],
    arguments: [
      tx.object(MARKET.poolId),
      tx.object(balanceManagerId),
      tradeProof,
      tx.object(CLOCK_ID),
    ],
  });

  // Place new orders
  for (const order of orders) {
    const clientOrderId = state.clientOrderIdCounter++;

    const orderInfo = tx.moveCall({
      target: `${DEEPBOOK_PACKAGE}::pool::place_limit_order`,
      typeArguments: [MARKET.baseType, MARKET.quoteType],
      arguments: [
        tx.object(MARKET.poolId),
        tx.object(balanceManagerId),
        tradeProof,
        tx.pure.u64(clientOrderId),
        tx.pure.u8(ORDER_TYPE.POST_ONLY),
        tx.pure.u8(SELF_MATCHING.CANCEL_TAKER),
        tx.pure.u64(order.price),
        tx.pure.u64(order.quantity),
        tx.pure.bool(order.isBid),
        tx.pure.bool(false), // pay_with_deep = false
        tx.pure.u64(Date.now() + 86400000), // 24h expiry
        tx.object(CLOCK_ID),
      ],
    });

    tx.moveCall({
      target: `${DEEPBOOK_PACKAGE}::order_info::order_id`,
      arguments: [orderInfo],
    });
  }

  return tx;
}

/**
 * Build transaction to place orders only (without cancellation)
 */
export function buildPlaceOrders(
  balanceManagerId: string,
  orders: OrderSpec[],
  state: BotState,
): Transaction {
  const tx = new Transaction();
  const tradeProof = generateProofAsOwner(tx, balanceManagerId);

  for (const order of orders) {
    const clientOrderId = state.clientOrderIdCounter++;

    const orderInfo = tx.moveCall({
      target: `${DEEPBOOK_PACKAGE}::pool::place_limit_order`,
      typeArguments: [MARKET.baseType, MARKET.quoteType],
      arguments: [
        tx.object(MARKET.poolId),
        tx.object(balanceManagerId),
        tradeProof,
        tx.pure.u64(clientOrderId),
        tx.pure.u8(ORDER_TYPE.POST_ONLY),
        tx.pure.u8(SELF_MATCHING.CANCEL_TAKER),
        tx.pure.u64(order.price),
        tx.pure.u64(order.quantity),
        tx.pure.bool(order.isBid),
        tx.pure.bool(false),
        tx.pure.u64(Date.now() + 86400000),
        tx.object(CLOCK_ID),
      ],
    });

    tx.moveCall({
      target: `${DEEPBOOK_PACKAGE}::order_info::order_id`,
      arguments: [orderInfo],
    });
  }

  return tx;
}

/**
 * Build transaction to cancel all orders only
 */
export function buildCancelAllOrders(balanceManagerId: string): Transaction {
  const tx = new Transaction();
  const tradeProof = generateProofAsOwner(tx, balanceManagerId);

  tx.moveCall({
    target: `${DEEPBOOK_PACKAGE}::pool::cancel_all_orders`,
    typeArguments: [MARKET.baseType, MARKET.quoteType],
    arguments: [
      tx.object(MARKET.poolId),
      tx.object(balanceManagerId),
      tradeProof,
      tx.object(CLOCK_ID),
    ],
  });

  return tx;
}

// ========================================
// Transaction Execution
// ========================================

export async function executeTransaction(
  client: SuiClient,
  keypair: Ed25519Keypair,
  tx: Transaction,
): Promise<{ success: boolean; digest?: string; error?: string }> {
  try {
    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showEffects: true },
    });

    if (result.effects?.status?.status !== 'success') {
      return {
        success: false,
        error: result.effects?.status?.error || 'Unknown error',
      };
    }

    return {
      success: true,
      digest: result.digest,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Cancel all orders and place new orders
 */
export async function syncOrders(
  client: SuiClient,
  keypair: Ed25519Keypair,
  balanceManagerId: string,
  orders: OrderSpec[],
  state: BotState,
): Promise<{ success: boolean; digest?: string; error?: string }> {
  if (orders.length > 0) {
    const sample = orders[0];
    console.log(`[${timestamp()}] Pool: ${MARKET.poolId.slice(0, 16)}...`);
    console.log(`[${timestamp()}] BalanceManager: ${balanceManagerId.slice(0, 16)}...`);
    console.log(`[${timestamp()}] Order sample: price=${sample.price}, qty=${sample.quantity}, isBid=${sample.isBid}`);
  }

  const tx = buildCancelAndPlaceOrders(balanceManagerId, orders, state);
  const result = await executeTransaction(client, keypair, tx);

  if (result.success) {
    console.log(`[${timestamp()}] Placed ${orders.length} orders (tx: ${result.digest?.slice(0, 10)}...)`);
  }

  return result;
}
