import { FC, useState, useCallback, useMemo } from 'react';
import { useAuth } from '@/features/auth';
import { ClaimAllButton } from '@nasun/wallet-ui';
import { useDailyMissions } from '@/hooks/useDailyMissions';
import { useGovernanceMission } from '@/hooks/useGovernanceMission';
import { useWalletRegistration } from '@/sections/myAccount/hooks/useWalletRegistration';
import { trackCrossAppNav, withCrossAppParam } from '@/lib/analytics';
import { UjuCard } from '../shared/UjuCard';
import type { AppEntry } from '../apps/appRegistry';
import {
  BASE_MISSIONS,
  APP_MISSION_MAP,
  makeGovernanceMission,
  getMissionBadge,
  type UjuMission,
} from '../missions/missionRegistry';

const SUI_ADDRESS_RE = /^0x[a-fA-F0-9]{64}$/;
const MAX_DISPLAYED = 7;

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
}

export const UjuDailyMissionsCard: FC<UjuDailyMissionsCardProps> = ({ pinnedApps }) => {
  const { user } = useAuth();
  const [localCompleted, setLocalCompleted] = useState<Set<string>>(new Set());
  const [visitedMissions, setVisitedMissions] = useState<Set<string>>(loadVisitedMissions);
  const [showAll, setShowAll] = useState(false);

  const { registeredWallets } = useWalletRegistration();

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

  const { hasUnvotedProposal, unvotedCount } = useGovernanceMission();

  // Build mission pool: base + pinned app missions + conditional governance
  const missionPool = useMemo(() => {
    const pool: UjuMission[] = [...BASE_MISSIONS];
    for (const app of pinnedApps) {
      const appMissions = APP_MISSION_MAP[app.id] ?? [];
      pool.push(...appMissions);
    }
    if (hasUnvotedProposal) {
      pool.push(makeGovernanceMission(unvotedCount));
    }
    return pool;
  }, [pinnedApps, hasUnvotedProposal, unvotedCount]);

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

  const displayedMissions = showAll ? missionPool : missionPool.slice(0, MAX_DISPLAYED);
  const hiddenCount = Math.max(0, missionPool.length - MAX_DISPLAYED);

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
        <p className="text-sm font-medium text-uju-secondary mb-4">Daily Missions</p>
        <div className="flex items-center justify-center py-10">
          <div className="w-5 h-5 border-2 border-uju-border border-t-pado-3 rounded-full animate-spin" />
        </div>
      </UjuCard>
    );
  }

  return (
    <UjuCard className="flex flex-col gap-0">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-uju-primary">Daily Missions</p>
          <p className="text-sm text-uju-secondary mt-0.5">
            {completedCount} / {missionPool.length} completed
          </p>
        </div>
        {/* Total potential points */}
        <span className="text-sm font-mono text-uju-secondary tabular-nums">
          +{missionPool.reduce((acc, m) => acc + (m.points ?? 0), 0)} pts max
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1 bg-uju-border rounded-full mb-4 overflow-hidden">
        <div
          className="h-full bg-pado-4 rounded-full transition-all duration-500"
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
                completed ? 'opacity-60' : 'hover:bg-white/[0.03]'
              }`}
            >
              {/* App badge */}
              <span
                className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-md ${badge.bg} ${badge.text} whitespace-nowrap`}
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
                    className={`text-sm font-medium inline-flex items-center gap-1 ${
                      completed
                        ? 'text-uju-secondary line-through'
                        : 'text-uju-primary hover:text-pado-3 transition-colors'
                    }`}
                    onClick={() => handleVisitClick(mission)}
                  >
                    {mission.label}
                    {isExternal && (
                      <svg
                        className="w-3 h-3 opacity-50 shrink-0"
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
                    className={`text-sm font-medium ${
                      completed ? 'text-uju-secondary line-through' : 'text-uju-primary'
                    }`}
                  >
                    {mission.label}
                  </span>
                )}
                {/* Points badge (onchain only) or Visited badge (visit type) */}
                {mission.completionType === 'onchain' && mission.points !== undefined && (
                  <span className="ml-2 text-xs font-mono text-uju-secondary">
                    +{mission.points}
                  </span>
                )}
                {mission.completionType === 'visit' && completed && (
                  <span className="ml-2 text-xs text-pado-4 font-medium">Visited</span>
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
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                      completed
                        ? 'bg-pado-4 border-pado-4'
                        : 'border-uju-border bg-transparent'
                    }`}
                  >
                    {completed && (
                      <svg
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
          className="mt-3 w-full py-2 text-sm text-uju-secondary border border-dashed border-uju-border rounded-lg hover:text-uju-primary hover:border-uju-secondary/50 transition-colors"
        >
          {hiddenCount} more mission{hiddenCount > 1 ? 's' : ''} hidden - Show all
        </button>
      )}
      {showAll && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="mt-3 w-full py-2 text-sm text-uju-secondary border border-dashed border-uju-border rounded-lg hover:text-uju-primary hover:border-uju-secondary/50 transition-colors"
        >
          Show top {MAX_DISPLAYED} only
        </button>
      )}
    </UjuCard>
  );
};
