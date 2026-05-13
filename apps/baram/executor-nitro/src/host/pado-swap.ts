/**
 * Pado DeepBookV3 swap adapter (Plan C C3-v2 §4.4, OV5).
 *
 * Builds the trader's `ActionCallSpec` for a Pado pool swap. The host's
 * PTB builder wires the two pipe sentinels (`withdraw_coin`, `zero_deep`)
 * to the upstream `escrow::withdraw_for_action` and inline
 * `coin::zero<DEEP>` returns, and consumes the 3-coin swap output via
 * `settle_action` + `deposit_swap_leftover` + `destroy_zero`.
 *
 * Pool / DEEP whitelist invariants (verified against compiled
 * apps/pado/deepbookv3/sources/pool.move 2026-05-13):
 *   - `swap_exact_base_for_quote<Base, Quote>(self, base_in, deep_in,
 *      min_quote_out, clock, ctx) -> (Coin<Base>, Coin<Quote>, Coin<DEEP>)`
 *   - `swap_exact_quote_for_base<Base, Quote>(self, quote_in, deep_in,
 *      min_base_out, clock, ctx) -> (Coin<Base>, Coin<Quote>, Coin<DEEP>)`
 *   - Type args are `<BaseAsset, QuoteAsset>` (fixed order).
 *   - Nasun devnet Pado pools are DEEP-whitelisted; `coin::zero<DEEP>`
 *     is accepted as fee. Leftover DEEP is guaranteed zero.
 *   - The smoke runbook (S14) re-verifies the leftover-zero assumption
 *     against the live pool.
 */

import { Transaction } from '@mysten/sui/transactions';
import type { SuiClient } from '@mysten/sui/client';
import type { ActionCallSpec } from './sui-client.js';
import type { SwapDirection } from './action-classes.js';

export type { SwapDirection } from './action-classes.js';

const CLOCK_OBJECT_ID = '0x6';

/** Dummy sender for devInspect quote calls (`pool::get_quantity_out` is a
 *  pure view; no real signer required). */
const DEV_INSPECT_SENDER =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

export interface PadoSwapConfig {
  /** DeepBookV3 package id (e.g., `0xb4a1...`). */
  deepbookPackageId: string;
  /** Shared Pool<Base, Quote> object id. */
  poolId: string;
  /** Fully-qualified Move TypeName for the base asset (e.g., NBTC). */
  baseType: string;
  /** Fully-qualified Move TypeName for the quote asset (e.g., NUSDC). */
  quoteType: string;
  /** Fully-qualified Move TypeName for DEEP (e.g.,
   *  `0x71afcf8e...::deep::DEEP`). */
  deepType: string;
}

/**
 * Resolve a PadoSwapConfig from environment variables. Throws if any
 * required env var is unset; refuses to silently accept missing config
 * (no defaults — host operator must intentionally configure each pool).
 */
export function loadPadoSwapConfigFromEnv(): PadoSwapConfig {
  const requiredEnv = (k: string): string => {
    const v = process.env[k];
    if (!v || v.trim() === '') {
      throw new Error(`pado-swap: env var "${k}" is required and unset`);
    }
    return v;
  };
  return {
    deepbookPackageId: requiredEnv('PADO_DEEPBOOK_PACKAGE_ID'),
    poolId: requiredEnv('PADO_NBTC_NUSDC_POOL'),
    baseType: requiredEnv('NBTC_TYPE'),
    quoteType: requiredEnv('NUSDC_TYPE'),
    deepType: requiredEnv('PADO_DEEP_TYPE'),
  };
}

