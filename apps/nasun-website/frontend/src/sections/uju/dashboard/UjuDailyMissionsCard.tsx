import { FC, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { ClaimAllButton } from '@nasun/wallet-ui';
import { useDailyMissions } from '@/hooks/useDailyMissions';
import { useUjuWalletRegistration } from '../hooks/useUjuWalletRegistration';
import { trackCrossAppNav, withCrossAppParam } from '@/lib/analytics';
import { UjuCard } from '../shared/UjuCard';
import { UjuAccentBar } from '../shared/UjuAccentBar';
import { UjuButton } from '../shared/UjuButton';
import type { AppEntry } from '../apps/appRegistry';
import {
  APP_MISSION_MAP,
  DEFAULT_MISSIONS_BY_APP,
  MAX_DAILY_MISSIONS,
  getMissionBadge,
  type UjuMission,
} from '../missions/missionRegistry';
import { useNotificationDetector } from '../notifications/useNotificationDetector';

const SUI_ADDRESS_RE = /^0x[a-fA-F0-9]{64}$/;

// UTC date string for localStorage keying (visit missions reset at midnight UTC)
function getTodayUtcStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadVisitedMissions(): Set<string> {
  try {
    const key = `uju:visited-missions:${getTodayUtcStr()}`;
    return new Set(JSON.parse(localStorage.getItem(key) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function saveVisitedMission(id: string, current: Set<string>): Set<string> {
  const next = new Set(current).add(id);
  try {
    localStorage.setItem(`uju:visited-missions:${getTodayUtcStr()}`, JSON.stringify([...next]));
  } catch { /* storage quota or private mode */ }
  return next;
}

interface UjuDailyMissionsCardProps {
  pinnedApps: AppEntry[];
  /**
   * Per-app user-selected mission ids.
   *   undefined for an appId → user has never opened that app's checklist;
   *                              fallback shows ALL of the app's missions.
   *   []                     → explicitly emptied; show 0.
   */
  missionsByApp: Record<string, string[]>;
}

export const UjuDailyMissionsCard: FC<UjuDailyMissionsCardProps> = ({
  pinnedApps,
  missionsByApp,
}) => {
  const { user } = useAuth();
  const [, setSearchParams] = useSearchParams();
  const [localCompleted, setLocalCompleted] = useState<Set<string>>(new Set());
  const [visitedMissions, setVisitedMissions] = useState<Set<string>>(loadVisitedMissions);
  const [showAll, setShowAll] = useState(false);

  const { registeredWallets } = useUjuWalletRegistration();

  const allWalletAddresses = useMemo(() => {
    const addrs = new Set<string>();
    const primary =
      user?.linkedAccounts?.['nasun wallet']?.walletAddress ?? user?.walletAddress;
    if (primary && SUI_ADDRESS_RE.test(primary)) addrs.add(primary);
    for (const w of registeredWallets) {
      if (SUI_ADDRESS_RE.test(w.walletAddress)) addrs.add(w.walletAddress);
    }
    return [...addrs];
  }, [user, registeredWallets]);

  const { completedMissions, isLoading, refetch } = useDailyMissions(
    user?.identityId,
    allWalletAddresses,
  );

  // PR3b: BASE_MISSIONS removed. faucet/wallet-transfer now belong to the
  // nasun-devnet app and are shown only when the user has it activated
  // (fresh users are auto-pinned to nasun-devnet via DEFAULT_PINNED_APPS).
  // Governance mission is no longer surfaced here; myAccount/DailyMissionsCard
  // keeps it as an independent surface.
  //
  // Fallback for missing per-app selection: use the curated
  // DEFAULT_MISSIONS_BY_APP subset, NOT every mission in the registry.
  // Without this, gostop ends up showing all 5 games (8 total missions) when
  // the per-app key is undefined, while my-account/back-end both compute
  // against the 6-default set, breaking parity across surfaces.
  const missionPool = useMemo(() => {
    const pool: UjuMission[] = [];
    for (const app of pinnedApps) {
      const appMissions = APP_MISSION_MAP[app.id] ?? [];
      const allowedIds = missionsByApp[app.id];
      // `undefined` for this app key → seed the curated defaults for it.
      // `[]` → user explicitly emptied this app's missions; show 0 rows.
      // Non-empty array → respect the user's selection verbatim.
      const fallbackIds = DEFAULT_MISSIONS_BY_APP[app.id] ?? appMissions.map((m) => m.id);
      const effectiveIds = allowedIds ?? fallbackIds;
      const filtered = appMissions.filter((m) => effectiveIds.includes(m.id));
      pool.push(...filtered);
    }
    return pool;
  }, [pinnedApps, missionsByApp]);

  // Fire notification detector after missionPool is computed, before early return
  useNotificationDetector({
    identityId: user?.identityId,
    missionPool,
    completedMissions,
    missionsLoading: isLoading,
    hasUnvotedProposal: false,
    unvotedCount: 0,
  });

  const isCompleted = useCallback(
    (m: UjuMission) => {
      if (m.completionType === 'visit') return visitedMissions.has(m.id);
      return (completedMissions as Set<string>).has(m.id) || localCompleted.has(m.id);
    },
    [completedMissions, localCompleted, visitedMissions],
  );

  const completedCount = useMemo(
    () => missionPool.filter(isCompleted).length,
    [missionPool, isCompleted],
  );

  const displayedMissions = showAll ? missionPool : missionPool.slice(0, MAX_DAILY_MISSIONS);
  const hiddenCount = Math.max(0, missionPool.length - MAX_DAILY_MISSIONS);

  const handleFaucetSuccess = useCallback(() => {
    setLocalCompleted((prev) => new Set(prev).add('faucet'));
    refetch();
  }, [refetch]);

  const handleVisitClick = useCallback((mission: UjuMission) => {
    if (mission.completionType === 'visit') {
      setVisitedMissions((prev) => saveVisitedMission(mission.id, prev));
    }
    if (mission.externalUrl?.startsWith('https://pado.finance')) {
      trackCrossAppNav('pado', new URL(mission.externalUrl).pathname);
    }
  }, []);

  const progressPct =
    missionPool.length > 0 ? (completedCount / missionPool.length) * 100 : 0;

  if (isLoading) {
    return (
      <UjuCard>
        <h3 className="text-lg sm:text-xl font-semibold text-uju-primary mb-4">Daily Missions</h3>
        <div className="flex items-center justify-center py-10">
          <div className="w-5 h-5 border-2 border-uju-border border-t-pado-2 rounded-full animate-spin" />
        </div>
      </UjuCard>
    );
  }

  // Pre-multiplier base "score" (NOT points). Multiplier × score = ecosystem
  // points; the missions themselves award score, so the header label says
  // "score max" to keep the points/score distinction explicit in the UI.
  const maxScore = missionPool.reduce((acc, m) => acc + (m.points ?? 0), 0);

  if (missionPool.length === 0) {
    return (
      <UjuCard variant="accent" className="flex flex-col gap-0">
        <div className="flex items-start gap-3 mb-3">
          <UjuAccentBar />
          <div className="min-w-0">
            <h3 className="text-lg sm:text-xl font-semibold text-white">Daily Missions</h3>
            <p className="text-base text-pado-2 mt-0.5">No missions activated yet.</p>
          </div>
        </div>
        <p className="text-base text-uju-secondary mb-4">
          Activate apps in the Activity tab to add their daily missions to your dashboard.
        </p>
        <UjuButton
          variant="secondary"
          size="sm"
          onClick={() => setSearchParams({ tab: 'activity' }, { replace: true })}
        >
          Activate apps in Activity tab →
        </UjuButton>
      </UjuCard>
    );
  }

  return (
    <UjuCard variant="accent" className="flex flex-col gap-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0">
          <UjuAccentBar />
          <div className="min-w-0">
            <h3 className="text-lg sm:text-xl font-semibold text-white">Daily Missions</h3>
            <p className="text-base text-pado-2 mt-0.5 tabular-nums">
              {completedCount} / {missionPool.length} completed
            </p>
          </div>
        </div>
        <span className="text-base font-mono text-pado-2 tabular-nums shrink-0">
          +{maxScore} score max
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-uju-border rounded-full mb-4 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-pado-1 via-pado-2 to-pado-5 rounded-full transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Mission list */}
      <div className="space-y-1">
        {displayedMissions.map((mission) => {
          const completed = isCompleted(mission);
          const badge = getMissionBadge(mission);
          const isExternal = mission.externalUrl && !mission.externalUrl.startsWith('/');

          return (
            <div
              key={mission.id}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                completed ? '' : 'hover:bg-white/[0.03]'
              }`}
            >
              {/* App badge */}
              <span
                className={`shrink-0 text-sm font-light px-2 py-0.5 rounded-md whitespace-nowrap ${
                  completed ? 'bg-uju-border/30 text-uju-secondary' : `${badge.bg} ${badge.text}`
                }`}
              >
                {badge.label}
              </span>

              {/* Mission label */}
              <div className="flex-1 min-w-0">
                {mission.externalUrl ? (
                  <a
                    href={
                      mission.externalUrl.startsWith('https://pado.finance')
                        ? withCrossAppParam(mission.externalUrl, 'nasun')
                        : mission.externalUrl
                    }
                    target={isExternal ? '_blank' : undefined}
                    rel={isExternal ? 'noopener noreferrer' : undefined}
                    className={`text-base font-light inline-flex items-center gap-1 ${
                      completed
                        ? 'text-uju-secondary line-through'
                        : 'text-uju-primary hover:text-pado-2 transition-colors'
                    }`}
                    onClick={() => handleVisitClick(mission)}
                  >
                    {mission.label}
                    {isExternal && (
                      <svg
                        aria-hidden="true"
                        className="w-3 h-3 text-uju-secondary shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                    )}
                  </a>
                ) : (
                  <span
                    className={`text-base font-light ${
                      completed ? 'text-uju-secondary line-through' : 'text-uju-primary'
                    }`}
                  >
                    {mission.label}
                  </span>
                )}
                {/* Points badge (onchain only) or Visited badge (visit type) */}
                {mission.completionType === 'onchain' && mission.points !== undefined && (
                  <span className="ml-2 text-base font-mono text-pado-2">
                    +{mission.points}
                  </span>
                )}
                {mission.completionType === 'visit' && completed && (
                  <span className="ml-2 text-base text-pado-4 font-light">Visited</span>
                )}
              </div>

              {/* Right side: faucet button or checkbox */}
              <div className="shrink-0 flex items-center gap-2">
                {mission.showFaucet && !completed ? (
                  <div className="w-36">
                    <ClaimAllButton persistent onSuccess={handleFaucetSuccess} />
                  </div>
                ) : (
                  // Circle checkbox on the right (as per wireframe)
                  <div
                    role="img"
                    aria-label={completed ? 'Completed' : 'Incomplete'}
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                      completed
                        ? 'bg-pado-4 border-pado-4'
                        : 'border-uju-border bg-transparent'
                    }`}
                  >
                    {completed && (
                      <svg
                        aria-hidden="true"
                        className="w-3 h-3 text-uju-bg"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Overflow control */}
      {!showAll && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-3 w-full py-2 text-base text-uju-secondary border border-dashed border-uju-border rounded-lg hover:text-uju-primary hover:border-uju-secondary/50 transition-colors"
        >
          {hiddenCount} more mission{hiddenCount > 1 ? 's' : ''} hidden - Show all
        </button>
      )}
      {showAll && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="mt-3 w-full py-2 text-base text-uju-secondary border border-dashed border-uju-border rounded-lg hover:text-uju-primary hover:border-uju-secondary/50 transition-colors"
        >
          Show top {MAX_DAILY_MISSIONS} only
        </button>
      )}
    </UjuCard>
  );
};
