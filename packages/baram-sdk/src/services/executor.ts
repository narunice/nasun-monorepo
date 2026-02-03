/**
 * Executor registry query and weighted random selection
 */

import { SuiClient } from '@mysten/sui/client';
import type { BaramConfig, ExecutorInfo, TierLevel } from '../types';
import {
  TIER_NAMES,
  TEE_TYPES,
  TeeType,
  DORMANT_THRESHOLD_MS,
  EXECUTOR_SELECTION,
} from '../types';

// Stake thresholds in SOE (9 decimals) — mirrors executor_tier.move
const BRONZE_STAKE = 1_000_000_000_000;
const SILVER_STAKE = 5_000_000_000_000;
const GOLD_STAKE = 10_000_000_000_000;

const BRONZE_REP = 300;
const SILVER_REP = 500;
const GOLD_REP = 700;

/**
 * Client-side tier calculation — fallback when TierRegistry is unavailable.
 * tier = min(stake_tier, rep_tier)
 */
export function calculateTierClient(stakeAmount: number, reputation: number): TierLevel {
  const stakeTier =
    stakeAmount >= GOLD_STAKE ? 3 :
    stakeAmount >= SILVER_STAKE ? 2 :
    stakeAmount >= BRONZE_STAKE ? 1 : 0;
  const repTier =
    reputation >= GOLD_REP ? 3 :
    reputation >= SILVER_REP ? 2 :
    reputation >= BRONZE_REP ? 1 : 0;
  return Math.min(stakeTier, repTier) as TierLevel;
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

  const onChainTier = tierMap.get(operator);
  const tier: TierLevel = onChainTier !== undefined
    ? (onChainTier as TierLevel)
    : calculateTierClient(0, reputation);

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
    isDormant,
  };
}

/**
 * Fetch tier data from TierRegistry shared object
 */
async function fetchTierMap(client: SuiClient, config: BaramConfig): Promise<Map<string, number>> {
  const tierMap = new Map<string, number>();
  const tierRegistryId = config.executor.tierRegistryId;
  if (!tierRegistryId) return tierMap;

  try {
    const registry = await client.getObject({
      id: tierRegistryId,
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
  } catch {
    // TierRegistry unavailable, use client fallback
  }

  return tierMap;
}

/**
 * Fetch all active executors from the on-chain ExecutorRegistry.
 */
export async function fetchExecutors(
  client: SuiClient,
  config: BaramConfig,
): Promise<ExecutorInfo[]> {
  const [tierMap, registry] = await Promise.all([
    fetchTierMap(client, config),
    client.getObject({
      id: config.executor.registryId,
      options: { showContent: true },
    }),
  ]);

  if (!registry.data?.content || registry.data.content.dataType !== 'moveObject') {
    throw new Error('Invalid ExecutorRegistry object');
  }

  const registryFields = registry.data.content.fields as Record<string, unknown>;
  const executorsTable = registryFields.executors as { fields?: { id?: { id: string } } };
  const tableId = executorsTable?.fields?.id?.id;

  if (!tableId) return [];

  const dynamicFields = await client.getDynamicFields({ parentId: tableId });
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
    } catch {
      // Skip individual executor fetch failures
    }
  }

  return executorList;
}

/**
 * Select an executor via weighted random from the eligible set.
 *
 * Eligible = active, tier >= minTier (Bronze+), not excluded, supports model.
 * Weight = min(BASE_WEIGHT + (reputation / 1000) * REPUTATION_BONUS, MAX_WEIGHT)
 * Dormant executors receive DORMANT_PENALTY multiplier.
 */
export function selectExecutorWeightedRandom(
  executors: ExecutorInfo[],
  excludeIds: Set<string> = new Set(),
  minTier?: TierLevel,
  model?: string,
): ExecutorInfo | null {
  const { BASE_WEIGHT, REPUTATION_BONUS, MAX_WEIGHT, DORMANT_PENALTY, MIN_TIER } = EXECUTOR_SELECTION;
  const effectiveMinTier = minTier ?? MIN_TIER;

  const eligible = executors.filter(
    e => e.isActive && e.tier >= effectiveMinTier && !excludeIds.has(e.id)
      && (!model || e.supportedModels.length === 0 || e.supportedModels.includes(model)),
  );

  if (eligible.length === 0) return null;
  if (eligible.length === 1) return eligible[0];

  const weights = eligible.map(e => {
    const raw = BASE_WEIGHT + (e.reputation / 1000) * REPUTATION_BONUS;
    let effective = Math.min(raw, MAX_WEIGHT);
    if (e.isDormant) effective *= DORMANT_PENALTY;
    return effective;
  });

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * totalWeight;

  for (let i = 0; i < eligible.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return eligible[i];
  }

  return eligible[eligible.length - 1];
}