/**
 * Build a swap ActionCallSpec for the host PTB builder.
 *
 * direction:
 *   - BUY  → spend quote (NUSDC), receive base (NBTC) via
 *            `swap_exact_quote_for_base<Base, Quote>`.
 *   - SELL → spend base (NBTC), receive quote (NUSDC) via
 *            `swap_exact_base_for_quote<Base, Quote>`.
 *
 * `amountRaw` is informational here (used by the upstream
 * `escrow::withdraw_for_action` Cmd 0 — host wires its `amount` arg
 * separately); pado-swap doesn't embed it as a positional arg because
 * the actual `Coin<T>` is plumbed via the `withdraw_coin` pipe.
 *
 * `minOut` is the slippage guard. Caller computes via `quoteMinOut`
 * against a recent mid price.
 */
export function buildSwapActionCall(args: {
  config: PadoSwapConfig;
  direction: SwapDirection;
  minOut: bigint;
}): ActionCallSpec {
  const { config, direction, minOut } = args;
  if (minOut < 0n) {
    throw new Error('pado-swap: minOut must be >= 0');
  }
  const fn =
    direction === 'BUY' ? 'swap_exact_quote_for_base' : 'swap_exact_base_for_quote';
  // Args mirror the Move signature exactly:
  //   (self, in_coin, deep_in, min_out, clock, ctx)
  //   ^arg0 ^arg1     ^arg2    ^arg3    ^arg4   ^auto
  return {
    targetPackage: config.deepbookPackageId,
    module: 'pool',
    fn,
    typeArguments: [config.baseType, config.quoteType],
    args: [
      { kind: 'object', id: config.poolId },
      { kind: 'pipe', from: 'withdraw_coin' },
      { kind: 'pipe', from: 'zero_deep' },
      { kind: 'pure', bytes: bcsU64(minOut) },
      { kind: 'object', id: CLOCK_OBJECT_ID },
    ],
  };
}

/**
 * Compute `minOut` from a mid price + slippage bps.
 *
 * sizeInRaw: amount of the INPUT coin in raw units.
 * midPriceRatio: NUMERATOR per DENOMINATOR. We avoid floats; caller
 *   passes the price as two bigints so we can do integer math.
 *   For NBTC/NUSDC with NBTC=base (8 dec) and NUSDC=quote (6 dec):
 *     price = 1 NBTC -> X NUSDC.
 *     For BUY (sizeInRaw is NUSDC): outBase = sizeInRaw * priceDen / priceNum
 *     For SELL (sizeInRaw is NBTC): outQuote = sizeInRaw * priceNum / priceDen
 * slippageBps: e.g., 100 = 1.0%.
 */
export function quoteMinOut(args: {
  direction: SwapDirection;
  sizeInRaw: bigint;
  priceNum: bigint;
  priceDen: bigint;
  slippageBps: number;
}): bigint {
  const { direction, sizeInRaw, priceNum, priceDen, slippageBps } = args;
  if (priceNum <= 0n || priceDen <= 0n) {
    throw new Error('pado-swap: priceNum/priceDen must be > 0');
  }
  if (slippageBps < 0 || slippageBps > 10_000) {
    throw new Error('pado-swap: slippageBps must be in [0, 10000]');
  }
  const expected =
    direction === 'BUY'
      ? (sizeInRaw * priceDen) / priceNum
      : (sizeInRaw * priceNum) / priceDen;
  // (10_000 - slippageBps) / 10_000 in integer math
  const tolerated = (expected * BigInt(10_000 - slippageBps)) / 10_000n;
  return tolerated;
}

/**
 * BCS-encode a u64 as little-endian 8 bytes. Inlined here so this
 * module doesn't pull in `@mysten/sui/bcs` for a one-byte primitive.
 */
function bcsU64(v: bigint): Uint8Array {
  if (v < 0n || v > 0xffff_ffff_ffff_ffffn) {
    throw new Error('pado-swap: u64 out of range');
  }
  const out = new Uint8Array(8);
  let x = v;
  for (let i = 0; i < 8; i++) {
    out[i] = Number(x & 0xffn);
    x >>= 8n;
  }
  return out;
}

/**
 * Decode an 8-byte LE u64 produced by `bcsU64`. Used by the server to
 * re-read the trader-supplied `min_out` pure arg before comparing it
 * against the on-chain slippage floor.
 */
