import { useState, useCallback, useEffect, useMemo } from 'react';
import { APP_REGISTRY, VALID_APP_IDS, DEFAULT_PINNED_APPS, type AppEntry } from './appRegistry';
import { APP_MISSION_MAP, DEFAULT_MISSIONS_BY_APP, MAX_DAILY_MISSIONS } from '../missions/missionRegistry';

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const NEW_KEY_PREFIX = 'uju:app-directory';
const OLD_KEY_PREFIX = 'uju:pinned-apps'; // kept for one release for rollback

function directoryKey(identityId: string | undefined): string {
  return identityId ? `${NEW_KEY_PREFIX}:${identityId}` : `${NEW_KEY_PREFIX}:guest`;
}

function legacyKey(identityId: string | undefined): string {
  return identityId ? `${OLD_KEY_PREFIX}:${identityId}` : `${OLD_KEY_PREFIX}:guest`;
}

// PR3b: mission ids removed from the registry. Dropped silently on parse so
// users who selected them in earlier builds get a clean slate without a toast
// or migration step. The list is closed (sourced from registry deletions).
const STALE_MISSION_IDS: ReadonlySet<string> = new Set([
  'chat',
  'jupiter-swap',
  'cetus-trade',
  'uniswap-swap',
]);

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export interface AppDirectoryState {
  /**
   * Apps user explicitly Activate'd. Stays pinned even when missions[] is empty
   * (e.g. user wants the app on dashboard for non-mission features like staking,
   * or app is between campaigns and offers no daily missions).
   */
  explicitPinned: string[];

  /**
   * Per-app user-selected mission ids.
   *   missions[appId] === undefined → user has never opened this app's checklist;
   *                                    fallback shows ALL of the app's missions.
   *   missions[appId] === []        → explicitly emptied by user; show 0 missions.
   */
  missions: Record<string, string[]>;
}

const EMPTY_STATE: AppDirectoryState = { explicitPinned: [], missions: {} };

export function parseDirectoryState(raw: unknown): AppDirectoryState {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_STATE };
  const r = raw as { explicitPinned?: unknown; missions?: unknown };
  const explicitPinned = Array.isArray(r.explicitPinned)
    ? (r.explicitPinned as unknown[]).filter(
        (id): id is string => typeof id === 'string' && VALID_APP_IDS.has(id),
      )
    : [];
  const missions: Record<string, string[]> = {};
  if (r.missions && typeof r.missions === 'object') {
    for (const [appId, ids] of Object.entries(r.missions as Record<string, unknown>)) {
      if (!VALID_APP_IDS.has(appId)) continue;
      if (!Array.isArray(ids)) continue;
      // Drop closed-set stale ids removed from the registry. Other unknown ids
      // pass through and are intersected with APP_MISSION_MAP at render time
      // (preserves the historical "render-time drop" contract for ids that may
      // legitimately reappear).
      missions[appId] = (ids as unknown[]).filter(
        (x): x is string => typeof x === 'string' && !STALE_MISSION_IDS.has(x),
      );
    }
  }
  return { explicitPinned, missions };
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Safari private mode or quota — tolerate; in-memory state still updates
  }
}

/**
 * Lazy-init loader. Called from useState initializer + identityId-change effect.
 *
 * Migration path:
 *   1. New key present → parse and return (user-authored state, even if empty).
 *   2. Else, legacy `uju:pinned-apps:{id}` present → migrate to new shape,
 *      write new key, KEEP legacy key (rollback safety; cleaned in a later PR).
 *   3. Else (truly fresh user) → seed DEFAULT_PINNED_APPS so the day-1 faucet
 *      and wallet-transfer onboarding survives the BASE_MISSIONS removal.
 *      No "seeded" marker is stored; once the user takes any action the state
 *      becomes hit (step 1) and we never re-seed.
 */
