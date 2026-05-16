// usePadoBalanceSummary
//
// "Capital row" for the Pado dashboard card: how much USD the user has
// parked inside Pado right now. Sums two on-chain sources, both denominated
// in NUSDC raw (10^6):
//
//   1. BalanceManager NUSDC balance (per BM, dedup'd across pools — same BM
//      holds the same NUSDC across every pool it trades in)
//   2. MarginAccount nusdc_balance (per wallet, one MarginAccount per wallet)
//
// Scope intentionally NUSDC-only for v1: Pado BMs can also hold base tokens
// (NBTC/NETH/NSOL) and MarginAccount carries an nbtc_balance, but nasun-
// website has no price oracle on hand to convert those to USD without
// dragging Pado's prices.ts into the bundle. Quote-side already covers the
// "capital sitting in Pado" question for the vast majority of users who
// deposit USDC. Track base-token USD as v2 once a shared oracle exists.
//
// BM IDs come from usePadoBalanceManagers, which is shared with the spot-
// orders summary so the (expensive) event sweep runs once per address set.
// MarginAccount IDs come from getOwnedObjects filtered by type prefix —
// each wallet has at most one MarginAccount, so this is a single page read
// per address.

import { useQuery } from "@tanstack/react-query";
import { useSuiClient } from "@mysten/dapp-kit";
import {
  DEEPBOOK_PACKAGE_ID,
  MARGIN_PACKAGE_ID,
  NUSDC_TYPE,
} from "@nasun/devnet-config";
import { Transaction } from "@mysten/sui/transactions";
import type { SuiClient } from "@mysten/sui/client";
import { usePadoBalanceManagers } from "./usePadoBalanceManagers";

const ZERO_ADDRESS =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
// Module path identifying MarginAccount objects. Match by suffix to remain
// resilient to MarginAccount package upgrades (the package ID will rotate
// but module + struct name stay stable, matching Pado's findUserMarginAccount).
const MARGIN_ACCOUNT_TYPE_SUFFIX = "::unified_margin::MarginAccount";

function parseU64FromBytes(bytes: number[] | undefined): bigint {
  if (!bytes || bytes.length < 8) return 0n;
  let result = 0n;
  for (let i = 0; i < 8; i++) {
    result |= BigInt(bytes[i]) << BigInt(i * 8);
  }
  return result;
}

async function getBmNusdcBalance(
  client: SuiClient,
  bmId: string,
): Promise<bigint> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${DEEPBOOK_PACKAGE_ID}::balance_manager::balance`,
    typeArguments: [NUSDC_TYPE],
    arguments: [tx.object(bmId)],
  });
  const result = await client.devInspectTransactionBlock({
    sender: ZERO_ADDRESS,
    transactionBlock: tx,
  });
  if (result.error) return 0n;
  const bytes = result.results?.[0]?.returnValues?.[0]?.[0];
  return parseU64FromBytes(bytes);
}

interface MarginAccountFields {
  nusdc_balance?: unknown;
}

function parseBalanceField(raw: unknown): bigint {
  if (raw == null) return 0n;
  if (typeof raw === "string" || typeof raw === "number") {
    try {
      return BigInt(raw);
    } catch {
      return 0n;
    }
  }
  if (typeof raw === "object") {
    const obj = raw as { value?: unknown; fields?: { value?: unknown } };
    const candidate = obj.fields?.value ?? obj.value;
    if (candidate != null) {
      try {
        return BigInt(candidate as string | number);
      } catch {
        return 0n;
      }
    }
  }
  return 0n;
}

async function getMarginAccountNusdcForAddress(
  client: SuiClient,
  address: string,
): Promise<bigint> {
  // One MarginAccount per wallet — first page is enough in practice.
  let cursor: string | null | undefined = undefined;
  let marginAccountId: string | null = null;
  for (let page = 0; page < 5 && !marginAccountId; page++) {
    const response = await client.getOwnedObjects({
      owner: address,
      options: { showType: true },
      cursor,
      limit: 50,
    });
    for (const item of response.data) {
      const type = item.data?.type ?? "";
      if (type.endsWith(MARGIN_ACCOUNT_TYPE_SUFFIX)) {
        marginAccountId = item.data?.objectId ?? null;
        break;
      }
    }
    if (!response.hasNextPage || !response.nextCursor) break;
    cursor = response.nextCursor;
  }
  if (!marginAccountId) return 0n;

  const obj = await client.getObject({
    id: marginAccountId,
    options: { showContent: true },
  });
  const content = obj.data?.content;
  if (!content || content.dataType !== "moveObject") return 0n;
  const fields = content.fields as MarginAccountFields | undefined;
  return parseBalanceField(fields?.nusdc_balance);
}

export interface PadoBalanceSummary {
  // Total NUSDC raw (10^6 units) across BMs + MarginAccounts. Render via
  // formatNusdcAsUsd.
  totalNusdcRaw: bigint;
  bmNusdcRaw: bigint;
  marginNusdcRaw: bigint;
  isLoading: boolean;
}

export function usePadoBalanceSummary(): PadoBalanceSummary {
  const suiClient = useSuiClient();
  const bm = usePadoBalanceManagers();

  // MARGIN_PACKAGE_ID can be unconfigured on chains where unified-margin
  // hasn't been deployed; treat missing as "no margin balance".
  const marginEnabled = !!MARGIN_PACKAGE_ID;

  const bmKey = bm.bmIds.join(",");
  const addrKey = bm.addresses.join(",");

  const { data, isLoading } = useQuery({
    queryKey: ["pado-balance-summary", bmKey, addrKey, marginEnabled],
    enabled: !bm.isLoading && (bm.bmIds.length > 0 || bm.addresses.length > 0),
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async (): Promise<{
      bmNusdcRaw: bigint;
      marginNusdcRaw: bigint;
    }> => {
      const bmPromise = Promise.all(
        bm.bmIds.map((id) => getBmNusdcBalance(suiClient, id)),
      );
      const marginPromise = marginEnabled
        ? Promise.all(
            bm.addresses.map((addr) =>
              getMarginAccountNusdcForAddress(suiClient, addr),
            ),
          )
        : Promise.resolve([] as bigint[]);

      const [bmBalances, marginBalances] = await Promise.all([
        bmPromise,
        marginPromise,
      ]);

      const bmNusdcRaw = bmBalances.reduce((s, b) => s + b, 0n);
      const marginNusdcRaw = marginBalances.reduce((s, b) => s + b, 0n);
      return { bmNusdcRaw, marginNusdcRaw };
    },
  });

  const bmNusdcRaw = data?.bmNusdcRaw ?? 0n;
  const marginNusdcRaw = data?.marginNusdcRaw ?? 0n;

  return {
    totalNusdcRaw: bmNusdcRaw + marginNusdcRaw,
    bmNusdcRaw,
    marginNusdcRaw,
    isLoading: bm.isLoading || isLoading,
  };
}
