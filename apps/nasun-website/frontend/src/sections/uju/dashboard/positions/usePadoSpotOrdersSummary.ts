// usePadoSpotOrdersSummary
//
// Cross-app read of the user's open Pado spot orders. Returns just the two
// summary numbers the dashboard card needs (total open count + total NUSDC
// locked across bid orders). Talks to Sui RPC directly so we don't drag
// Pado's MarketContext / BalanceManager provider into nasun-website.
//
// BalanceManager discovery: Pado mints a BalanceManager and immediately
// shares it with `transfer::public_share_object` (apps/pado/frontend/src/
// lib/unified-margin.ts ~L340). Shared objects don't appear under
// `getOwnedObjects`, and Pado's localStorage cache of the BM ID is scoped
// to the pado.finance origin and so unreachable from nasun.io. The only
// portable on-chain handle is the creation event: `balance_manager::new`
// emits BalanceManagerEvent with `balance_manager_id` and the creator's
// address. We sweep the user's events with a Sender filter (the devnet
// RPC rejects compound `{ All: [...] }` filters with "Invalid params") and
// post-filter by event type. Active traders accumulate many BMs spaced
// across thousands of events, so we walk both ends of the history in
// parallel and union the results — ascending catches the wallet's first
// (often primary, balance-holding) BMs, descending catches the most
// recent ones.
//
// Multi-wallet: nasun-website lets a user register additional Sui wallets
// alongside their primary signer. We fan out across the union of (signer
// address, registered wallet addresses) so a user trading from a wallet
// other than their current login still sees their full order surface.
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

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSuiClient } from "@mysten/dapp-kit";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { DEEPBOOK_PACKAGE_ID } from "@nasun/devnet-config";
import { Transaction } from "@mysten/sui/transactions";
import type { SuiClient } from "@mysten/sui/client";
import { PADO_SPOT_POOLS, type PadoSpotPool } from "./padoSpotConfig";
import { useUjuWalletRegistration } from "../../hooks/useUjuWalletRegistration";

const BM_EVENT_TYPE = `${DEEPBOOK_PACKAGE_ID}::balance_manager::BalanceManagerEvent`;
const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
// Each Order in the BCS-encoded vector is exactly 99 bytes — see
// apps/pado/frontend/src/lib/deepbook.ts L705-L716 for the layout.
const ORDER_BYTES = 99;
const MAX_ULEB128_BYTES = 5;
// Worst case ~5,000 events scanned per refetch per address (50 pages * 50
// events * two directions). Heavy traders need this depth to surface their
// primary BM; lighter wallets short-circuit on the first response with no
// next page.
const MAX_EVENT_PAGES = 50;

interface ParsedOrder {
  isBid: boolean;
  // For bid orders, NUSDC locked in raw units (10^6). Always 0 for asks
  // since we don't render their dollar notional without a price oracle.
  // Carried as `bigint` so the parent can sum across pools and addresses
  // without losing cent precision to float drift.
  bidLockedNusdcRaw: bigint;
}

interface BalanceManagerEventPayload {
  balance_manager_id?: string;
  owner?: string;
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

async function sweepBmEventsOneDirection(
  client: SuiClient,
  owner: string,
  order: "ascending" | "descending",
): Promise<string[]> {
  const ids: string[] = [];
  let cursor: { txDigest: string; eventSeq: string } | null | undefined = undefined;
  for (let page = 0; page < MAX_EVENT_PAGES; page++) {
    const response = await client.queryEvents({
      query: { Sender: owner },
      cursor,
      limit: 50,
      order,
    });
    for (const event of response.data) {
      if (event.type !== BM_EVENT_TYPE) continue;
      const json = event.parsedJson as BalanceManagerEventPayload | undefined;
      const id = json?.balance_manager_id;
      if (id && (!json?.owner || json.owner === owner)) {
        ids.push(id);
      }
    }
    if (!response.hasNextPage || !response.nextCursor) break;
    cursor = response.nextCursor;
  }
  return ids;
}

async function findBalanceManagerIds(
  client: SuiClient,
  owner: string,
): Promise<string[]> {
  const [asc, desc] = await Promise.all([
    sweepBmEventsOneDirection(client, owner, "ascending"),
    sweepBmEventsOneDirection(client, owner, "descending"),
  ]);
  return Array.from(new Set([...asc, ...desc]));
}

export interface PadoSpotOrdersSummary {
  count: number;
  // Sum of bid-side `price * quantity` across every BM, pool, and address,
  // in NUSDC raw units (10^6). Quote is always NUSDC across the pools we
  // cover, so this is directly renderable via formatNusdcAsUsd.
  bidLockedNusdcRaw: bigint;
  isLoading: boolean;
}

export function usePadoSpotOrdersSummary(): PadoSpotOrdersSummary {
  const suiClient = useSuiClient();
  const { status, account } = useWallet();
  const { isConnected: isZkConnected, state: zkState } = useZkLogin();
  const walletReg = useUjuWalletRegistration();

  const signerAddress = isZkConnected
    ? zkState?.address
    : status === "unlocked"
      ? account?.address
      : undefined;

  // Same pattern as the prediction hook: dedup, sort for stable queryKey.
  const allAddresses = useMemo(() => {
    const set = new Set<string>();
    if (signerAddress) set.add(signerAddress);
    for (const w of walletReg.registeredWallets) {
      if (w.walletAddress) set.add(w.walletAddress);
    }
    return Array.from(set).sort();
  }, [signerAddress, walletReg.registeredWallets]);

  const addressesKey = allAddresses.join(",");

  const { data, isLoading } = useQuery({
    queryKey: ["pado-spot-orders-summary", addressesKey],
    enabled: allAddresses.length > 0,
    // Dashboard summary only — we do not need single-trade latency. Pado's
    // own UI is faster (10s) for users actively managing orders.
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async (): Promise<{ count: number; bidLockedNusdcRaw: bigint }> => {
      if (allAddresses.length === 0) return { count: 0, bidLockedNusdcRaw: 0n };

      // Fan out BM lookup across every address in parallel. Each address's
      // sweep is internally bidirectional and capped at MAX_EVENT_PAGES.
      const bmIdsPerAddress = await Promise.all(
        allAddresses.map((addr) => findBalanceManagerIds(suiClient, addr)),
      );
      const bmIds = Array.from(new Set(bmIdsPerAddress.flat()));
      if (bmIds.length === 0) return { count: 0, bidLockedNusdcRaw: 0n };

      // Then fan out devInspect across (BM, pool) pairs.
      const requests: Promise<ParsedOrder[]>[] = [];
      for (const bmId of bmIds) {
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
    isLoading,
  };
}
