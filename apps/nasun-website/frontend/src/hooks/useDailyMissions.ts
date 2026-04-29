/**
 * useDailyMissions Hook
 *
 * Detects daily mission completion via direct Sui RPC queries.
 * Checks ALL registered wallets for the account (not just one).
 * Two RPC calls per wallet per check (with cursor-based pagination):
 *   1. queryEvents({Sender}) - DEX, lottery, scratchcard, quick pick
 *   2. queryTransactionBlocks({FromAddress}) - faucet claim, token transfer
 *
 * Polls every 60 seconds. Skips when tab is hidden.
 * Results cached in localStorage (keyed by UTC date + identityId) to survive
 * page navigation and remounts. Resets at UTC midnight globally.
 *
 * Independent of the points scanner pipeline.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { suiClient } from "@/lib/sui-client";
import type { SuiTransactionBlockResponse } from "@mysten/sui/client";

const POLL_INTERVAL_MS = 60_000;
const MAX_PAGES = 10; // Cap pagination (10 * 50 = 500 results max per wallet)

// Mission IDs matching DailyMissionsCard
export type MissionId = "faucet" | "wallet-transfer" | "pado-dex" | "pado-lottery" | "pado-scratchcard" | "pado-games" | "chat";

// Event type suffixes for Sender-based event query.
// Spot Trade: OrderPlaced fires only when order is injected into the book (maker).
// Taker/IOC orders that fill immediately emit OrderFilled instead. Include both
// so market-order traders also get the daily mission credit.
//
// IMPORTANT: Mirror of backend EVENT_MAP_ENTRIES in
// apps/network-explorer/api-server/src/config/points.ts. Out-of-sync entries
// cause UI checkbox drift even when points are credited correctly.
// Precedent: commit aa3e7a7b (OrderFilled added backend-only, UI drift followed).
const EVENT_MISSION_MAP: Array<{ suffix: string; missionId: MissionId }> = [
  { suffix: "::order_info::OrderPlaced", missionId: "pado-dex" },
  { suffix: "::order_info::OrderFilled", missionId: "pado-dex" },
  { suffix: "::lottery::TicketPurchased", missionId: "pado-lottery" },
  { suffix: "::scratchcard::ScratchCardPurchased", missionId: "pado-scratchcard" },
  { suffix: "::numbermatch::NumberMatchPlayed", missionId: "pado-games" },
  // Gostop mines/crash share the pado-games mission (and its 1pt/day cap).
  // mines: SessionFinished fires on every session end (bust + cashout).
  // crash: BetPlaced is the "completion" signal because the keeper always
  //   auto-finalizes the round, so a bet alone is enough to count as a
  //   completed game. CashOutRecorded credits the same mission for players
  //   who do cash out; the daily cap dedups the combo.
  { suffix: "::mines::SessionFinished", missionId: "pado-games" },
  { suffix: "::crash::BetPlaced", missionId: "pado-games" },
  { suffix: "::crash::CashOutRecorded", missionId: "pado-games" },
];

// Faucet modules (upgrade-safe: match by module+function, not package ID)
const FAUCET_MODULES = new Set(["faucet", "faucet_v2"]);

// Modules whose MoveCall presence in a PTB disqualifies the tx from the
// "send tokens" mission — mirrors the backend scanner's
// WALLET_TRANSFER_EXCLUDED_MODULES rule in
// apps/network-explorer/api-server/src/config/points.ts. Match by module
// (not package ID) for upgrade-safety, mirroring the FAUCET_MODULES pattern.
//
// SYNC WARNING: must stay in lockstep with backend. Drift causes the UI
// checkbox and pts-today to diverge.
//
// Intent: a legitimate peer transfer is a PTB whose substantive command is a
// TransferObjects to another user. Pado spot auto-deposits, lottery, scratch
// card, numbermatch etc. also chain TransferObjects with a contract MoveCall;
// counting them as "send" causes the pts-today / checklist drift this hook
// was updated to prevent.
const CONTRACT_MODULES_EXCLUDING_TRANSFER = new Set([
  // Faucet (tokens V1 + V2)
  "faucet", "faucet_v2",
  // Pado DEX / Perp / Margin
  "order_info", "order", "pool", "deep", "balance_manager",
  "unified_margin",
  // Pado games
  "prediction", "lottery", "scratchcard", "numbermatch",
  // Gostop games
  "mines", "crash",
  // Nasun website / admin
  "alliance_nft", "battalion_nft", "smart_account",
  "dev_oracle",
  // Governance
  "governance",
  // Baram AI Settlement
  "baram", "executor", "aer",
  // Sui system (0x3)
  "staking_pool", "sui_system",
]);

// All possible mission IDs for early exit optimization
const ALL_MISSION_IDS: Set<MissionId> = new Set(["faucet", "wallet-transfer", "pado-dex", "pado-lottery", "pado-scratchcard", "pado-games", "chat"]);

function getTodayUtcStart(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

// Derive UTC date string from getTodayUtcStart to avoid timezone mismatch
function getTodayUtcDateStr(): string {
  return new Date(getTodayUtcStart()).toISOString().slice(0, 10);
}

// localStorage key scoped by UTC date + identityId (per-account, not per-wallet)
function getCacheKey(identityId: string): string {
  return `daily-missions:${getTodayUtcDateStr()}:${identityId}`;
}

// Remove stale cache keys from previous days
function cleanupStaleCacheKeys(): void {
  const todayPrefix = `daily-missions:${getTodayUtcDateStr()}:`;
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith("daily-missions:") && !key.startsWith(todayPrefix)) {
      localStorage.removeItem(key);
    }
  }
}

// Read cached missions from localStorage
function readCache(identityId: string): Set<MissionId> {
  try {
    const cached = localStorage.getItem(getCacheKey(identityId));
    return cached ? new Set(JSON.parse(cached) as MissionId[]) : new Set();
  } catch {
    return new Set();
  }
}

/**
 * Detect event-based missions (DEX, lottery, scratchcard, quick pick).
 * Paginated RPC calls: queryEvents({Sender}) with cursor.
 */
