/**
 * useDailyMissions Hook
 *
 * Detects daily mission completion via direct Sui RPC queries.
 * Two RPC calls per check:
 *   1. queryEvents({Sender}) - DEX, lottery, scratchcard, quick pick
 *   2. queryTransactionBlocks({FromAddress}) - faucet claim, token transfer
 *
 * Polls every 60 seconds. Skips when tab is hidden.
 * Independent of the points scanner pipeline.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { suiClient } from "@/lib/sui-client";
import type { SuiTransactionBlockResponse, SuiEvent } from "@mysten/sui/client";

const POLL_INTERVAL_MS = 60_000;

// Mission IDs matching DailyMissionsCard
type MissionId = "faucet" | "wallet-transfer" | "pado-dex" | "pado-lottery" | "pado-scratchcard" | "pado-games";

// Event type suffixes for Sender-based event query
const EVENT_MISSION_MAP: Array<{ suffix: string; missionId: MissionId }> = [
  { suffix: "::order_info::OrderPlaced", missionId: "pado-dex" },
  { suffix: "::lottery::TicketPurchased", missionId: "pado-lottery" },
  { suffix: "::scratchcard::ScratchCardPurchased", missionId: "pado-scratchcard" },
  { suffix: "::numbermatch::NumberMatchPlayed", missionId: "pado-games" },
];

// Faucet modules (upgrade-safe: match by module+function, not package ID)
const FAUCET_MODULES = new Set(["faucet", "faucet_v2"]);

function getTodayUtcStart(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/**
 * Detect event-based missions (DEX, lottery, scratchcard, quick pick).
 * Single RPC call: queryEvents({Sender}).
 */
async function detectEventMissions(
  walletAddress: string,
  todayStart: number,
): Promise<Set<MissionId>> {
  const detected = new Set<MissionId>();

  try {
    const result = await suiClient.queryEvents({
      query: { Sender: walletAddress },
      limit: 50,
      order: "descending",
    });

    for (const event of result.data) {
      const ts = Number(event.timestampMs ?? 0);
      if (ts < todayStart) break; // Past today, stop scanning

      for (const { suffix, missionId } of EVENT_MISSION_MAP) {
        if (event.type.endsWith(suffix)) {
          detected.add(missionId);
          break;
        }
      }

      // Early exit if all event missions found
      if (detected.size === EVENT_MISSION_MAP.length) break;
    }
  } catch (err) {
    console.error("[useDailyMissions] Event query failed:", err);
  }

  return detected;
}

/**
 * Detect TX-based missions (faucet, token transfer).
 * Single RPC call: queryTransactionBlocks({FromAddress}).
 */
async function detectTxMissions(
  walletAddress: string,
  todayStart: number,
): Promise<Set<MissionId>> {
  const detected = new Set<MissionId>();

  try {
    const result = await suiClient.queryTransactionBlocks({
      filter: { FromAddress: walletAddress },
      options: { showInput: true, showBalanceChanges: true },
      limit: 50,
      order: "descending",
    });

    for (const tx of result.data) {
      const ts = Number(tx.timestampMs ?? 0);
      if (ts < todayStart) break;

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

      // Transfer detection: has TransferObjects command and is not a faucet TX
      const hasTransfer = commands.some((cmd) => cmd.type === "TransferObjects");
      if (hasTransfer && !hasFaucetCall) {
        detected.add("wallet-transfer");
      }

      if (detected.has("faucet") && detected.has("wallet-transfer")) break;
    }
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

export interface UseDailyMissionsResult {
  completedMissions: Set<MissionId>;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

export function useDailyMissions(
  walletAddress: string | undefined,
): UseDailyMissionsResult {
  const [completedMissions, setCompletedMissions] = useState<Set<MissionId>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMissions = useCallback(async () => {
    if (!walletAddress) return;

    const todayStart = getTodayUtcStart();

    const [eventMissions, txMissions] = await Promise.all([
      detectEventMissions(walletAddress, todayStart),
      detectTxMissions(walletAddress, todayStart),
    ]);

    // Merge: never remove previously detected missions (only add)
    setCompletedMissions((prev) => {
      const merged = new Set(prev);
      for (const id of eventMissions) merged.add(id);
      for (const id of txMissions) merged.add(id);
      return merged;
    });
  }, [walletAddress]);

  // Initial fetch
  useEffect(() => {
    if (!walletAddress) return;
    setIsLoading(true);
    fetchMissions().finally(() => setIsLoading(false));
  }, [walletAddress, fetchMissions]);

  // 60-second polling
  useEffect(() => {
    if (!walletAddress) return;

    intervalRef.current = setInterval(() => {
      if (!document.hidden) fetchMissions();
    }, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [walletAddress, fetchMissions]);

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
