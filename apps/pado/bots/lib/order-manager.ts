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
        tx.pure.u64(Date.now() + 600000), // 10min expiry — auto-expire if bot goes down
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
        tx.pure.u64(Date.now() + 600000), // 10min expiry — consistent with cancel+place path
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
  let result = await executeTransaction(client, keypair, tx);

  // Self-heal on object version conflict: wait for RPC to sync, then rebuild
  // a fresh TX and retry once. The same TX cannot be retried (stale version),
  // but a new TX built after the wait will use the current object version.
  if (!result.success && result.error?.includes('not available for consumption')) {
    console.log(`[${timestamp()}] Object version conflict, waiting 3s and rebuilding TX...`);
    await new Promise((r) => setTimeout(r, 3000));
    const retryTx = buildCancelAndPlaceOrders(balanceManagerId, orders, state);
    result = await executeTransaction(client, keypair, retryTx);
    if (result.success) {
      console.log(`[${timestamp()}] Version conflict self-healed`);
    }
  }

  // Self-heal on POST_ONLY crossing (assert_execution code 5): the combined
  // cancel+place TX is atomic — if any order crosses the book, cancel also
  // rolls back and stale orders accumulate. Fix: run cancel-only first, then
  // place-only separately so that the cancel always succeeds.
  if (!result.success && result.error?.includes('assert_execution')) {
    console.log(`[${timestamp()}] POST_ONLY crossing detected, splitting cancel+place...`);
    const cancelTx = buildCancelAllOrders(balanceManagerId);
    const cancelResult = await executeTransaction(client, keypair, cancelTx);
    if (cancelResult.success) {
      console.log(`[${timestamp()}] Cancel succeeded, placing ${orders.length} orders...`);
      await new Promise((r) => setTimeout(r, 1000));
      const placeTx = buildPlaceOrders(balanceManagerId, orders, state);
      result = await executeTransaction(client, keypair, placeTx);
      if (result.success) {
        console.log(`[${timestamp()}] Split cancel+place succeeded`);
      }
    } else {
      console.log(`[${timestamp()}] Cancel failed: ${cancelResult.error}`);
    }
  }

  if (result.success) {
    console.log(`[${timestamp()}] Placed ${orders.length} orders (tx: ${result.digest?.slice(0, 10)}...)`);
  }

  return result;
}
