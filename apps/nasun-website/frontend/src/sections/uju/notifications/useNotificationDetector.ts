import { useEffect, useRef } from 'react';
import { useNotificationStore } from './notificationStore';
import type { UjuMission } from '../missions/missionRegistry';
import type { MissionId } from '@/hooks/useDailyMissions';

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

interface DetectorProps {
  identityId: string | undefined;
  missionPool: UjuMission[];
  completedMissions: Set<MissionId>;
  missionsLoading: boolean;
  hasUnvotedProposal: boolean;
  unvotedCount: number;
}

export function useNotificationDetector({
  identityId,
  missionPool,
  completedMissions,
  missionsLoading,
  hasUnvotedProposal,
  unvotedCount,
}: DetectorProps): void {
  const add = useNotificationStore((s) => s.add);

  // In-memory session tracking — no localStorage, resets on page refresh
  const seenRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const prevPoolOnchainRef = useRef<Set<string>>(new Set());

  // Reset all refs and clear notification store on account switch (prevents cross-account leakage)
  useEffect(() => {
    seenRef.current = new Set();
    initializedRef.current = false;
    prevPoolOnchainRef.current = new Set();
    useNotificationStore.getState().clearAll();
  }, [identityId]);

  // Mission completion detection
  useEffect(() => {
    if (!identityId || missionsLoading) return;

    const currentOnchainIds = new Set(
      missionPool.filter((m) => m.completionType === 'onchain').map((m) => m.id),
    );

    // First load: absorb all currently-completed missions without alerting (mount-time spam prevention)
    if (!initializedRef.current) {
      initializedRef.current = true;
      completedMissions.forEach((id) => seenRef.current.add(id));
      prevPoolOnchainRef.current = currentOnchainIds;
      return;
    }

    // Pool grew (new app pinned): absorb any already-completed IDs from newly-added missions silently
    // Prevents stale "Mission Complete" alerts when user pins an app with pre-completed missions
    for (const id of currentOnchainIds) {
      if (!prevPoolOnchainRef.current.has(id) && completedMissions.has(id as MissionId)) {
        seenRef.current.add(id);
      }
    }
    prevPoolOnchainRef.current = currentOnchainIds;

    // Detect newly completed missions since last poll
    const missionById = new Map(missionPool.map((m) => [m.id, m]));
    const today = todayUtc();
    const now = Date.now();

    for (const id of completedMissions) {
      if (seenRef.current.has(id)) continue;
      seenRef.current.add(id);

      const mission = missionById.get(id);
      add({
        id: `mission:${id}:${today}`,
        type: 'mission',
        title: 'Mission Complete',
        body: mission
          ? `${mission.label}${mission.points ? ` +${mission.points} pts` : ''}`
          : id,
        timestamp: now,
        read: false,
      });
    }
  }, [completedMissions, missionsLoading, identityId, missionPool, add]);

  // Governance proposal detection
  // Reads store state lazily (getState) to avoid re-subscribing on every store mutation
  useEffect(() => {
    if (!identityId || !hasUnvotedProposal || unvotedCount === 0) return;

    const today = todayUtc();
    const store = useNotificationStore.getState();
    if (store.notifications.some((n) => n.id === `governance:${today}`)) return;

    store.add({
      id: `governance:${today}`,
      type: 'governance',
      title: 'New Governance Proposal',
      body: `${unvotedCount} proposal${unvotedCount > 1 ? 's' : ''} awaiting your vote`,
      timestamp: Date.now(),
      read: false,
      actionUrl: '/network/governance',
    });
  }, [hasUnvotedProposal, unvotedCount, identityId]);
}
