/**
 * useExecutors - Hook for fetching registered executors from ExecutorRegistry
 *
 * Includes tier data from TierRegistry (on-chain) with client-side fallback.
 */

import { useState, useEffect, useCallback } from 'react';
import { SuiClient } from '@mysten/sui/client';
import {
  NETWORK_CONFIG,
  EXECUTOR_CONFIG,
  TEE_TYPES,
  TeeType,
  TIER_NAMES,
  TierLevel,
  TierName,
  DORMANT_THRESHOLD_MS,
  EXECUTOR_SELECTION,
  calculateTierClient,
} from '@/config/network';

export interface ExecutorInfo {
  id: string;
  operator: string;
  name: string;
  endpointUrl: string;
  teeType: TeeType;
  teeTypeName: string;
  supportedModels: string[];
  reputation: number;
  completedJobs: number;
  failedJobs: number;
  registeredAt: number;
  lastActiveAt: number;
  isActive: boolean;
  // Tier (Phase E)
  tier: TierLevel;
  tierName: TierName;
  // effectiveScore is a non-deterministic UI-only ranking signal.
  // It has no on-chain authority and does not affect settlement or compliance.
  effectiveScore: number;
  isDormant: boolean;
}

export interface UseExecutorsReturn {
  executors: ExecutorInfo[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Calculate effectiveScore for UI sorting (non-deterministic, off-chain only).
 * effectiveScore = sqrt(staked_amount / 1e9) * (reputation / 1000)
 */
function calculateEffectiveScore(stakeAmount: number, reputation: number): number {
  return Math.sqrt(stakeAmount / 1e9) * (reputation / 1000);
}

/**
 * Parse ExecutorInfo from on-chain data
 */
function parseExecutorInfo(
  data: Record<string, unknown>,
  operator: string,
  tierMap: Map<string, number>,
): ExecutorInfo {
  const fields = (data.fields || data) as Record<string, unknown>;
  const teeType = Number(fields.tee_type || 0) as TeeType;
  const reputation = Number(fields.reputation || 0);
  const lastActiveAt = Number(fields.last_active_at || 0);

  // Tier: prefer on-chain TierRegistry, fallback to client calculation
  // Client fallback uses staked status (binary) mapped to MIN_STAKE for tier calc
  const onChainTier = tierMap.get(operator);
  const tier: TierLevel = onChainTier !== undefined
    ? (onChainTier as TierLevel)
    : calculateTierClient(0, reputation); // Without stake data, defaults to rep-only

  const isDormant = lastActiveAt > 0 && (Date.now() - lastActiveAt) > DORMANT_THRESHOLD_MS;

  return {
    id: operator,
    operator: String(fields.operator || operator),
    name: String(fields.name || ''),
    endpointUrl: String(fields.endpoint_url || ''),
    teeType,
    teeTypeName: TEE_TYPES[teeType] || 'Unknown',
    supportedModels: (fields.supported_models as string[]) || [],
    reputation,
    completedJobs: Number(fields.completed_jobs || 0),
    failedJobs: Number(fields.failed_jobs || 0),
    registeredAt: Number(fields.registered_at || 0),
    lastActiveAt,
    isActive: Boolean(fields.is_active),
    tier,
    tierName: TIER_NAMES[tier],
    effectiveScore: calculateEffectiveScore(0, reputation), // Stake data not in ExecutorInfo
    isDormant,
  };
}

/**
 * Fetch tier data from TierRegistry shared object
 */
async function fetchTierMap(client: SuiClient): Promise<Map<string, number>> {
  const tierMap = new Map<string, number>();

  if (!EXECUTOR_CONFIG.tierRegistryId) return tierMap;

  try {
    const registry = await client.getObject({
      id: EXECUTOR_CONFIG.tierRegistryId,
      options: { showContent: true },
    });

    if (!registry.data?.content || registry.data.content.dataType !== 'moveObject') {
      return tierMap;
    }

    const fields = registry.data.content.fields as Record<string, unknown>;
    const tiersTable = fields.tiers as { fields?: { id?: { id: string } } };
    const tableId = tiersTable?.fields?.id?.id;

    if (!tableId) return tierMap;

    const dynamicFields = await client.getDynamicFields({ parentId: tableId });

    for (const field of dynamicFields.data) {
      try {
        const fieldData = await client.getDynamicFieldObject({
          parentId: tableId,
          name: field.name,
        });

        if (fieldData.data?.content && fieldData.data.content.dataType === 'moveObject') {
          const content = fieldData.data.content.fields as Record<string, unknown>;
          const executorAddr = String((field.name as { value?: string })?.value || '');
          const tierValue = Number(content.value ?? 0);
          if (executorAddr) {
            tierMap.set(executorAddr, tierValue);
          }
        }
      } catch {
        // Skip individual tier fetch failures
      }
    }
  } catch (err) {
    console.warn('Failed to fetch TierRegistry, using client fallback:', err);
  }

  return tierMap;
}

/**
 * Select an executor via weighted random from the eligible set.
 * Eligible = active, non-excluded, tier >= MIN_TIER (Bronze+).
 * Weight = min(BASE_WEIGHT + (reputation / 1000) * REPUTATION_BONUS, MAX_WEIGHT)
 * Dormant executors receive DORMANT_PENALTY multiplier.
 *
 * @param executors - Full executor list from useExecutors()
 * @param excludeIds - Executor IDs to exclude (e.g., previously failed)
 * @param minTier - Override MIN_TIER (e.g., 0 for cloud models that don't need TEE)
 * @param model - Model ID to match against executor's supportedModels list
 * @returns Selected executor, or null if no eligible executors
 */
export function selectExecutorWeightedRandom(
  executors: ExecutorInfo[],
  excludeIds: Set<string> = new Set(),
  minTier?: TierLevel,
  model?: string,
): ExecutorInfo | null {
  const { BASE_WEIGHT, REPUTATION_BONUS, MAX_WEIGHT, DORMANT_PENALTY, MIN_TIER } = EXECUTOR_SELECTION;
  const effectiveMinTier = minTier ?? MIN_TIER;

  // Filter eligible set: active, tier >= effectiveMinTier, not excluded, supports model
  // An executor with empty supportedModels accepts all models (e.g., Lambda proxy)
  const eligible = executors.filter(
    e => e.isActive && e.tier >= effectiveMinTier && !excludeIds.has(e.id)
      && (!model || e.supportedModels.length === 0 || e.supportedModels.includes(model)),
  );

  if (eligible.length === 0) return null;
  if (eligible.length === 1) return eligible[0];

  // Calculate weights
  const weights = eligible.map(e => {
    const raw = BASE_WEIGHT + (e.reputation / 1000) * REPUTATION_BONUS;
    let effective = Math.min(raw, MAX_WEIGHT);
    if (e.isDormant) effective *= DORMANT_PENALTY;
    return effective;
  });

  // Weighted random selection
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * totalWeight;

  for (let i = 0; i < eligible.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return eligible[i];
  }

  // Fallback (floating point edge case)
  return eligible[eligible.length - 1];
}

export function useExecutors(): UseExecutorsReturn {
  const [executors, setExecutors] = useState<ExecutorInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExecutors = useCallback(async () => {
    if (!EXECUTOR_CONFIG.registryId) {
      setError('ExecutorRegistry ID not configured');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const client = new SuiClient({ url: NETWORK_CONFIG.rpcUrl });

      // Fetch TierRegistry and ExecutorRegistry in parallel
      const [tierMap, registry] = await Promise.all([
        fetchTierMap(client),
        client.getObject({
          id: EXECUTOR_CONFIG.registryId,
          options: { showContent: true },
        }),
      ]);

      if (!registry.data?.content || registry.data.content.dataType !== 'moveObject') {
        throw new Error('Invalid ExecutorRegistry object');
      }

      const registryFields = registry.data.content.fields as Record<string, unknown>;

      // Get executors table ID
      const executorsTable = registryFields.executors as { fields?: { id?: { id: string } } };
      const tableId = executorsTable?.fields?.id?.id;

      if (!tableId) {
        setExecutors([]);
        setIsLoading(false);
        return;
      }

      // Fetch all dynamic fields (executor entries)
      const dynamicFields = await client.getDynamicFields({
        parentId: tableId,
      });

      const executorList: ExecutorInfo[] = [];

      for (const field of dynamicFields.data) {
        try {
          const fieldData = await client.getDynamicFieldObject({
            parentId: tableId,
            name: field.name,
          });

          if (fieldData.data?.content && fieldData.data.content.dataType === 'moveObject') {
            const content = fieldData.data.content.fields as Record<string, unknown>;
            const valueWrapper = content.value as { fields?: Record<string, unknown> };
            const value = valueWrapper.fields ?? (valueWrapper as unknown as Record<string, unknown>);

            const operator = String((field.name as { value?: string })?.value || value.operator || '');
            const info = parseExecutorInfo(value, operator, tierMap);
            if (info.isActive) {
              executorList.push(info);
            }
          }
        } catch (err) {
          console.warn('Failed to fetch executor info:', field.name, err);
        }
      }

      // Sort: tier desc → effectiveScore desc (non-dormant first)
      executorList.sort((a, b) => {
        // Non-dormant before dormant
        if (a.isDormant !== b.isDormant) return a.isDormant ? 1 : -1;
        // Higher tier first
        if (a.tier !== b.tier) return b.tier - a.tier;
        // Higher effectiveScore first
        return b.effectiveScore - a.effectiveScore;
      });

      setExecutors(executorList);
    } catch (err) {
      console.error('Failed to fetch executors:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch executors');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchExecutors();
  }, [fetchExecutors]);

  return {
    executors,
    isLoading,
    error,
    refresh: fetchExecutors,
  };
}
