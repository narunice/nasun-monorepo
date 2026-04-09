/**
 * useFollowedTraders Hook
 *
 * Server-first follow system with localStorage fallback (unauthenticated).
 * On first auth: migrates localStorage follows to server (burst window).
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getChatService } from '../../../lib/chat-service';
import type { ChatEventMap } from '../../../lib/chat-service';

const STORAGE_KEY = 'pado-followed-traders';
const MIGRATION_FLAG_KEY = 'pado-follows-migrated';
const MAX_FOLLOWED = 50;

// Module-level state shared across instances (single React root, client-only)
let serverFollows: string[] | null = null;
let moduleListeners: Array<() => void> = [];
// Snapshots for optimistic rollback: target address -> pre-mutation state
const optimisticSnapshots = new Map<string, string[]>();

function notifyListeners() {
  moduleListeners.forEach((l) => l());
}

function getLocalFollows(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string').slice(0, MAX_FOLLOWED);
  } catch {
    return [];
  }
}

function setLocalFollows(addresses: string[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(addresses));
}

/** @internal Reset module state for tests only */
export function _resetForTesting(): void {
  serverFollows = null;
  moduleListeners = [];
}

export interface UseFollowedTradersResult {
  followedAddresses: string[];
  isFollowing: (addr: string) => boolean;
  toggleFollow: (addr: string) => void;
  followCount: number;
  isMigrating: boolean;
}

export function useFollowedTraders(): UseFollowedTradersResult {
  const chatService = getChatService();
  const isConnected = chatService.getStatus() === 'connected';

  const [followedAddresses, setFollowedAddresses] = useState<string[]>(
    () => serverFollows ?? getLocalFollows()
  );
  const [isMigrating, setIsMigrating] = useState(false);
  const migrationInProgress = useRef(false);

  // Listen for server follow events + connection state
  useEffect(() => {
    const listener = () => {
      setFollowedAddresses(serverFollows ?? getLocalFollows());
    };
    moduleListeners.push(listener);

    const unsubFollowResult = chatService.on('follow_result', (data: ChatEventMap['follow_result']) => {
      if (data.error) {
        // Rollback optimistic update: restore from snapshot
        const snapshot = optimisticSnapshots.get(data.target.toLowerCase());
        if (snapshot) {
          serverFollows = snapshot;
          optimisticSnapshots.delete(data.target.toLowerCase());
          notifyListeners();
        }
        return;
      }
      // Confirm optimistic update, clear snapshot
      optimisticSnapshots.delete(data.target.toLowerCase());
      // Reconcile with authoritative server state
      if (serverFollows) {
        const target = data.target.toLowerCase();
        if (data.following) {
          if (!serverFollows.includes(target)) {
            serverFollows = [...serverFollows, target];
          }
        } else {
          serverFollows = serverFollows.filter((a) => a !== target);
        }
        notifyListeners();
      }
    });

    const unsubFollowingList = chatService.on('following_list', (data: ChatEventMap['following_list']) => {
      serverFollows = data.addresses;
      notifyListeners();
    });

    const unsubStatus = chatService.on('status', (status) => {
      if (status === 'connected') {
        // Request follow list from server
        chatService.getFollowing();
      }
      if (status === 'disconnected') {
        serverFollows = null;
        notifyListeners();
      }
    });

    // If already connected, request follows
    if (chatService.getStatus() === 'connected') {
      chatService.getFollowing();
    }

    return () => {
      moduleListeners = moduleListeners.filter((l) => l !== listener);
      unsubFollowResult();
      unsubFollowingList();
      unsubStatus();
    };
  }, [chatService]);

  // Migration: sync localStorage follows to server on first auth
  useEffect(() => {
    if (!isConnected || serverFollows === null || migrationInProgress.current) return;

    try {
      const alreadyMigrated = localStorage.getItem(MIGRATION_FLAG_KEY) === 'true';
      if (alreadyMigrated) return;
    } catch {
      return;
    }

    const localFollows = getLocalFollows();
    if (localFollows.length === 0) {
      // Nothing to migrate
      try { localStorage.setItem(MIGRATION_FLAG_KEY, 'true'); } catch { /* ignore */ }
      return;
    }

    // Find addresses in localStorage but not on server
    const serverSet = new Set(serverFollows.map((a) => a.toLowerCase()));
    const toMigrate = localFollows.filter((a) => !serverSet.has(a.toLowerCase()));

    if (toMigrate.length === 0) {
      try { localStorage.setItem(MIGRATION_FLAG_KEY, 'true'); } catch { /* ignore */ }
      return;
    }

    // Sequentially send toggle_follow for each (server burst window allows rapid fire)
    migrationInProgress.current = true;
    setIsMigrating(true);

    let idx = 0;
    const sendNext = () => {
      if (idx >= toMigrate.length) {
        migrationInProgress.current = false;
        setIsMigrating(false);
        try { localStorage.setItem(MIGRATION_FLAG_KEY, 'true'); } catch { /* ignore */ }
        return;
      }
      chatService.toggleFollow(toMigrate[idx]);
      idx++;
      // Small delay to avoid flooding (server allows burst but be courteous)
      setTimeout(sendNext, 50);
    };
    sendNext();
  }, [isConnected, serverFollows, chatService]);

  const isFollowing = useCallback(
    (addr: string) => {
      const normalizedAddr = addr.toLowerCase();
      return followedAddresses.some((a) => a.toLowerCase() === normalizedAddr);
    },
    [followedAddresses],
  );

  const toggleFollow = useCallback(
    (addr: string) => {
      if (isConnected && serverFollows !== null) {
        // Server mode: save snapshot for rollback, then optimistic update + WS toggle
        const normalizedAddr = addr.toLowerCase();
        optimisticSnapshots.set(normalizedAddr, [...serverFollows]);

        const currentlyFollowing = serverFollows.some((a) => a.toLowerCase() === normalizedAddr);
        if (currentlyFollowing) {
          serverFollows = serverFollows.filter((a) => a.toLowerCase() !== normalizedAddr);
        } else {
          if (serverFollows.length >= MAX_FOLLOWED) {
            optimisticSnapshots.delete(normalizedAddr);
            return;
          }
          serverFollows = [...serverFollows, normalizedAddr];
        }
        notifyListeners();
        chatService.toggleFollow(addr);
      } else {
        // Fallback: localStorage only (case-insensitive comparison)
        const current = getLocalFollows();
        const normalizedAddr = addr.toLowerCase();
        if (current.some((a) => a.toLowerCase() === normalizedAddr)) {
          const updated = current.filter((a) => a.toLowerCase() !== normalizedAddr);
          setLocalFollows(updated);
          setFollowedAddresses(updated);
        } else {
          if (current.length >= MAX_FOLLOWED) return;
          const updated = [...current, addr];
          setLocalFollows(updated);
          setFollowedAddresses(updated);
        }
        notifyListeners();
      }
    },
    [isConnected, chatService],
  );

  return {
    followedAddresses,
    isFollowing,
    toggleFollow,
    followCount: followedAddresses.length,
    isMigrating,
  };
}
