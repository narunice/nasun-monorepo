import { useState, useCallback, useEffect, useMemo } from 'react';
import { APP_REGISTRY, VALID_APP_IDS, type AppEntry } from './appRegistry';

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
      // app-id filter is sufficient: stale mission ids are dropped at render
      // time in UjuDailyMissionsCard via APP_MISSION_MAP intersection.
      missions[appId] = (ids as unknown[]).filter(
        (x): x is string => typeof x === 'string',
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
 *   1. New key present → parse and return.
 *   2. Else, legacy `uju:pinned-apps:{id}` present → migrate to new shape,
 *      write new key, KEEP legacy key (rollback safety; cleaned in a later PR).
 *   3. Else → empty state.
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

  return { ...EMPTY_STATE };
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
  // concurrently. Multi-tab `storage` event listener intentionally omitted in
  // PR1 (single-tab is the 99% case); revisit if user feedback demands it.
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
      setState({
        ...state,
        explicitPinned: [...state.explicitPinned, id],
      });
    },
    [state, setState],
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
      const next = cur.includes(missionId)
        ? cur.filter((id) => id !== missionId)
        : [...cur, missionId];
      setState({
        ...state,
        missions: { ...state.missions, [appId]: next },
      });
    },
    [state, setState],
  );

  const setMissions = useCallback(
    (appId: string, ids: string[]) => {
      if (!VALID_APP_IDS.has(appId)) return;
      setState({
        ...state,
        missions: { ...state.missions, [appId]: ids },
      });
    },
    [state, setState],
  );

  return {
    state,
    pinnedApps,
    isPinned,
    activate,
    deactivate,
    toggleMission,
    setMissions,
  };
}