export function loadFromStorage(identityId: string | undefined): AppDirectoryState {
  const newKey = directoryKey(identityId);
  const fromNew = readJson(newKey);
  if (fromNew !== null) return parseDirectoryState(fromNew);

  const legacy = readJson(legacyKey(identityId));
  if (Array.isArray(legacy)) {
    const explicitPinned = (legacy as unknown[]).filter(
      (id): id is string => typeof id === 'string' && VALID_APP_IDS.has(id),
    );
    const migrated: AppDirectoryState = { explicitPinned, missions: {} };
    writeJson(newKey, migrated);
    return migrated;
  }

  // Fresh user: seed default-pinned apps with their default mission subsets
  // (DEFAULT_MISSIONS_BY_APP — the historic 6 to migrate from my-account).
  // The seed is NOT persisted so a user who immediately deactivates an app
  // is not re-seeded next session (their first save promotes them to "hit"
  // in step 1).
  const seedPinned = DEFAULT_PINNED_APPS.filter((id) => VALID_APP_IDS.has(id));
  const seedMissions: Record<string, string[]> = {};
  let seeded = 0;
  for (const id of seedPinned) {
    const defaults = DEFAULT_MISSIONS_BY_APP[id] ?? [];
    const validIds = new Set((APP_MISSION_MAP[id] ?? []).map((m) => m.id));
    const remaining = Math.max(0, MAX_DAILY_MISSIONS - seeded);
    const picked = defaults.filter((mid) => validIds.has(mid)).slice(0, remaining);
    seedMissions[id] = picked;
    seeded += picked.length;
  }
  return { explicitPinned: [...seedPinned], missions: seedMissions };
}

// ---------------------------------------------------------------------------
// Derive
// ---------------------------------------------------------------------------

/**
 * Effective pinned ids = user's explicit activations ∪ apps with selected missions.
 * Order: APP_REGISTRY declaration order (deterministic, browser-independent).
 */
export function effectivePinned(state: AppDirectoryState): string[] {
  const fromMissions = Object.keys(state.missions).filter(
    (appId) => (state.missions[appId]?.length ?? 0) > 0,
  );
  const merged = new Set<string>([...state.explicitPinned, ...fromMissions]);
  return APP_REGISTRY.map((a) => a.id).filter((id) => merged.has(id));
}

/**
 * Total number of mission ids selected across all apps. Counts only ids that
 * are still defined in APP_MISSION_MAP (so registry drops don't inflate).
 */
