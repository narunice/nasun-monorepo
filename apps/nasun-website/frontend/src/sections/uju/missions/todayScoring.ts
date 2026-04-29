/**
 * Today base-score filter
 *
 * Per user policy: today's base score reflects ONLY the on-chain categories
 * the user has activated as daily missions. Activities outside the user's
 * curated set (e.g. creator-posts, pado-leaderboard) are not displayed in
 * today's base — they remain in the all-time ledger.
 *
 * Backend matview rules mirrored here:
 *   - per (identity_id, day, category) 1-credit cap (already enforced
 *     upstream: `todayCategories` is a deduplicated list)
 *   - pado-dex weighted x2, every other category weighted x1
 */
import { APP_MISSION_MAP, DEFAULT_MISSIONS_BY_APP } from './missionRegistry';
import { DEFAULT_PINNED_APPS } from '../apps/appRegistry';

const PADO_DEX_WEIGHT = 2;

/**
 * Resolve the set of backend category names that the user currently has
 * activated as daily missions. The mission id and the backend category share
 * the same string (e.g. "gostop-numbermatch"); this function exists so the
 * filter has a single, well-named entry point that can absorb future
 * id↔category divergence without touching every consumer.
 *
 * Fallback semantics (matches UjuDailyMissionsCard mission-pool logic and the
 * backend `/score` endpoint):
 *   missionsByApp === {}          → no per-app entries at all (fresh device
 *     or empty server adoption). Seed defaults for DEFAULT_PINNED_APPS so
 *     today's filteredBase matches the backend `/score` and snapshot fallback
 *     (DEFAULT_MISSION_IDS for users with no record).
 *   missions[appId] === undefined → app key not present; use
 *     DEFAULT_MISSIONS_BY_APP[appId] for that app (curated default subset,
 *     never "show all 8").
 *   missions[appId] === []        → explicitly emptied for that app;
 *     contributes 0 (user toggled everything off).
 */
export function getActiveMissionCategories(
  missionsByApp: Record<string, string[] | undefined>,
): Set<string> {
  const out = new Set<string>();
  const hasAnyEntry = Object.keys(missionsByApp).length > 0;
  if (!hasAnyEntry) {
    for (const appId of DEFAULT_PINNED_APPS) {
      if (!APP_MISSION_MAP[appId]) continue;
      const ids = DEFAULT_MISSIONS_BY_APP[appId] ?? [];
      for (const id of ids) out.add(id);
    }
    return out;
  }
  for (const [appId, selected] of Object.entries(missionsByApp)) {
    if (!APP_MISSION_MAP[appId]) continue;
    const ids = selected ?? DEFAULT_MISSIONS_BY_APP[appId] ?? [];
    for (const id of ids) out.add(id);
  }
  return out;
}

/**
 * Compute today's base score restricted to active mission categories.
 * `todayCategories` is the deduped category list returned by the backend
 * (`/ecosystem/score/:identityId`).
 */
export function computeFilteredTodayBase(
  todayCategories: readonly string[],
  activeCategories: ReadonlySet<string>,
): number {
  let score = 0;
  for (const cat of todayCategories) {
    if (!activeCategories.has(cat)) continue;
    score += cat === 'pado-dex' ? PADO_DEX_WEIGHT : 1;
  }
  return score;
}
