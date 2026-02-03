/**
 * Transaction builder for Baram requests
 */

import { Transaction } from '@mysten/sui/transactions';
import type { BaramConfig, BuildRequestParams } from '../types';

/**
 * Build a create_request transaction.
 *
 * @param config - Baram SDK configuration (provides package/registry IDs)
 * @param params - Transaction parameters
 * @returns Transaction object ready for signing
 */
export function buildCreateRequestTransaction(
  config: BaramConfig,
  params: BuildRequestParams,
): Transaction {
  const { coins, promptHashBytes, model, executorOperator, price } = params;
  const tx = new Transaction();

  // If multiple coins, merge them first
  if (coins.length > 1) {
    const [primary, ...rest] = coins;
    tx.mergeCoins(
      tx.object(primary.objectId),
      rest.map(c => tx.object(c.objectId)),
    );
  }

  // Split exact amount for payment
  const [paymentCoin] = tx.splitCoins(
    tx.object(coins[0].objectId),
    [tx.pure.u64(price)],
  );

  // Call create_request with selected executor
  tx.moveCall({
    target: `${config.baram.packageId}::baram::create_request`,
    arguments: [
      tx.object(config.baram.registryId),
      paymentCoin,
      tx.pure.vector('u8', promptHashBytes),
      tx.pure.string(model),
      tx.pure.address(executorOperator),
      tx.object('0x6'), // Clock
    ],
  });

  return tx;
}

/**
 * Build a cancel_request transaction to release escrow funds.
 * Used for auto-cancel when executor fails to respond.
 */
export function buildCancelRequestTransaction(
  config: BaramConfig,
  requestId: number,
): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${config.baram.packageId}::baram::cancel_request`,
    arguments: [
      tx.object(config.baram.registryId),
      tx.pure.u64(requestId),
      tx.object('0x6'), // Clock
    ],
  });
  return tx;
}