export function selectedMissionCount(state: AppDirectoryState): number {
  let count = 0;
  for (const [appId, ids] of Object.entries(state.missions)) {
    const valid = APP_MISSION_MAP[appId];
    if (!valid) continue;
    const validIds = new Set(valid.map((m) => m.id));
    for (const id of ids) {
      if (validIds.has(id)) count++;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseAppDirectoryResult {
  state: AppDirectoryState;
  pinnedApps: AppEntry[];
  isPinned: (id: string) => boolean;
  activate: (id: string) => void;
  deactivate: (id: string) => void;
  toggleMission: (appId: string, missionId: string) => void;
  setMissions: (appId: string, ids: string[]) => void;
  selectedTotal: number;
  isAtCap: boolean;
}

export function useAppDirectory(identityId: string | undefined): UseAppDirectoryResult {
  const [state, setStateRaw] = useState<AppDirectoryState>(() =>
    loadFromStorage(identityId),
  );

  // identityId switch (logout + login as another user). Lazy initializer only
  // fires on first mount, so swap state synchronously here to prevent stale
  // flashes from the previous identity.
  useEffect(() => {
    setStateRaw(loadFromStorage(identityId));
  }, [identityId]);

  // Sync writer: every action goes through this. No debounce — payload is tiny
  // and a debounced write window can lose changes when other tabs write
  // concurrently. Multi-tab `storage` event listener intentionally omitted
  // (single-tab is the 99% case); revisit if user feedback demands it.
  const setState = useCallback(
    (next: AppDirectoryState) => {
      setStateRaw(next);
      writeJson(directoryKey(identityId), next);
    },
    [identityId],
  );

  const pinnedApps = useMemo(() => {
    const ids = effectivePinned(state);
    const idSet = new Set(ids);
    return APP_REGISTRY.filter((a) => idSet.has(a.id));
  }, [state]);

  const selectedTotal = useMemo(() => selectedMissionCount(state), [state]);
  const isAtCap = selectedTotal >= MAX_DAILY_MISSIONS;

  const isPinned = useCallback(
    (id: string) =>
      state.explicitPinned.includes(id) ||
      (state.missions[id]?.length ?? 0) > 0,
    [state],
  );

  const activate = useCallback(
    (id: string) => {
      if (!VALID_APP_IDS.has(id)) return;
      if (state.explicitPinned.includes(id)) return;
      // On Activate, default-select the app's curated default missions
      // (DEFAULT_MISSIONS_BY_APP), clamped to the remaining cap. Falls back
      // to the full mission list if no defaults are configured. Without this
      // seed, the user has to click each mission individually after
      // activating, and a deactivate→reactivate cycle silently loses prior
      // selections.
      const validMissionIds = new Set((APP_MISSION_MAP[id] ?? []).map((m) => m.id));
      const defaults = DEFAULT_MISSIONS_BY_APP[id];
      const candidate = defaults
        ? defaults.filter((mid) => validMissionIds.has(mid))
        : [...validMissionIds];
      const remaining = Math.max(0, MAX_DAILY_MISSIONS - selectedTotal);
      const seeded = candidate.slice(0, remaining);
      const nextMissions = { ...state.missions };
      // Preserve any pre-existing selection; only seed if the slot is empty.
      if (!nextMissions[id] || nextMissions[id].length === 0) {
        nextMissions[id] = seeded;
      }
      setState({
        explicitPinned: [...state.explicitPinned, id],
        missions: nextMissions,
      });
    },
    [state, setState, selectedTotal],
  );

  const deactivate = useCallback(
    (id: string) => {
      const newMissions = { ...state.missions };
      delete newMissions[id];
      setState({
        explicitPinned: state.explicitPinned.filter((x) => x !== id),
        missions: newMissions,
      });
    },
    [state, setState],
  );

  const toggleMission = useCallback(
    (appId: string, missionId: string) => {
      if (!VALID_APP_IDS.has(appId)) return;
      const cur = state.missions[appId] ?? [];
      const adding = !cur.includes(missionId);
      // Cap enforcement: refuse adds that would exceed MAX_DAILY_MISSIONS. The
      // UI disables unselected checkboxes at cap so this branch is a defensive
      // fallback (rapid double-click, programmatic call).
      if (adding && selectedTotal >= MAX_DAILY_MISSIONS) return;
      const next = adding
        ? [...cur, missionId]
        : cur.filter((id) => id !== missionId);
      setState({
        ...state,
        missions: { ...state.missions, [appId]: next },
      });
    },
    [state, setState, selectedTotal],
  );

  const setMissions = useCallback(
    (appId: string, ids: string[]) => {
      if (!VALID_APP_IDS.has(appId)) return;
      // Cap clamp: keep prior count from this app + others ≤ cap. Truncate the
      // input from the tail so the user's leading selections are preserved.
      const otherTotal = selectedTotal - (state.missions[appId]?.length ?? 0);
      const remaining = Math.max(0, MAX_DAILY_MISSIONS - otherTotal);
      const clamped = ids.slice(0, remaining);
      setState({
        ...state,
        missions: { ...state.missions, [appId]: clamped },
      });
    },
    [state, setState, selectedTotal],
  );

  return {
    state,
    pinnedApps,
    isPinned,
    activate,
    deactivate,
    toggleMission,
    setMissions,
    selectedTotal,
    isAtCap,
  };
}
