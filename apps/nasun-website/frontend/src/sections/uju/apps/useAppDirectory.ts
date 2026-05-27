import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { APP_REGISTRY, VALID_APP_IDS, DEFAULT_PINNED_APPS, type AppEntry } from './appRegistry';
import { APP_MISSION_MAP, DEFAULT_MISSIONS_BY_APP, MAX_DAILY_MISSIONS } from '../missions/missionRegistry';
import { getActiveMissions, putActiveMissions } from '@/services/ecosystemScoreApi';
import { useAuth } from '@/features/auth';

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
  'gostop-crash', // Crash under maintenance — remove when game reopens
]);

// Scans raw localStorage for mission IDs that are currently under maintenance.
// Must be called BEFORE loadFromStorage, which cleans up localStorage via
// parseDirectoryState + writeJson. Once the raw store is overwritten, these
// IDs are undetectable. The result is used to show a one-time toast.
function detectMaintenanceDrops(identityId: string | undefined): string[] {
  const MAINTENANCE_IDS = new Set(['gostop-crash']);
  const raw = readJson(directoryKey(identityId));
  if (!raw || typeof raw !== 'object') return [];
  const r = raw as { missions?: unknown };
  if (!r.missions || typeof r.missions !== 'object') return [];
  const dropped: string[] = [];
  for (const ids of Object.values(r.missions as Record<string, unknown>)) {
    if (!Array.isArray(ids)) continue;
    for (const id of ids) {
      if (typeof id === 'string' && MAINTENANCE_IDS.has(id) && !dropped.includes(id)) {
        dropped.push(id);
      }
    }
  }
  return dropped;
}

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export interface AppDirectoryState {
  /**
   * Apps user explicitly Activate'd. Stays pinned even when missions[] is empty
   * (e.g. user wants the app on dashboard for non-mission features like staking,
   * or app is between campaigns and offers no active engagement).
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

// One-time per-user migration: ensure DEFAULT_PINNED_APPS are activated and
// DEFAULT_MISSIONS_BY_APP are present, even for users who already had a
// localStorage entry from earlier builds. Mirrors the historic 7-mission
// my-account list (minus chat) so users carry their familiar checklist
// into uju without manual setup.
const MIGRATION_FLAG_PREFIX = 'uju:app-directory:migrated-v6-defaults';

function migrationFlagKey(identityId: string | undefined): string {
  return identityId
    ? `${MIGRATION_FLAG_PREFIX}:${identityId}`
    : `${MIGRATION_FLAG_PREFIX}:guest`;
}

function isMigrated(identityId: string | undefined): boolean {
  try {
    return localStorage.getItem(migrationFlagKey(identityId)) === '1';
  } catch {
    return false;
  }
}

function markMigrated(identityId: string | undefined): void {
  try {
    localStorage.setItem(migrationFlagKey(identityId), '1');
  } catch {
    // tolerate quota/private-mode
  }
}

/**
 * Union the user's existing state with DEFAULT_PINNED_APPS and the per-app
 * DEFAULT_MISSIONS_BY_APP. Existing pins/selections are preserved; new
 * defaults are appended. The total mission count is clamped to
 * MAX_DAILY_MISSIONS by trimming new additions from the tail (so the user's
 * prior selections always survive even if they exceed the cap).
 */
function mergeWithDefaults(state: AppDirectoryState): AppDirectoryState {
  const validDefaultApps = DEFAULT_PINNED_APPS.filter((id) => VALID_APP_IDS.has(id));
  const explicitPinnedSet = new Set<string>(state.explicitPinned);
  for (const id of validDefaultApps) explicitPinnedSet.add(id);
  // Preserve registry order (matches APP_REGISTRY for determinism).
  const explicitPinned = APP_REGISTRY
    .map((a) => a.id)
    .filter((id) => explicitPinnedSet.has(id));

  const missions: Record<string, string[]> = { ...state.missions };
  let total = selectedMissionCount(state);

  for (const appId of validDefaultApps) {
    const defaults = DEFAULT_MISSIONS_BY_APP[appId] ?? [];
    const validMissionIds = new Set((APP_MISSION_MAP[appId] ?? []).map((m) => m.id));
    const cur = missions[appId] ?? [];
    const remaining = Math.max(0, MAX_DAILY_MISSIONS - total);
    const toAdd = defaults
      .filter((mid) => validMissionIds.has(mid) && !cur.includes(mid))
      .slice(0, remaining);
    missions[appId] = [...cur, ...toAdd];
    total += toAdd.length;
  }
  return { explicitPinned, missions };
}

/**
 * Lazy-init loader. Called from useState initializer + identityId-change effect.
 *
 * Migration path:
 *   1. New key present → parse, then on first load apply the v6-defaults
 *      migration (union the user's state with DEFAULT_PINNED_APPS +
 *      DEFAULT_MISSIONS_BY_APP, capped at MAX_DAILY_MISSIONS) and persist.
 *      Subsequent loads return the user's state untouched.
 *   2. Else, legacy `uju:pinned-apps:{id}` present → convert to new shape,
 *      apply v6-defaults migration, persist new key, KEEP legacy key.
 *   3. Else (truly fresh user) → seed defaults in-memory only (not persisted)
 *      so a deactivate-then-reload cycle stays empty.
 */
export function loadFromStorage(identityId: string | undefined): AppDirectoryState {
  const newKey = directoryKey(identityId);
  const fromNew = readJson(newKey);
  if (fromNew !== null) {
    const existing = parseDirectoryState(fromNew);
    if (isMigrated(identityId)) return existing;
    const merged = mergeWithDefaults(existing);
    writeJson(newKey, merged);
    markMigrated(identityId);
    return merged;
  }

  const legacy = readJson(legacyKey(identityId));
  if (Array.isArray(legacy)) {
    const explicitPinned = (legacy as unknown[]).filter(
      (id): id is string => typeof id === 'string' && VALID_APP_IDS.has(id),
    );
    const initial: AppDirectoryState = { explicitPinned, missions: {} };
    const merged = isMigrated(identityId) ? initial : mergeWithDefaults(initial);
    writeJson(newKey, merged);
    if (!isMigrated(identityId)) markMigrated(identityId);
    return merged;
  }

  // Fresh user: seed defaults and persist immediately. Persisting prevents a
  // mount-sync race that adopts an empty server response and leaves
  // state.missions = {} (which makes UjuDailyMissionsCard show all 8 missions
  // and todayScoring compute filteredBase = 0). The mount-sync now refuses to
  // adopt empty server records, so a deactivate-then-reload cycle is handled
  // correctly without relying on the in-memory-only seed trick.
  const fresh = mergeWithDefaults({ explicitPinned: [], missions: {} });
  writeJson(newKey, fresh);
  markMigrated(identityId);
  return fresh;
}

// ---------------------------------------------------------------------------
// Backend sync helpers
// ---------------------------------------------------------------------------

// Tracks the last time this device successfully pushed missions to the server.
// Used on mount to decide whether local or server state is newer.
const SYNC_TS_PREFIX = 'uju:missions-sync-ts';

function syncTsKey(identityId: string | undefined): string {
  return identityId ? `${SYNC_TS_PREFIX}:${identityId}` : `${SYNC_TS_PREFIX}:guest`;
}

function readSyncTs(identityId: string | undefined): number {
  try { return parseInt(localStorage.getItem(syncTsKey(identityId)) ?? '0', 10) || 0; } catch { return 0; }
}

function writeSyncTs(identityId: string | undefined, ts: number): void {
  try { localStorage.setItem(syncTsKey(identityId), String(ts)); } catch { /* tolerate */ }
}

// Inverts APP_MISSION_MAP to look up appId by category id.
const CATEGORY_TO_APP: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [appId, missions] of Object.entries(APP_MISSION_MAP)) {
    for (const mission of missions) m.set(mission.id, appId);
  }
  return m;
})();

