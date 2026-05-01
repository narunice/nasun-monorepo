/**
 * useFilteredTodayScore
 *
 * Today's base/ecosystem score, restricted to categories the user has
 * activated as daily missions. Wraps an EcosystemScoreData payload with the
 * AppDirectory state (active mission ids → backend categories) and returns
 * the same shape with `daily.baseScore` and `daily.ecosystemScore` swapped
 * for filtered values. Other fields (weekly, allTime, multiplier, bonus,
 * governance, referral) are passed through untouched.
 *
 * The hook is pure — it takes the score payload and the directory state as
 * inputs so it can be used from both the uju surface (which has
 * UjuAppDirectoryProvider mounted) and the my-account surface (which mounts
 * the same provider at the page root).
 */
import { useMemo } from 'react';
import type { EcosystemScoreData } from '@/services/ecosystemScoreApi';
import { useUjuAppDirectory } from '../apps/UjuAppDirectoryProvider';
import {
  computeFilteredTodayBase,
  computeCompletedMissions,
  getActiveMissionCategories,
} from './todayScoring';

export interface FilteredTodayScore {
  /** EcosystemScoreData with `daily.baseScore` and `daily.ecosystemScore`
   *  filtered to only count categories the user has activated. Returns the
   *  raw payload unchanged when the score is null. */
  filtered: EcosystemScoreData | null;
  /** Raw, ledger-truth values from the API (for "all-time = full ledger"
   *  tooltip copy or debugging). */
  raw: EcosystemScoreData | null;
  /** True when the filtered today base differs from the raw today base
   *  (i.e. the user has on-chain activity outside their active mission
   *  set). UI can surface a tooltip when this is true. */
  hasFilteredOutActivity: boolean;
  /** Per-mission breakdown for completed missions today (pts > 0).
   *  Inactive or not-yet-completed missions are omitted. */
  completedMissions: { id: string; label: string; pts: number }[];
}

export function useFilteredTodayScore(
  score: EcosystemScoreData | null,
): FilteredTodayScore {
  const directory = useUjuAppDirectory();

  return useMemo<FilteredTodayScore>(() => {
    if (!score) {
      return { filtered: null, raw: null, hasFilteredOutActivity: false, completedMissions: [] };
    }

    const todayCategories = score.todayCategories ?? [];
    const activeCategories = getActiveMissionCategories(directory.state.missions);
    const filteredBase = computeFilteredTodayBase(todayCategories, activeCategories);

    const stakingToday = score.daily.stakingScore ?? 0;
    const bonusToday = score.daily.bonusTotal ?? 0;
    const govToday = score.daily.governancePoints ?? 0;
    const refToday = score.daily.referralBonus ?? 0;
    const sf = score.referralScalingFactor ?? 1;
    const multiplier = score.multiplier ?? 0;

    // Mirror backend formula at apps/network-explorer/api-server/src/routes/
    // ecosystem.ts:518-521. Bonus/governance/referral pass through unchanged
    // per scope decision (only base is filtered).
    const filteredEcosystem =
      (filteredBase + stakingToday) * multiplier
      + bonusToday + govToday + refToday * sf;

    const filtered: EcosystemScoreData = {
      ...score,
      daily: {
        ...score.daily,
        baseScore: filteredBase,
        ecosystemScore: roundTo2(filteredEcosystem),
      },
    };

    // Compare against _rawBaseScore (unfiltered matview value) if the server
    // has already applied the filter to daily.baseScore. Falls back to
    // daily.baseScore for older API responses that lack _rawBaseScore.
    const rawBase = score.daily._rawBaseScore ?? score.daily.baseScore;

    return {
      filtered,
      raw: score,
      hasFilteredOutActivity: filteredBase !== rawBase,
      completedMissions: computeCompletedMissions(todayCategories, directory.state.missions),
    };
  }, [score, directory.state.missions]);
}

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}
