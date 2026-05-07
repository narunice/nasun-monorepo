import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { toast } from 'react-toastify';
import { useAppDirectory, type UseAppDirectoryResult } from './useAppDirectory';

// Single source of truth for App Directory state across uju surfaces. Both
// DashboardTab and ActivityTab consume this context, so a write from one
// (toggleMission, activate, etc.) is reflected in the other without going
// through localStorage. Without this provider, each tab held its own
// useAppDirectory instance and the last-write-wins race could clobber
// concurrent edits within the same browser tab.
const Ctx = createContext<UseAppDirectoryResult | null>(null);

export interface UjuAppDirectoryProviderProps {
  identityId: string | undefined;
  children: ReactNode;
}

export function UjuAppDirectoryProvider({ identityId, children }: UjuAppDirectoryProviderProps) {
  const value = useAppDirectory(identityId);

  const { droppedForMaintenanceOnMount } = value;
  useEffect(() => {
    if (droppedForMaintenanceOnMount.length === 0) return;
    toast.info(
      'Crash is temporarily offline for maintenance and has been removed from your active engagements. Please add another game to keep earning points.',
      { toastId: 'crash-maintenance', autoClose: 8000 },
    );
  }, [droppedForMaintenanceOnMount]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUjuAppDirectory(): UseAppDirectoryResult {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error('useUjuAppDirectory must be used within UjuAppDirectoryProvider');
  }
  return v;
}
