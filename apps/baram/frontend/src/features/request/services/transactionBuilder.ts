/**
 * Transaction builder for Baram requests
 */

import { Transaction } from '@mysten/sui/transactions';
import { BARAM_CONFIG } from '@/config/network';
import type { CoinRef } from './coinService';

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
      tx.object('0x6'), // Clock
    ],
  });

  return tx;
}