export function decodeU64LE(bytes: Uint8Array): bigint {
  if (bytes.length !== 8) {
    throw new Error(`pado-swap: u64 LE expects 8 bytes, got ${bytes.length}`);
  }
  let v = 0n;
  for (let i = 0; i < 8; i++) {
    v |= BigInt(bytes[i]) << BigInt(i * 8);
  }
  return v;
}

/**
 * Apply slippage tolerance to an on-chain-quoted expected output.
 *   floor = floor(expected * (10_000 - slippageBps) / 10_000)
 *
 * Trader-supplied `min_out` below this floor would mean the swap is
 * willing to absorb worse-than-cap slippage; the server rejects.
 */
export function applySlippageFloor(expected: bigint, slippageBps: number): bigint {
  if (expected < 0n) {
    throw new Error('pado-swap: expected must be >= 0');
  }
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 10_000) {
    throw new Error('pado-swap: slippageBps must be in [0, 10000]');
  }
  return (expected * BigInt(10_000 - slippageBps)) / 10_000n;
}

/**
 * Quote the expected output of a swap of `sizeInRaw` units of the input
 * asset against the live pool via `pool::get_quantity_out` devInspect.
 *
 * BUY (input=quote): calls `get_quantity_out(0, sizeInRaw, clock)` and
 * returns the `base_quantity_out` field.
 * SELL (input=base): calls `get_quantity_out(sizeInRaw, 0, clock)` and
 * returns the `quote_quantity_out` field.
 *
 * The 3-tuple return is `(base_out, quote_out, deep_required)` per the
 * Move signature at apps/pado/deepbookv3/.../pool.move:1180.
 *
 * Throws on devInspect failure (transport, pool-not-found, malformed
 * return). Callers should treat this as a fail-closed signal: refuse
 * the swap rather than fall back to the trader-supplied `min_out`.
 */
export async function quoteExpectedOutput(args: {
  client: SuiClient;
  config: PadoSwapConfig;
  direction: SwapDirection;
  sizeInRaw: bigint;
}): Promise<bigint> {
  const { client, config, direction, sizeInRaw } = args;
  if (sizeInRaw <= 0n) {
    throw new Error('pado-swap: quote sizeInRaw must be > 0');
  }
  const baseQuantity = direction === 'SELL' ? sizeInRaw : 0n;
  const quoteQuantity = direction === 'BUY' ? sizeInRaw : 0n;

  const tx = new Transaction();
  tx.moveCall({
    target: `${config.deepbookPackageId}::pool::get_quantity_out`,
    typeArguments: [config.baseType, config.quoteType],
    arguments: [
      tx.object(config.poolId),
      tx.pure.u64(baseQuantity),
      tx.pure.u64(quoteQuantity),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });

  const result = await client.devInspectTransactionBlock({
    sender: DEV_INSPECT_SENDER,
    transactionBlock: tx,
  });

  const status = result.effects?.status?.status;
  if (status !== 'success') {
    throw new Error(
      `pado-swap: get_quantity_out devInspect failed: ${result.effects?.status?.error ?? 'unknown'}`,
    );
  }
  const returnValues = result.results?.[0]?.returnValues;
  if (!returnValues || returnValues.length < 3) {
    throw new Error('pado-swap: get_quantity_out returned fewer than 3 values');
  }
  // Each return is [byteArray, typeName]. u64 = 8 LE bytes.
  const decode = (idx: number): bigint => {
    const entry = returnValues[idx];
    const raw = entry?.[0];
    if (!raw || raw.length !== 8) {
      throw new Error(
        `pado-swap: get_quantity_out[${idx}] expected 8-byte u64, got ${raw?.length}`,
      );
    }
    return decodeU64LE(Uint8Array.from(raw));
  };
  const baseOut = decode(0);
  const quoteOut = decode(1);
  return direction === 'BUY' ? baseOut : quoteOut;
}
