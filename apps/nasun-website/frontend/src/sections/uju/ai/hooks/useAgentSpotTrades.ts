/**
 * useAgentSpotTrades — reconstruct an agent's Pado spot trade history from
 * on-chain escrow events.
 *
 * Why not chat-server `/api/trades`: agent uses DeepBook V3's coin-based
 * `swap_exact_*` path (no BalanceManager), so chat-server's OrderFilled
 * indexer drops every agent fill as "unresolvable BM". Verified empty for
 * agent addresses + escrow ids alike. See
 * reference_agent_trade_data_source.md.
 *
 * Authoritative source: each swap tx emits a 3-event triple on the agent's
 * escrow object:
 *   1. EscrowWithdrawn { asset: T_in, amount: gross,    by_capability: true }
 *   2. EscrowDeposited { asset: T_in, amount: leftover, by_capability: true }
 *   3. EscrowDeposited { asset: T_out, amount: received, by_capability: true }
 * Net spend = gross - leftover; received gives us the other leg. NUSDC is
 * always the quote across Pado spot pools, so direction (BUY/SELL) is
 * implied by which side is NUSDC.
 *
 * Query: queryTransactionBlocks({ InputObject: escrowId, showEvents: true })
 * server-side scopes to txs that touched this escrow, so we don't sift
 * through the global event firehose. Paginated; capped at 1000 trades to
 * bound memory and RPC load on long-running agents.
 */
import { useQuery } from '@tanstack/react-query';
import { suiClient } from '@/lib/sui-client';

// originalPackageId of the AER/escrow Move package. Events carry the
// originalId in their type tag (Sui invariant under upgrades), so we anchor
// here rather than the (mutable) latest packageId. Verified 2026-05-22
// against Santa agent escrow 0x7085f2fc...
//
// TODO: lift this to @nasun/devnet-config once `aerOriginalPackageId` is
// populated in devnet-ids.json (currently null - see reference memory).
const ESCROW_ORIGINAL_PACKAGE_ID =
  '0xdb118fd931572cf42af8613dce1cc18471419d1ba937b63c832d4361aad5b8e5';

const ESCROW_WITHDRAWN_TYPE = `${ESCROW_ORIGINAL_PACKAGE_ID}::escrow::EscrowWithdrawn`;
const ESCROW_DEPOSITED_TYPE = `${ESCROW_ORIGINAL_PACKAGE_ID}::escrow::EscrowDeposited`;

const MAX_PAGES = 20;
const PAGE_SIZE = 50;

/**
 * Known Pado spot pool base assets. NUSDC is the quote across every pool we
 * support today; treating it as the quote lets us derive BUY/SELL from which
 * side of the trade is NUSDC vs base. If a new non-NUSDC quote ever appears
 * (e.g. NETH/NBTC pool) this needs revisiting.
 */
const NUSDC_TYPE_SUFFIX = '::nusdc::NUSDC';

export type TradeSide = 'BUY' | 'SELL';

export interface SpotTrade {
  txDigest: string;
  timestampMs: number;
  side: TradeSide;
  /** Base token type name (e.g. NBTC, NETH, NSN). */
  baseSymbol: string;
  /** Fully-qualified base asset type (for decimals lookup if needed). */
  baseTypeName: string;
  /** Base quantity moved, raw units (NOT decimal-adjusted). */
  baseQtyRaw: bigint;
  /** Quote (NUSDC) moved, raw units (1e6). For BUY = net spent, for SELL = received. */
  quoteRaw: bigint;
}

interface EscrowEventJson {
  escrow_id: string;
  asset: { name: string };
  amount: string;
  by_capability: boolean;
}

function isNusdc(typeName: string): boolean {
  return typeName.endsWith(NUSDC_TYPE_SUFFIX) || typeName.includes('::nusdc::NUSDC');
}

/**
 * Strip the `::<module>::<Symbol>` tail off a Sui type tag to get a display
 * symbol. e.g. `96adf...::nbtc::NBTC` -> `NBTC`. Falls back to last segment.
 */
function symbolFromType(typeName: string): string {
  const parts = typeName.split('::');
  return parts[parts.length - 1] || typeName;
}

/**
 * Pull our escrow's W/D events out of a tx's full event list and reduce to
 * one canonical SpotTrade entry (or null if the tx didn't actually swap on
 * behalf of this escrow - e.g. a top-up deposit, owner withdraw, or a tx
 * that touched the escrow as input but didn't move funds).
 *
 * Cap-gated invariant: real swap txs have by_capability=true on all three
 * events. We skip non-cap events to keep manual top-ups/withdraws out of
 * the trade history (those are funding flow, not performance).
 */