export async function detectEventMissions(
  walletAddress: string,
  todayStart: number,
  alreadyFound: Set<MissionId>,
): Promise<Set<MissionId>> {
  const detected = new Set<MissionId>();

  // Skip if all event missions already found from another wallet
  const eventMissionIds = EVENT_MISSION_MAP.map(e => e.missionId);
  if (eventMissionIds.every(id => alreadyFound.has(id))) return detected;

  let cursor: string | null | undefined = undefined;
  let pages = 0;

  try {
    do {
      const result = await suiClient.queryEvents({
        query: { Sender: walletAddress },
        limit: 50,
        order: "descending",
        ...(cursor ? { cursor } : {}),
      });

      for (const event of result.data) {
        const ts = Number(event.timestampMs ?? 0);
        if (ts < todayStart) return detected; // Past today, stop scanning

        for (const { suffix, missionId } of EVENT_MISSION_MAP) {
          if (event.type.endsWith(suffix)) {
            detected.add(missionId);
            break;
          }
        }

        // Early exit if all event missions found (combining already found + new)
        if (eventMissionIds.every(id => alreadyFound.has(id) || detected.has(id))) {
          return detected;
        }
      }

      cursor = result.hasNextPage ? (result.nextCursor as string) : null;
      pages++;
    } while (cursor && pages < MAX_PAGES);
  } catch (err) {
    console.error("[useDailyMissions] Event query failed:", err);
  }

  return detected;
}

/**
 * Detect TX-based missions (faucet, token transfer).
 * Paginated RPC calls: queryTransactionBlocks({FromAddress}) with cursor.
 */
