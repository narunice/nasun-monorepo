/**
 * Typed action payload decoders for the initial public action_type registry.
 *
 * Plan A scope implements only `trade.swap.v1`. The remaining three types
 * (`analysis.v1`, `noop.v1`, `executor.fee.v1`) have their payload BCS
 * schemas defined here for reference, but the dispatcher returns raw bytes
 * until Plan C/E wires in production usage.
 *
 * Spec: `apps/baram/docs/AER_V2_CODEC.md` §7.
 */

import { bcs } from '@mysten/sui/bcs';

import { AERCodecError } from './codec';

// ===== trade.swap.v1 (typed) =====

export const TradeSwapV1Payload = bcs.struct('TradeSwapV1Payload', {
  pool_id: bcs.Address,
  direction: bcs.u8(), // 1=buy, 2=sell
  input_amount: bcs.u64(),
  min_output_amount: bcs.u64(),
  max_slippage_bps: bcs.u16(),
  deadline_ms: bcs.u64(),
});

export type TradeSwapDirection = 'buy' | 'sell';

export interface TradeSwapV1 {
  poolId: string;
  direction: TradeSwapDirection;
  inputAmount: bigint;
  minOutputAmount: bigint;
  maxSlippageBps: number;
  deadlineMs: bigint;
}

export function decodeTradeSwapV1(payloadBytes: Uint8Array): TradeSwapV1 {
  const raw = TradeSwapV1Payload.parse(payloadBytes);
  let direction: TradeSwapDirection;
  if (raw.direction === 1) {
    direction = 'buy';
  } else if (raw.direction === 2) {
    direction = 'sell';
  } else {
    throw new AERCodecError(
      `invalid trade.swap.v1 direction tag: ${raw.direction} (expected 1=buy or 2=sell)`,
      'AER_INVALID_TRADE_SWAP_DIRECTION',
    );
  }
  return {
    poolId: raw.pool_id,
    direction,
    inputAmount: BigInt(raw.input_amount),
    minOutputAmount: BigInt(raw.min_output_amount),
    maxSlippageBps: raw.max_slippage_bps,
    deadlineMs: BigInt(raw.deadline_ms),
  };
}

export function encodeTradeSwapV1(payload: TradeSwapV1): Uint8Array {
  return TradeSwapV1Payload.serialize({
    pool_id: payload.poolId,
    direction: payload.direction === 'buy' ? 1 : 2,
    input_amount: payload.inputAmount.toString(),
    min_output_amount: payload.minOutputAmount.toString(),
    max_slippage_bps: payload.maxSlippageBps,
    deadline_ms: payload.deadlineMs.toString(),
  }).toBytes();
}

// ===== Dispatcher =====

export type DecodedPayload =
  | { kind: 'trade.swap.v1'; value: TradeSwapV1 }
  | { kind: 'raw'; actionType: string; bytes: Uint8Array };

/**
 * Decode an action payload by action_type. Unknown types are returned as
 * `{ kind: 'raw' }` so callers can still inspect bytes. Plan A only
 * implements `trade.swap.v1`; subsequent plans add the other three from
 * §7 of AER_V2_CODEC.md.
 */
export function decodeActionPayload(actionType: string, payloadBytes: Uint8Array): DecodedPayload {
  switch (actionType) {
    case 'trade.swap.v1':
      return { kind: 'trade.swap.v1', value: decodeTradeSwapV1(payloadBytes) };
    default:
      // analysis.v1 / noop.v1 / executor.fee.v1 fall through to raw until
      // Plan C/E wires them up. This is the forward-compat default.
      return { kind: 'raw', actionType, bytes: payloadBytes };
  }
}
