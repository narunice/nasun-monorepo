/**
 * useMarginActivity
 *
 * Aggregates deposit / withdraw events for the user's MarginAccount over an
 * arbitrary time window. Returns USD totals so the UI can show period-filtered
 * activity (All time / 7D / 30D / 90D / specific month).
 *
 * Implementation notes:
 * - Queries on-chain events: NusdcDeposited, NusdcWithdrawn, NbtcDeposited,
 *   NbtcWithdrawn for the user's MarginAccount.
 * - NUSDC amounts are 1:1 USD; NBTC is converted at current price (display
 *   approximation since historical prices are not stored on-chain).
 * - For "All time" callers can prefer the lifetime totals on the account
 *   object which are authoritative for NUSDC (this hook still provides a
 *   filtered view including NBTC).
 */

import { useQuery } from '@tanstack/react-query';
import { getSuiClient } from '../../../lib/sui-client';
import { UNIFIED_MARGIN_PACKAGE } from '../../../lib/unified-margin';
import { TOKENS } from '../../../config/network';
import { getUnifiedPrice } from '../../../lib/prices';

const MODULE = 'unified_margin';
const NUSDC_DEPOSIT_TYPE = `${UNIFIED_MARGIN_PACKAGE}::${MODULE}::NusdcDeposited`;
const NUSDC_WITHDRAW_TYPE = `${UNIFIED_MARGIN_PACKAGE}::${MODULE}::NusdcWithdrawn`;
const NBTC_DEPOSIT_TYPE = `${UNIFIED_MARGIN_PACKAGE}::${MODULE}::NbtcDeposited`;
const NBTC_WITHDRAW_TYPE = `${UNIFIED_MARGIN_PACKAGE}::${MODULE}::NbtcWithdrawn`;

const PAGE_LIMIT = 50;
const MAX_PAGES = 20; // hard cap to keep RPC pressure bounded

interface RawEventJson {
  account_id?: string;
  owner?: string;
  amount?: string;
  new_balance?: string;
}

export interface MarginActivityTotals {
  /** Sum of NUSDC + NBTC deposits in USD over the requested window. */
  depositedUsd: number;
  /** Sum of NUSDC + NBTC withdrawals in USD over the requested window. */
  withdrawnUsd: number;
  /** depositedUsd - withdrawnUsd. */
  netFlowUsd: number;
  /** Whether any events for this account/window exist. */
  hasEvents: boolean;
}

export interface UseMarginActivityOptions {
  /** MarginAccount object id; required to filter events. */
  accountId: string | null;
  /** Inclusive lower bound (ms since epoch). null = no lower bound. */
  fromMs: number | null;
  /** Inclusive upper bound (ms since epoch). null = no upper bound. */
  toMs: number | null;
  /** Skip fetching (e.g. when "All time" delegates to on-chain lifetime totals). */
  enabled?: boolean;
}

interface RawAggregate {
  nusdcDepositRaw: bigint;
  nusdcWithdrawRaw: bigint;
  nbtcDepositRaw: bigint;
  nbtcWithdrawRaw: bigint;
  eventCount: number;
}

async function fetchEventsByType(
  eventType: string,
  accountId: string,
  fromMs: number | null,
  toMs: number | null,
): Promise<{ amount: bigint; isNbtc: boolean }[]> {
  const client = getSuiClient();
  const collected: { amount: bigint; isNbtc: boolean }[] = [];
  const isNbtc = eventType.includes('Nbtc');

  let cursor: { txDigest: string; eventSeq: string } | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await client.queryEvents({
      query: { MoveEventType: eventType },
      cursor: cursor ?? undefined,
      limit: PAGE_LIMIT,
      // descending so we can stop early once we cross fromMs
      order: 'descending',
    });

    let crossedLowerBound = false;
    for (const ev of result.data) {
      const tsStr = ev.timestampMs;
      const ts = tsStr ? Number(tsStr) : 0;
      if (toMs !== null && ts > toMs) continue;
      if (fromMs !== null && ts < fromMs) {
        crossedLowerBound = true;
        continue;
      }
      const json = ev.parsedJson as RawEventJson | undefined;
      if (!json || json.account_id !== accountId) continue;
      const amount = json.amount ? BigInt(json.amount) : 0n;
      if (amount <= 0n) continue;
      collected.push({ amount, isNbtc });
    }

    if (crossedLowerBound || !result.hasNextPage || !result.nextCursor) break;
    cursor = result.nextCursor as { txDigest: string; eventSeq: string };
  }

  return collected;
}

async function fetchAggregate(
  accountId: string,
  fromMs: number | null,
  toMs: number | null,
): Promise<RawAggregate> {
  const [nusdcD, nusdcW, nbtcD, nbtcW] = await Promise.all([
    fetchEventsByType(NUSDC_DEPOSIT_TYPE, accountId, fromMs, toMs),
    fetchEventsByType(NUSDC_WITHDRAW_TYPE, accountId, fromMs, toMs),
    fetchEventsByType(NBTC_DEPOSIT_TYPE, accountId, fromMs, toMs),
    fetchEventsByType(NBTC_WITHDRAW_TYPE, accountId, fromMs, toMs),
  ]);

  const sum = (xs: { amount: bigint }[]) =>
    xs.reduce((acc, x) => acc + x.amount, 0n);

  return {
    nusdcDepositRaw: sum(nusdcD),
    nusdcWithdrawRaw: sum(nusdcW),
    nbtcDepositRaw: sum(nbtcD),
    nbtcWithdrawRaw: sum(nbtcW),
    eventCount: nusdcD.length + nusdcW.length + nbtcD.length + nbtcW.length,
  };
}

function rawToUsd(agg: RawAggregate): MarginActivityTotals {
  const nbtcPrice = getUnifiedPrice('NBTC');

  const nusdcDepositUsd = Number(agg.nusdcDepositRaw) / Math.pow(10, TOKENS.NUSDC.decimals);
  const nusdcWithdrawUsd = Number(agg.nusdcWithdrawRaw) / Math.pow(10, TOKENS.NUSDC.decimals);
  const nbtcDepositUsd =
    (Number(agg.nbtcDepositRaw) / Math.pow(10, TOKENS.NBTC.decimals)) * nbtcPrice;
  const nbtcWithdrawUsd =
    (Number(agg.nbtcWithdrawRaw) / Math.pow(10, TOKENS.NBTC.decimals)) * nbtcPrice;

  const depositedUsd = nusdcDepositUsd + nbtcDepositUsd;
  const withdrawnUsd = nusdcWithdrawUsd + nbtcWithdrawUsd;

  return {
    depositedUsd,
    withdrawnUsd,
    netFlowUsd: depositedUsd - withdrawnUsd,
    hasEvents: agg.eventCount > 0,
  };
}

export function useMarginActivity(options: UseMarginActivityOptions) {
  const { accountId, fromMs, toMs, enabled = true } = options;

  return useQuery<MarginActivityTotals>({
    queryKey: ['margin-activity', accountId, fromMs, toMs],
    queryFn: async () => {
      if (!accountId) {
        return { depositedUsd: 0, withdrawnUsd: 0, netFlowUsd: 0, hasEvents: false };
      }
      const agg = await fetchAggregate(accountId, fromMs, toMs);
      return rawToUsd(agg);
    },
    enabled: enabled && !!accountId && !!UNIFIED_MARGIN_PACKAGE,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}
