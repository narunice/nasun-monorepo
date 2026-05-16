// usePadoSpotOrdersSummary
//
// Cross-app read of the user's open Pado spot orders. Returns just the two
// summary numbers the dashboard card needs (total open count + total NUSDC
// locked across bid orders). Talks to Sui RPC directly so we don't drag
// Pado's MarketContext / BalanceManager provider into nasun-website.
//
// BalanceManager discovery is handled by usePadoBalanceManagers (shared
// with usePadoBalanceSummary) — see that file for the long-form rationale
// on event sweeping + bidirectional walks.
//
// Locked NUSDC is summed only over bid orders: bids lock quote (NUSDC) at
// price * quantity, asks lock base (NBTC/NETH/NSOL) which would need a
// spot-price oracle to render in dollars. Asks still count toward the open
// count so the user sees their full activity surface. The notional is
// accumulated as a `bigint` in NUSDC raw units (10^6) to keep cent-level
// precision under accumulation, matching the prediction hook's pattern.
//
// TP/SL is intentionally not counted here. Pado's TP/SL is a conditional
// order monitored by an off-chain keeper bot (see apps/pado/bots/tpsl-
// keeper.ts); the user-facing record lives in pado.finance localStorage or
// the keeper's REST store, neither of which nasun-website can read
// faithfully. Pado's UI also keeps TP/SL on a separate panel from open spot
// orders, so excluding it here matches Pado's own semantic split.
// Re-evaluate once TP/SL gains a canonical on-chain record.

import { useQuery } from "@tanstack/react-query";
import { useSuiClient } from "@mysten/dapp-kit";
import { DEEPBOOK_PACKAGE_ID } from "@nasun/devnet-config";
import { Transaction } from "@mysten/sui/transactions";
import type { SuiClient } from "@mysten/sui/client";
import { PADO_SPOT_POOLS, type PadoSpotPool } from "./padoSpotConfig";
import { usePadoBalanceManagers } from "./usePadoBalanceManagers";

const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
// Each Order in the BCS-encoded vector is exactly 99 bytes — see
// apps/pado/frontend/src/lib/deepbook.ts L705-L716 for the layout.
const ORDER_BYTES = 99;
const MAX_ULEB128_BYTES = 5;

interface ParsedOrder {
  isBid: boolean;
  // For bid orders, NUSDC locked in raw units (10^6). Always 0 for asks
  // since we don't render their dollar notional without a price oracle.
  // Carried as `bigint` so the parent can sum across pools and addresses
  // without losing cent precision to float drift.
  bidLockedNusdcRaw: bigint;
}

function readUleb128(
  bytes: number[],
  startOffset: number,
): { value: number; bytesRead: number } {
  let value = 0;
  let shift = 0;
  let bytesRead = 0;
  let offset = startOffset;
  while (offset < bytes.length && bytesRead < MAX_ULEB128_BYTES) {
    const byte = bytes[offset++];
    bytesRead++;
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value, bytesRead };
    shift += 7;
  }
  return { value, bytesRead };
}

function parseOrderVector(
  bytes: number[],
  baseDecimals: number,
): ParsedOrder[] {
  if (!bytes || bytes.length === 0) return [];
  const orders: ParsedOrder[] = [];
  const { value: length, bytesRead } = readUleb128(bytes, 0);
  let offset = bytesRead;
  // For bid notional: notional_quote_raw = price_raw * qty_raw / 10^baseDecimals.
  // Quote is always NUSDC across the pools we cover, so the result is in
  // NUSDC raw (10^6).
  const baseScale = BigInt(10 ** baseDecimals);

  for (let i = 0; i < length && offset + ORDER_BYTES <= bytes.length; i++) {
    // Skip balance_manager_id (32 bytes ID).
    offset += 32;

    // order_id is u128: top bit (127) is is_ask flag, bits 64-126 carry price.
    let orderId = 0n;
    for (let j = 0; j < 16; j++) {
      orderId |= BigInt(bytes[offset + j]) << BigInt(j * 8);
    }
    offset += 16;
    const isBid = (orderId >> 127n) === 0n;
    const rawPrice = (orderId >> 64n) & ((1n << 63n) - 1n);

    // Skip client_order_id (8).
    offset += 8;

    // quantity: u64, little-endian.
    let rawQuantity = 0n;
    for (let j = 0; j < 8; j++) {
      rawQuantity |= BigInt(bytes[offset + j]) << BigInt(j * 8);
    }
    offset += 8;

    // Skip filled_quantity (8) + fee_is_deep (1) + order_deep_price (9) +
    // epoch (8) + status (1) + expire_timestamp (8).
    offset += 35;

    if (rawQuantity > 0n) {
      const bidLockedNusdcRaw = isBid ? (rawPrice * rawQuantity) / baseScale : 0n;
      orders.push({ isBid, bidLockedNusdcRaw });
    }
  }
  return orders;
}

