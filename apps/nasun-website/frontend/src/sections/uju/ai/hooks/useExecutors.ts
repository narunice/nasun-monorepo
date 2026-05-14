/**
 * useExecutors - fetch registered executors from ExecutorRegistry, joined with
 * tier data from TierRegistry (with client-side fallback).
 */

import { useState, useEffect, useCallback } from 'react';
import type { SuiClient } from '@mysten/sui/client';
import { suiClient } from '@/lib/sui-client';
import {
  EXECUTOR_CONFIG,
  TEE_TYPES,
  TIER_NAMES,
  DORMANT_THRESHOLD_MS,
  EXECUTOR_SELECTION,
  calculateTierClient,
  type TeeType,
  type TierLevel,
  type TierName,
} from '../services/network';
import { fetchAllDynamicFields } from '../utils/suiPagination';
import { calculateEffectiveScore, isValidEndpointUrl } from '../utils/executor';

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
  tier: TierLevel;
  tierName: TierName;
  effectiveScore: number;
  isDormant: boolean;
}

export interface UseExecutorsReturn {
  executors: ExecutorInfo[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

function parseExecutorInfo(
  data: Record<string, unknown>,
  operator: string,
  tierMap: Map<string, number>,
): ExecutorInfo {
  const fields = (data.fields || data) as Record<string, unknown>;
  const teeType = Number(fields.tee_type || 0) as TeeType;
  const reputation = Number(fields.reputation || 0);
  const lastActiveAt = Number(fields.last_active_at || 0);

  const onChainTier = tierMap.get(operator);
  const tier: TierLevel =
    onChainTier !== undefined ? (onChainTier as TierLevel) : calculateTierClient(0, reputation);

  const isDormant = lastActiveAt > 0 && Date.now() - lastActiveAt > DORMANT_THRESHOLD_MS;
  const endpointUrl = String(fields.endpoint_url || '');
  const hasValidEndpoint = isValidEndpointUrl(endpointUrl, import.meta.env.DEV);

  return {
    id: operator,
    operator: String(fields.operator || operator),
    name: String(fields.name || ''),
    endpointUrl,
    teeType,
    teeTypeName: TEE_TYPES[teeType] || 'Unknown',
    supportedModels: (fields.supported_models as string[]) || [],
    reputation,
    completedJobs: Number(fields.completed_jobs || 0),
    failedJobs: Number(fields.failed_jobs || 0),
    registeredAt: Number(fields.registered_at || 0),
    lastActiveAt,
    isActive: Boolean(fields.is_active) && (teeType === 0 || hasValidEndpoint),
    tier,
    tierName: TIER_NAMES[tier],
    effectiveScore: calculateEffectiveScore(0, reputation),
    isDormant,
  };
}

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

    const dynamicFields = await fetchAllDynamicFields(client, tableId);
    const results = await Promise.allSettled(
      dynamicFields.map((field) =>
        client.getDynamicFieldObject({ parentId: tableId, name: field.name }).then((fieldData) => ({
          field,
          fieldData,
        })),
      ),
    );
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const { field, fieldData } = result.value;
      if (fieldData.data?.content && fieldData.data.content.dataType === 'moveObject') {
        const content = fieldData.data.content.fields as Record<string, unknown>;
        const executorAddr = String((field.name as { value?: string })?.value || '');
        const tierValue = Number(content.value ?? 0);
        if (executorAddr) tierMap.set(executorAddr, tierValue);
      }
    }
  } catch (err) {
    console.warn('Failed to fetch TierRegistry, using client fallback:', err);
  }
  return tierMap;
}

export function selectExecutorWeightedRandom(
  executors: ExecutorInfo[],
  excludeIds: Set<string> = new Set(),
  minTier?: TierLevel,
  model?: string,
): ExecutorInfo | null {
  const { BASE_WEIGHT, REPUTATION_BONUS, MAX_WEIGHT, DORMANT_PENALTY, MIN_TIER } = EXECUTOR_SELECTION;
  const effectiveMinTier = minTier ?? MIN_TIER;
  const eligible = executors.filter(
    (e) =>
      e.isActive &&
      e.tier >= effectiveMinTier &&
      !excludeIds.has(e.id) &&
      (!model || e.supportedModels.length === 0 || e.supportedModels.includes(model)),
  );
  if (eligible.length === 0) return null;
  if (eligible.length === 1) return eligible[0];

  const weights = eligible.map((e) => {
    const raw = BASE_WEIGHT + (e.reputation / 1000) * REPUTATION_BONUS;
    let effective = Math.min(raw, MAX_WEIGHT);
    if (e.isDormant) effective *= DORMANT_PENALTY;
    return effective;
  });

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  let roll = (buf[0] / 0xffffffff) * totalWeight;
  for (let i = 0; i < eligible.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return eligible[i];
  }
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
      const [tierMap, registry] = await Promise.all([
        fetchTierMap(suiClient),
        suiClient.getObject({
          id: EXECUTOR_CONFIG.registryId,
          options: { showContent: true },
        }),
      ]);

      if (!registry.data?.content || registry.data.content.dataType !== 'moveObject') {
        throw new Error('Invalid ExecutorRegistry object');
      }

      const registryFields = registry.data.content.fields as Record<string, unknown>;
      const executorsTable = registryFields.executors as { fields?: { id?: { id: string } } };
      const tableId = executorsTable?.fields?.id?.id;
      if (!tableId) {
        setExecutors([]);
        setIsLoading(false);
        return;
      }

      const dynamicFields = await fetchAllDynamicFields(suiClient, tableId);
      const results = await Promise.allSettled(
        dynamicFields.map((field) =>
          suiClient
            .getDynamicFieldObject({ parentId: tableId, name: field.name })
            .then((fieldData) => ({ field, fieldData })),
        ),
      );

      const executorList: ExecutorInfo[] = [];
      for (const result of results) {
        if (result.status !== 'fulfilled') continue;
        const { field, fieldData } = result.value;
        try {
          if (fieldData.data?.content && fieldData.data.content.dataType === 'moveObject') {
            const content = fieldData.data.content.fields as Record<string, unknown>;
            const valueWrapper = content.value as { fields?: Record<string, unknown> };
            const value = valueWrapper.fields ?? (valueWrapper as unknown as Record<string, unknown>);
            const operator = String((field.name as { value?: string })?.value || value.operator || '');
            const info = parseExecutorInfo(value, operator, tierMap);
            if (info.isActive) executorList.push(info);
          }
        } catch (err) {
          console.warn('Failed to fetch executor info:', field.name, err);
        }
      }

      executorList.sort((a, b) => {
        if (a.isDormant !== b.isDormant) return a.isDormant ? 1 : -1;
        if (a.tier !== b.tier) return b.tier - a.tier;
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

  return { executors, isLoading, error, refresh: fetchExecutors };
}
