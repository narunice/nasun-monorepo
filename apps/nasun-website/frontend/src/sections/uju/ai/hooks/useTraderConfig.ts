import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/features/auth';
import { useSigner } from '@nasun/wallet';
import type { TraderConfig } from '../types/trader';
import {
  getConfigByAgentDetailed,
  saveConfig,
  deleteConfig,
  type TraderConfigReadResult,
} from '../services/traderConfigStorage';

export interface UseTraderConfigResult {
  config: TraderConfig | null;
  /**
   * Where the current `config` came from:
   *   - 'server': authoritative chat-server fetch (fresh truth)
   *   - 'cache':  server unreachable; using IndexedDB copy (may be stale)
   *   - 'none':   neither source has a row for this agent
   * UIs that want to warn the user about possibly-stale data can branch
   * on `source === 'cache'`.
   */
  source: TraderConfigReadResult['source'];
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
  const { signer } = useSigner();
  const walletAddress = user?.walletAddress ?? null;
  const [config, setConfig] = useState<TraderConfig | null>(null);
  const [source, setSource] = useState<TraderConfigReadResult['source']>('none');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!walletAddress || !agentAddress) {
      setConfig(null);
      setSource('none');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await getConfigByAgentDetailed(walletAddress, agentAddress);
      setConfig(r.config);
      setSource(r.source);
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
        await saveConfig(merged, signer ?? null);
        setConfig(merged);
        return merged;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save trader config');
        return null;
      }
    },
    [walletAddress, agentAddress, config?.createdAt, signer],
  );

  const remove = useCallback(async () => {
    if (!walletAddress || !agentAddress) return;
    await deleteConfig(walletAddress, agentAddress, agentAddress, signer ?? null);
    setConfig(null);
    setSource('none');
  }, [walletAddress, agentAddress, signer]);

  return { config, source, loading, error, save, remove, refetch: load };
}