async function fetchOpenOrders(
  client: SuiClient,
  pool: PadoSpotPool,
  balanceManagerId: string,
): Promise<ParsedOrder[]> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${DEEPBOOK_PACKAGE_ID}::pool::get_account_order_details`,
    typeArguments: [pool.baseType, pool.quoteType],
    arguments: [tx.object(pool.id), tx.object(balanceManagerId)],
  });
  const result = await client.devInspectTransactionBlock({
    sender: ZERO_ADDRESS,
    transactionBlock: tx,
  });
  // The expected "no orders here" path: devInspect succeeds but the BM has
  // never traded this pair, so deepbook returns an explicit error in
  // `result.error` rather than throwing. Treat that as zero orders. Real
  // transport / parse failures still bubble up so they can be surfaced to
  // the user as an error rather than a misleading "None open".
  if (result.error) return [];
  const returnValues = result.results?.[0]?.returnValues;
  if (!returnValues || returnValues.length === 0) return [];
  return parseOrderVector(returnValues[0][0], pool.baseDecimals);
}

export interface PadoSpotOrdersSummary {
  count: number;
  // Sum of bid-side `price * quantity` across every BM, pool, and address,
  // in NUSDC raw units (10^6). Quote is always NUSDC across the pools we
  // cover, so this is directly renderable via formatNusdcAsUsd.
  bidLockedNusdcRaw: bigint;
  // True when at least one address's BM event sweep hit MAX_EVENT_PAGES on
  // both directions without converging — a middle window of history is
  // unscanned and may hide additional BMs. The card uses this to surface a
  // "+" suffix and steer the user to Pado for the authoritative list.
  partial: boolean;
  isLoading: boolean;
}

export function usePadoSpotOrdersSummary(): PadoSpotOrdersSummary {
  const suiClient = useSuiClient();
  const bm = usePadoBalanceManagers();

  const bmKey = bm.bmIds.join(",");

  const { data, isLoading } = useQuery({
    queryKey: ["pado-spot-orders-summary", bmKey],
    enabled: !bm.isLoading,
    // Dashboard summary only — we do not need single-trade latency. Pado's
    // own UI is faster (10s) for users actively managing orders.
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async (): Promise<{
      count: number;
      bidLockedNusdcRaw: bigint;
    }> => {
      if (bm.bmIds.length === 0)
        return { count: 0, bidLockedNusdcRaw: 0n };

      // Fan out devInspect across (BM, pool) pairs.
      const requests: Promise<ParsedOrder[]>[] = [];
      for (const bmId of bm.bmIds) {
        for (const pool of PADO_SPOT_POOLS) {
          requests.push(fetchOpenOrders(suiClient, pool, bmId));
        }
      }
      const results = await Promise.all(requests);

      let count = 0;
      let bidLockedNusdcRaw = 0n;
      for (const orders of results) {
        for (const order of orders) {
          count += 1;
          bidLockedNusdcRaw += order.bidLockedNusdcRaw;
        }
      }
      return { count, bidLockedNusdcRaw };
    },
  });

  return {
    count: data?.count ?? 0,
    bidLockedNusdcRaw: data?.bidLockedNusdcRaw ?? 0n,
    partial: bm.partial,
    isLoading: bm.isLoading || isLoading,
  };
}
