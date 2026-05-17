/**
 * useDailyMissions Hook
 *
 * Reads completed-today missions from the backend `/ecosystem/score` endpoint
 * (`todayCategories`), the same source that powers the pts-today breakdown.
 * This guarantees the active-engagement checklist and pts-today never drift.
 *
 * Previously this hook scanned Sui RPC client-side with paginated
 * `queryEvents({Sender})` and `queryTransactionBlocks({FromAddress})`. That
 * approach silently dropped activities for heavy traders: the descending scan
 * exhausted its 500-event window on dex orders before reaching older game
 * events, leaving lottery/scratchcard/numbermatch/mines/crash unticked even
 * though the backend scanner had recorded them in `activity_points`. It also
 * hammered the devnet fullnode at scale (per wallet × per minute × MAX_PAGES).
 *
 * The backend `points-scanner` (60s cycle) inserts at most one row per
 * (identity, category, day) into `activity_points`; the route caches
 * `todayCategories` for 60s. Optimistic instant-feedback for activities
 * triggered on this site is preserved via the `localCompleted` Set in the
 * consumer components.
 */

import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useEcosystemScore, ecosystemScoreKeys } from "./useEcosystemScore";

// Mission IDs match the backend `category` strings 1:1, so `todayCategories`
// values can be promoted to MissionId without translation.
export type MissionId =
  | "faucet"
  | "wallet-transfer"
  | "pado-dex"
  | "pado-prediction"
  | "gostop-lottery"
  | "gostop-scratchcard"
  | "gostop-numbermatch"
  | "gostop-mines"
  | "gostop-crash"
  | "gostop-wheel";

const KNOWN_MISSION_IDS: ReadonlySet<MissionId> = new Set<MissionId>([
  "faucet",
  "wallet-transfer",
  "pado-dex",
  "pado-prediction",
  "gostop-lottery",
  "gostop-scratchcard",
  "gostop-numbermatch",
  "gostop-mines",
  "gostop-crash",
  "gostop-wheel",
]);

export interface UseDailyMissionsResult {
  // Widened to Set<string> so callers (myAccount inline missions, uju
  // visit-type missions, governance-vote item) can probe with their own ids
  // without an `as any` cast. The backing set still only contains values
  // from the MissionId union; widening is a typing convenience, not new data.
  completedMissions: Set<string>;
  isLoading: boolean;
  refetch: () => Promise<void>;
}

/**
 * Hook to detect daily mission completion for an account.
 *
 * @param identityId - Nasun account identifier
 * @param _walletAddresses - kept for source compatibility; backend resolves
 *   activity by `identity_id` so per-wallet enumeration is no longer needed.
 */
export function useDailyMissions(
  identityId: string | undefined,
  _walletAddresses?: string[],
): UseDailyMissionsResult {
  const { score, isLoading } = useEcosystemScore(identityId);
  const queryClient = useQueryClient();

  const completedMissions = useMemo<Set<string>>(() => {
    const out = new Set<string>();
    const categories = score?.todayCategories ?? [];
    for (const category of categories) {
      if (KNOWN_MISSION_IDS.has(category as MissionId)) {
        out.add(category);
      }
    }
    return out;
  }, [score]);

  // refetch invalidates the shared ecosystem score query so every consumer
  // (this hook, pts-today breakdown, multiplier box, etc.) re-fetches in
  // lockstep. Callers `await refetch()` after a TX-success optimistic update
  // to confirm against the authoritative backend.
  const refetch = async () => {
    if (!identityId) return;
    await queryClient.invalidateQueries({
      queryKey: ecosystemScoreKeys.detail(identityId),
    });
  };

  return { completedMissions, isLoading, refetch };
}
