import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/features/auth';
import type { TraderConfig } from '../types/trader';
import { getConfigByAgent, saveConfig, deleteConfig } from '../services/traderConfigStorage';

export interface UseTraderConfigResult {
  config: TraderConfig | null;
  loading: boolean;
  error: string | null;
  save: (
    next: Omit<TraderConfig, 'id' | 'walletAddress' | 'createdAt' | 'updatedAt'>,
  ) => Promise<TraderConfig | null>;
  remove: () => Promise<void>;
  refetch: () => Promise<void>;
}

export function useTraderConfig(agentAddress: string | null): UseTraderConfigResult {
  const { user } = useAuth();
  const walletAddress = user?.walletAddress ?? null;
  const [config, setConfig] = useState<TraderConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!walletAddress || !agentAddress) {
      setConfig(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const c = await getConfigByAgent(walletAddress, agentAddress);
      setConfig(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load trader config');
    } finally {
      setLoading(false);
    }
  }, [walletAddress, agentAddress]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback<UseTraderConfigResult['save']>(
    async (next) => {
      if (!walletAddress || !agentAddress) return null;
      const now = Date.now();
      const merged: TraderConfig = {
        id: agentAddress,
        walletAddress,
        createdAt: config?.createdAt ?? now,
        updatedAt: now,
        ...next,
      };
      try {
        await saveConfig(merged);
        setConfig(merged);
        return merged;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save trader config');
        return null;
      }
    },
    [walletAddress, agentAddress, config?.createdAt],
  );

  const remove = useCallback(async () => {
    if (!walletAddress || !agentAddress) return;
    await deleteConfig(walletAddress, agentAddress, agentAddress);
    setConfig(null);
  }, [walletAddress, agentAddress]);

  return { config, loading, error, save, remove, refetch: load };
}
