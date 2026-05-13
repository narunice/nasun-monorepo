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

import type { ActionCallSpec } from './sui-client.js';

const CLOCK_OBJECT_ID = '0x6';

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

export type SwapDirection = 'BUY' | 'SELL';

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