function reconstructTrade(
  escrowId: string,
  events: Array<{ type: string; parsedJson: unknown }>,
  txDigest: string,
  timestampMs: number,
): SpotTrade | null {
  // Type tags carry the originalId we filter on. parsedJson typing is loose
  // because suiClient returns `unknown` for parsedJson.
  const withdrawn: EscrowEventJson[] = [];
  const deposited: EscrowEventJson[] = [];
  for (const ev of events) {
    if (ev.type !== ESCROW_WITHDRAWN_TYPE && ev.type !== ESCROW_DEPOSITED_TYPE) continue;
    const json = ev.parsedJson as EscrowEventJson;
    if (json?.escrow_id !== escrowId) continue;
    if (!json.by_capability) continue;
    if (ev.type === ESCROW_WITHDRAWN_TYPE) withdrawn.push(json);
    else deposited.push(json);
  }
  if (withdrawn.length !== 1 || deposited.length === 0) return null;

  const w = withdrawn[0];
  const inAsset = w.asset.name;
  const gross = BigInt(w.amount);

  // Find leftover-input deposit (same asset as withdraw) and out-asset deposit.
  let leftover = 0n;
  let outDep: EscrowEventJson | null = null;
  for (const d of deposited) {
    if (d.asset.name === inAsset) {
      leftover += BigInt(d.amount);
    } else if (!outDep) {
      outDep = d;
    } else {
      // Multiple out-asset deposits in one tx would mean a multi-leg swap
      // we don't yet model. Drop this trade rather than misreport.
      return null;
    }
  }
  if (!outDep) return null;
  const outAmount = BigInt(outDep.amount);
  const outAsset = outDep.asset.name;
  const netIn = gross - leftover;
  if (netIn <= 0n || outAmount <= 0n) return null;

  // Direction: NUSDC is the quote. Spend NUSDC = BUY base, receive NUSDC = SELL base.
  if (isNusdc(inAsset) && !isNusdc(outAsset)) {
    return {
      txDigest,
      timestampMs,
      side: 'BUY',
      baseSymbol: symbolFromType(outAsset),
      baseTypeName: outAsset,
      baseQtyRaw: outAmount,
      quoteRaw: netIn,
    };
  }
  if (!isNusdc(inAsset) && isNusdc(outAsset)) {
    return {
      txDigest,
      timestampMs,
      side: 'SELL',
      baseSymbol: symbolFromType(inAsset),
      baseTypeName: inAsset,
      baseQtyRaw: netIn,
      quoteRaw: outAmount,
    };
  }
  // base<->base swap, not currently supported (no NUSDC leg = can't price).
  return null;
}

async function fetchTrades(escrowId: string): Promise<SpotTrade[]> {
  const out: SpotTrade[] = [];
  let cursor: { txDigest: string; eventSeq: string } | string | null | undefined = undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await suiClient.queryTransactionBlocks({
      filter: { InputObject: escrowId },
      options: { showEvents: true },
      cursor: cursor as string | null | undefined,
      limit: PAGE_SIZE,
      order: 'descending',
    });
    for (const tx of res.data) {
      const ts = Number(tx.timestampMs ?? 0);
      const trade = reconstructTrade(escrowId, (tx.events ?? []) as Array<{ type: string; parsedJson: unknown }>, tx.digest, ts);
      if (trade) out.push(trade);
    }
    if (!res.hasNextPage || !res.nextCursor) break;
    cursor = res.nextCursor as string | null | undefined;
  }
  // Sort chronologically (oldest first) so cost-basis FIFO can fold over them.
  out.sort((a, b) => a.timestampMs - b.timestampMs);
  return out;
}

export interface UseAgentSpotTradesResult {
  trades: SpotTrade[];
  isLoading: boolean;
}

export function useAgentSpotTrades(
  escrowId: string | null | undefined,
): UseAgentSpotTradesResult {
  const { data, isLoading } = useQuery({
    queryKey: ['nasun-ai', 'agentSpotTrades', escrowId],
    queryFn: () => fetchTrades(escrowId!),
    enabled: !!escrowId,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    staleTime: 20_000,
  });
  return { trades: data ?? [], isLoading };
}
