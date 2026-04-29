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
import { APP_MISSION_MAP } from './missionRegistry';

const PADO_DEX_WEIGHT = 2;

/**
 * Resolve the set of backend category names that the user currently has
 * activated as daily missions. The mission id and the backend category share
 * the same string (e.g. "gostop-numbermatch"); this function exists so the
 * filter has a single, well-named entry point that can absorb future
 * id↔category divergence without touching every consumer.
 *
 * Fallback semantics (matches UjuDailyMissionsCard mission-pool logic):
 *   missions[appId] === undefined → user has never opened this app's
 *     checklist; treat as "all of the app's missions are active"
 *   missions[appId] === []        → explicitly emptied; zero missions active
 */
export function getActiveMissionCategories(
  missionsByApp: Record<string, string[] | undefined>,
): Set<string> {
  const out = new Set<string>();
  for (const [appId, selected] of Object.entries(missionsByApp)) {
    const appMissions = APP_MISSION_MAP[appId];
    if (!appMissions) continue;
    const ids = selected ?? appMissions.map((m) => m.id);
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