export async function detectTxMissions(
  walletAddress: string,
  todayStart: number,
  alreadyFound: Set<MissionId>,
): Promise<Set<MissionId>> {
  const detected = new Set<MissionId>();

  // Skip if both TX missions already found from another wallet
  if (alreadyFound.has("faucet") && alreadyFound.has("wallet-transfer")) return detected;

  let cursor: string | null | undefined = undefined;
  let pages = 0;

  try {
    do {
      const result = await suiClient.queryTransactionBlocks({
        filter: { FromAddress: walletAddress },
        options: { showInput: true, showBalanceChanges: true },
        limit: 50,
        order: "descending",
        ...(cursor ? { cursor } : {}),
      });

      for (const tx of result.data) {
        const ts = Number(tx.timestampMs ?? 0);
        if (ts < todayStart) return detected; // Past today, stop scanning

        // Skip failed transactions
        if (tx.effects?.status?.status === "failure") continue;

        const commands = getCommands(tx);
        const hasFaucetCall = commands.some(
          (cmd) =>
            cmd.type === "MoveCall" &&
            FAUCET_MODULES.has(cmd.module) &&
            cmd.fn.startsWith("request_"),
        );

        if (hasFaucetCall) {
          detected.add("faucet");
        }

        // Transfer detection: PTB contains TransferObjects AND no MoveCall
        // into an excluded contract module. Mirrors the backend scanner rule
        // so the UI checkbox never diverges from pts-today (Pado auto-deposit,
        // lottery, scratchcard etc. emit TransferObjects too, but those are
        // contract interactions — not peer transfers).
        const hasTransfer = commands.some((cmd) => cmd.type === "TransferObjects");
        const hasExcludedCall = commands.some(
          (cmd) =>
            cmd.type === "MoveCall" &&
            CONTRACT_MODULES_EXCLUDING_TRANSFER.has(cmd.module),
        );
        if (hasTransfer && !hasExcludedCall) {
          detected.add("wallet-transfer");
        }

        const faucetDone = alreadyFound.has("faucet") || detected.has("faucet");
        const transferDone = alreadyFound.has("wallet-transfer") || detected.has("wallet-transfer");
        if (faucetDone && transferDone) return detected;
      }

      cursor = result.hasNextPage ? (result.nextCursor as string) : null;
      pages++;
    } while (cursor && pages < MAX_PAGES);
  } catch (err) {
    console.error("[useDailyMissions] TX query failed:", err);
  }

  return detected;
}

interface ParsedCommand {
  type: string;
  module: string;
  fn: string;
}

/** Extract commands from a ProgrammableTransaction response. */
function getCommands(tx: SuiTransactionBlockResponse): ParsedCommand[] {
  const txData = tx.transaction?.data?.transaction;
  if (!txData || txData.kind !== "ProgrammableTransaction") return [];

  return txData.transactions.map((cmd) => {
    if ("MoveCall" in cmd) {
      const mc = cmd.MoveCall;
      return {
        type: "MoveCall",
        module: mc.module,
        fn: mc.function,
      };
    }
    if ("TransferObjects" in cmd) {
      return { type: "TransferObjects", module: "", fn: "" };
    }
    return { type: "Other", module: "", fn: "" };
  });
}

/**
 * Detect missions across multiple wallet addresses.
 * Queries wallets sequentially, skipping already-found missions.
 */
export async function detectAllWallets(
  walletAddresses: string[],
  todayStart: number,
  existingMissions: Set<MissionId>,
  identityId?: string,
): Promise<Set<MissionId>> {
  const allDetected = new Set<MissionId>(existingMissions);

  for (const wallet of walletAddresses) {
    // Early exit if all missions found
    if (allDetected.size >= ALL_MISSION_IDS.size) break;

    // Query events and TXs for this wallet in parallel
    const [eventMissions, txMissions] = await Promise.all([
      detectEventMissions(wallet, todayStart, allDetected),
      detectTxMissions(wallet, todayStart, allDetected),
    ]);

    for (const id of eventMissions) allDetected.add(id);
    for (const id of txMissions) allDetected.add(id);
  }

  // Chat detection via explorer API (scanner is the only source of truth
  // for off-chain activity; client RPC can't see it). All other missions
  // are authoritative from the client-side scan above — wallet-transfer
  // mirrors the scanner's exclusion rule via CONTRACT_MODULES_EXCLUDING_TRANSFER
  // so the UI and pts-today agree without a second API roundtrip.
  if (!allDetected.has("chat") && identityId) {
    try {
      const res = await fetch(
        `${import.meta.env.VITE_EXPLORER_API_URL}/ecosystem/score/${identityId}`,
      );
      if (res.ok) {
        const data = await res.json();
        if (data.data?.todayCategories?.includes("chat")) {
          allDetected.add("chat");
        }
      }
    } catch { /* non-critical: chat mission just stays unchecked */ }
  }

  return allDetected;
}