/** Reconstructs a missions Record from a flat string[] returned by the server. */
function reconstructMissionsRecord(flat: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const id of flat) {
    const appId = CATEGORY_TO_APP.get(id);
    if (!appId) continue;
    if (!out[appId]) out[appId] = [];
    out[appId].push(id);
  }
  return out;
}

/** Flattens the missions Record to a string[] for the server API. */
function getFlatMissions(missions: Record<string, string[]>): string[] {
  return Object.values(missions).flat();
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
  droppedForMaintenanceOnMount: string[];
}

export function useAppDirectory(identityId: string | undefined): UseAppDirectoryResult {
  // /ecosystem/active-missions is now self-only; carry the JWT for both the
  // mount-time pull/push and the debounced change-sync writer. A ref keeps
  // the latest token visible to the debounced writer without retriggering
  // its effect every render.
  const { user } = useAuth();
  const cognitoToken = user?.cognitoToken;
  const tokenRef = useRef(cognitoToken);
  tokenRef.current = cognitoToken;

  // Must be declared BEFORE the state useState so its initializer runs first,
  // while localStorage still contains the raw (un-cleaned) data. loadFromStorage
  // calls parseDirectoryState + writeJson which removes STALE_MISSION_IDS from
  // localStorage; scanning after that would always return an empty array.
  const [droppedForMaintenanceOnMount] = useState<string[]>(() =>
    detectMaintenanceDrops(identityId),
  );

  const [state, setStateRaw] = useState<AppDirectoryState>(() =>
    loadFromStorage(identityId),
  );

  // identityId switch (logout + login as another user). Lazy initializer only
  // fires on first mount, so swap state synchronously here to prevent stale
  // flashes from the previous identity.
  useEffect(() => {
    setStateRaw(loadFromStorage(identityId));
  }, [identityId]);

  // Mount sync: pull-then-push for multi-device consistency.
  // On each identityId mount, fetch the server's current selection. If the
  // server timestamp is newer than the last local sync AND the server has a
  // non-empty mission list, adopt the server state (another device may have
  // changed missions). Otherwise push local to server so the server has the
  // latest selection for the midnight snapshot.
  //
  // An empty server array is treated as "no record" (the snapshot job already
  // falls back to DEFAULT_MISSION_IDS in that case). Adopting an empty
  // response would wipe out the in-memory defaults seeded by mergeWithDefaults
  // and leave state.missions = {}, which makes UjuDailyMissionsCard fall back
  // to "show all" (8 missions) and todayScoring compute filteredBase = 0.
  useEffect(() => {
    if (!identityId || !cognitoToken) return;
    let cancelled = false;
    (async () => {
      try {
        const serverData = await getActiveMissions(identityId, cognitoToken);
        if (cancelled) return;
        const serverHasMissions =
          Array.isArray(serverData?.missions) && serverData!.missions!.length > 0;
        const serverTs = serverData?.updatedAt
          ? new Date(serverData.updatedAt).getTime()
          : 0;
        const localTs = readSyncTs(identityId);
        if (serverHasMissions && serverTs > localTs) {
          // Server is newer and non-empty: adopt server missions, keep local
          // explicitPinned (so deactivated-but-no-mission apps stay hidden).
          const serverMissionsRecord = reconstructMissionsRecord(serverData!.missions!);
          setStateRaw((prev) => {
            const merged: AppDirectoryState = {
              explicitPinned: prev.explicitPinned,
              missions: serverMissionsRecord,
            };
            writeJson(directoryKey(identityId), merged);
            writeSyncTs(identityId, serverTs);
            return merged;
          });
        } else {
          // Local is newer or server has no usable record: push local to
          // server. This also overwrites a stale empty-array record with the
          // user's actual defaults, healing devices that previously adopted
          // an empty response.
          const local = loadFromStorage(identityId);
          const flat = getFlatMissions(local.missions);
          if (flat.length > 0) {
            await putActiveMissions(identityId, flat, cognitoToken);
            writeSyncTs(identityId, Date.now());
          }
        }
      } catch (e) {
        console.warn('[useAppDirectory] mount sync failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [identityId, cognitoToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // Change sync: push missions to server on every selection change (debounced).
  // Ensures the midnight snapshot job sees the user's final choice for the day.
  // Skip empty pushes — the backend rejects them (400 missions_empty), and
  // pushing nothing avoids accidentally telegraphing a transient empty state.
  useEffect(() => {
    if (!identityId) return;
    const flat = getFlatMissions(state.missions);
    if (flat.length === 0) return;
    const timer = setTimeout(() => {
      const token = tokenRef.current;
      if (!token) return; // wallet-login users without a JWT cannot push
      putActiveMissions(identityId, flat, token).then(() => {
        writeSyncTs(identityId, Date.now());
      }).catch((e) => console.warn('[useAppDirectory] change sync failed:', e));
    }, 500);
    return () => clearTimeout(timer);
  }, [state.missions, identityId]);

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
    droppedForMaintenanceOnMount,
  };
}
