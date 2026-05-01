/**
 * TP/SL Trade Executor
 *
 * Executes market orders using delegated TradeCap.
 * Flow: TradeCap → generate_proof_as_trader → place_market_order
 */

import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const DEEPBOOK_PACKAGE = process.env.DEEPBOOK_PACKAGE || '';
const CLOCK_ID = '0x6';

// DeepBook V3 self-matching option: cancel taker side
const SELF_MATCHING_CANCEL_TAKER = 0;

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
 * 1. balance_manager::generate_proof_as_trader(balanceManager, tradeCap) → TradeProof
 * 2. pool::place_market_order(pool, balanceManager, tradeProof, clientOrderId, selfMatchingOption, quantity, isBid, payWithDeep, clock)
 */
export async function executeMarketOrder(
  client: SuiClient,
  keypair: Ed25519Keypair,
  params: ExecuteParams,
): Promise<ExecuteResult> {
  try {
    const tx = new Transaction();
    // Single market_order — bounded gas, refunded if unused.
    tx.setGasBudget(200_000_000n);

    // Step 1: Generate trade proof from TradeCap (delegated trader proof)
    const [tradeProof] = tx.moveCall({
      target: `${DEEPBOOK_PACKAGE}::balance_manager::generate_proof_as_trader`,
      arguments: [
        tx.object(params.balanceManagerId),
        tx.object(params.tradeCapId),
      ],
    });

    // Step 2: Place market order using trade proof
    const clientOrderId = BigInt(Date.now());

    tx.moveCall({
      target: `${DEEPBOOK_PACKAGE}::pool::place_market_order`,
      typeArguments: [params.baseType, params.quoteType],
      arguments: [
        tx.object(params.poolId),
        tx.object(params.balanceManagerId),
        tradeProof,
        tx.pure.u64(clientOrderId),
        tx.pure.u8(SELF_MATCHING_CANCEL_TAKER),
        tx.pure.u64(params.quantity),
        tx.pure.bool(params.isBid),
        tx.pure.bool(false), // pay_with_deep = false
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

    // Wait for indexing so the next executeMarketOrder builds against the
    // post-effects BalanceManager version (avoids "not available for
    // consumption" on back-to-back TP/SL executions in the same tick).
    try {
      await client.waitForTransaction({ digest: result.digest, timeout: 10_000 });
    } catch {
      // Best-effort
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