export interface UseDailyMissionsResult {
  completedMissions: Set<MissionId>;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

/**
 * Hook to detect daily mission completion across all wallets for an account.
 *
 * @param identityId - Nasun account identifier (for cache scoping)
 * @param walletAddresses - All registered wallet addresses for this account
 */
export function useDailyMissions(
  identityId: string | undefined,
  walletAddresses: string[],
): UseDailyMissionsResult {
  const [completedMissions, setCompletedMissions] = useState<Set<MissionId>>(() => {
    if (!identityId) return new Set();
    return readCache(identityId);
  });
  const [isLoading, setIsLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stable reference for walletAddresses to avoid unnecessary re-renders
  const walletsKey = walletAddresses.join(",");

  // Reload cache when identity changes
  useEffect(() => {
    if (!identityId) {
      setCompletedMissions(new Set());
      return;
    }
    setCompletedMissions(readCache(identityId));
    cleanupStaleCacheKeys();
  }, [identityId]);

  // Detect UTC date change (tab stayed open past midnight)
  const dateRef = useRef(getTodayUtcDateStr());
  useEffect(() => {
    if (!identityId) return;

    const checkDateChange = () => {
      const currentDate = getTodayUtcDateStr();
      if (currentDate !== dateRef.current) {
        dateRef.current = currentDate;
        setCompletedMissions(new Set());
        cleanupStaleCacheKeys();
      }
    };

    const interval = setInterval(checkDateChange, POLL_INTERVAL_MS);
    const onVisible = () => { if (!document.hidden) checkDateChange(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [identityId]);

  // Persist to localStorage whenever completedMissions changes
  useEffect(() => {
    if (!identityId) return;
    localStorage.setItem(getCacheKey(identityId), JSON.stringify([...completedMissions]));
  }, [completedMissions, identityId]);

  const fetchMissions = useCallback(async () => {
    if (!identityId || walletAddresses.length === 0) return;

    const todayStart = getTodayUtcStart();
    const detected = await detectAllWallets(walletAddresses, todayStart, new Set(), identityId);

    // Replace: RPC result is the source of truth for today
    setCompletedMissions(detected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityId, walletsKey]);

  // Initial fetch
  useEffect(() => {
    if (!identityId || walletAddresses.length === 0) return;
    setIsLoading(true);
    fetchMissions().finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityId, walletsKey, fetchMissions]);

  // 60-second polling
  useEffect(() => {
    if (!identityId || walletAddresses.length === 0) return;

    intervalRef.current = setInterval(() => {
      if (!document.hidden) fetchMissions();
    }, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [identityId, walletAddresses.length, fetchMissions]);

  // Instant refetch on wallet transfer success (from SendTransaction modal)
  useEffect(() => {
    const handler = () => {
      // Small delay to allow RPC to index the new TX
      setTimeout(() => fetchMissions(), 2000);
    };
    window.addEventListener("nasun:transfer-success", handler);
    return () => window.removeEventListener("nasun:transfer-success", handler);
  }, [fetchMissions]);

  // Refetch when ecosystem refresh button is clicked
  useEffect(() => {
    const handler = () => fetchMissions();
    window.addEventListener("ecosystem:refresh", handler);
    return () => window.removeEventListener("ecosystem:refresh", handler);
  }, [fetchMissions]);

  return { completedMissions, isLoading, refetch: fetchMissions };
}
