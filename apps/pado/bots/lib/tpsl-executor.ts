/**
 * TP/SL Trade Executor
 *
 * Executes market orders using delegated TradeCap.
 * Flow: TradeCap → trade_proof → place_market_order
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const DEEPBOOK_PACKAGE = process.env.DEEPBOOK_PACKAGE || '';
const CLOCK_ID = '0x6';

export interface ExecuteParams {
  poolId: string;
  baseType: string;
  quoteType: string;
  tradeCapId: string;
  balanceManagerId: string;
  isBid: boolean;
  quantity: bigint;
}

export interface ExecuteResult {
  success: boolean;
  txDigest?: string;
  error?: string;
}

/**
 * Execute a market order via delegated TradeCap
 *
 * PTB flow:
 * 1. pool::trade_proof(pool, tradeCap) → TradeProof
 * 2. pool::place_market_order(pool, balanceManager, tradeProof, clientOrderId, isBid, quantity, clock)
 */
export async function executeMarketOrder(
  client: SuiClient,
  keypair: Ed25519Keypair,
  params: ExecuteParams,
): Promise<ExecuteResult> {
  try {
    const tx = new Transaction();

    // Step 1: Generate trade proof from TradeCap
    const [tradeProof] = tx.moveCall({
      target: `${DEEPBOOK_PACKAGE}::pool::trade_proof`,
      typeArguments: [params.baseType, params.quoteType],
      arguments: [
        tx.object(params.poolId),
        tx.object(params.tradeCapId),
      ],
    });

    // Step 2: Place market order using trade proof
    // client_order_id: use timestamp for uniqueness
    const clientOrderId = BigInt(Date.now());

    tx.moveCall({
      target: `${DEEPBOOK_PACKAGE}::pool::place_market_order`,
      typeArguments: [params.baseType, params.quoteType],
      arguments: [
        tx.object(params.poolId),
        tx.object(params.balanceManagerId),
        tradeProof,
        tx.pure.u64(clientOrderId),
        tx.pure.bool(params.isBid),
        tx.pure.u64(params.quantity),
        tx.object(CLOCK_ID),
      ],
    });

    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: { showEffects: true },
    });

    if (result.effects?.status?.status !== 'success') {
      return {
        success: false,
        error: `TX failed: ${result.effects?.status?.error || 'unknown'}`,
      };
    }

    return {
      success: true,
      txDigest: result.digest,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
