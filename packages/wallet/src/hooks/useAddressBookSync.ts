/**
 * Address Book Sync Hook
 * Automatically syncs address book with server when configured.
 * - Loads from server on login (identityId change)
 * - Auto-saves on changes with 5s debounce
 * - Handles 409 conflicts with re-fetch + merge + retry
 * - Clears local data on logout
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useAddressBook } from './useAddressBook';
import {
  isAddressBookSyncEnabled,
  fetchAddressBookFromServer,
  pushAddressBookToServer,
} from '../core/addressBookSync';

// Module-level flag to prevent sync loop:
// When we load from server and call mergeEntries/setEntries, the store update
// triggers the subscribe callback which would try to push back to server.
let _isSyncingFromServer = false;

// Module-level version tracker (not React state to avoid re-renders)
let _serverVersion = 0;

const DEBOUNCE_MS = 5000;

export interface UseAddressBookSyncOptions {
  /** Current user's identity ID. null = logged out. */
  identityId: string | null | undefined;
}

export interface UseAddressBookSyncResult {
  isSyncing: boolean;
  lastSyncedAt: number | null;
  syncNow: () => Promise<void>;
}

export function useAddressBookSync({ identityId }: UseAddressBookSyncOptions): UseAddressBookSyncResult {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPushRef = useRef(false);
  const identityIdRef = useRef(identityId);
  identityIdRef.current = identityId;

  // Load from server and merge with local
  const loadFromServer = useCallback(async (signal?: AbortSignal) => {
    if (!isAddressBookSyncEnabled()) return;

    setIsSyncing(true);
    _isSyncingFromServer = true;

    try {
      const result = await fetchAddressBookFromServer(signal);
      if (!result || signal?.aborted) return;

      _serverVersion = result.version;

      const localEntries = useAddressBook.getState().addressBook.entries;
      const hasLocalData = Object.keys(localEntries).length > 0;
      const hasServerData = Object.keys(result.addressBook.entries).length > 0;

      if (hasServerData) {
        // Merge server data with local
        useAddressBook.getState().mergeEntries(result.addressBook.entries);
        setLastSyncedAt(Date.now());
      } else if (hasLocalData) {
        // Initial migration: local has data but server is empty
        // Push local data to server
        _isSyncingFromServer = false; // Allow push
        await pushToServer();
      }
    } finally {
      _isSyncingFromServer = false;
      setIsSyncing(false);
    }
  }, []);

  // Push local data to server with conflict handling
  const pushToServer = useCallback(async () => {
    if (!isAddressBookSyncEnabled()) return;

    const addressBook = useAddressBook.getState().addressBook;
    const result = await pushAddressBookToServer(addressBook, _serverVersion);

    if (result === 'success') {
      _serverVersion += 1;
      setLastSyncedAt(Date.now());
    } else if (result === 'conflict') {
      // Re-fetch, merge, and retry once
      _isSyncingFromServer = true;
      try {
        const fresh = await fetchAddressBookFromServer();
        if (fresh) {
          _serverVersion = fresh.version;
          useAddressBook.getState().mergeEntries(fresh.addressBook.entries);
        }
      } finally {
        _isSyncingFromServer = false;
      }

      // Retry push once
      const retryData = useAddressBook.getState().addressBook;
      const retryResult = await pushAddressBookToServer(retryData, _serverVersion);
      if (retryResult === 'success') {
        _serverVersion += 1;
        setLastSyncedAt(Date.now());
      }
      // If retry also fails, give up silently. Next change will retry.
    }
    // null result (network error) = give up silently
  }, []);

  // Debounced push
  const schedulePush = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    pendingPushRef.current = true;
    debounceRef.current = setTimeout(async () => {
      debounceRef.current = null;
      pendingPushRef.current = false;
      await pushToServer();
    }, DEBOUNCE_MS);
  }, [pushToServer]);

  // Flush pending changes immediately
  const flushPending = useCallback(async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (pendingPushRef.current) {
      pendingPushRef.current = false;
      await pushToServer();
    }
  }, [pushToServer]);

  // Manual sync
  const syncNow = useCallback(async () => {
    await flushPending();
    await loadFromServer();
  }, [flushPending, loadFromServer]);

  // Subscribe to store changes for auto-push
  useEffect(() => {
    if (!identityId || !isAddressBookSyncEnabled()) return;

    const unsub = useAddressBook.subscribe(
      (state, prevState) => {
        if (_isSyncingFromServer) return;
        if (state.addressBook.updatedAt === prevState.addressBook.updatedAt) return;
        schedulePush();
      },
    );

    return () => {
      unsub();
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [identityId, schedulePush]);

  // Load on login, clear on logout
  useEffect(() => {
    if (!isAddressBookSyncEnabled()) return;

    // Cancel any in-flight request from previous identity
    abortRef.current?.abort();

    if (identityId) {
      const controller = new AbortController();
      abortRef.current = controller;
      _serverVersion = 0;
      loadFromServer(controller.signal);
    } else {
      // Logged out: clear local data
      useAddressBook.getState().clearAll();
      _serverVersion = 0;
      setLastSyncedAt(null);
    }

    return () => {
      abortRef.current?.abort();
    };
  }, [identityId, loadFromServer]);

  // Flush on visibility change (tab hidden / app switch)
  useEffect(() => {
    if (!identityId || !isAddressBookSyncEnabled()) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && pendingPushRef.current) {
        // Best-effort flush with keepalive
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
        pendingPushRef.current = false;
        const addressBook = useAddressBook.getState().addressBook;
        pushAddressBookToServer(addressBook, _serverVersion, { keepalive: true });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [identityId]);

  return { isSyncing, lastSyncedAt, syncNow };
}
