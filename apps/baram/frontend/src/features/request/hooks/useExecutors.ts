/**
 * useExecutors - Hook for fetching registered executors from ExecutorRegistry
 */

import { useState, useEffect, useCallback } from 'react';
import { SuiClient } from '@mysten/sui/client';
import { NETWORK_CONFIG, EXECUTOR_CONFIG, TEE_TYPES, TeeType } from '@/config/network';

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
}

export interface UseExecutorsReturn {
  executors: ExecutorInfo[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Parse ExecutorInfo from on-chain data
 */
function parseExecutorInfo(data: Record<string, unknown>, operator: string): ExecutorInfo {
  const fields = (data.fields || data) as Record<string, unknown>;
  const teeType = Number(fields.tee_type || 0) as TeeType;

  return {
    id: operator, // Use operator address as unique ID
    operator: String(fields.operator || operator),
    name: String(fields.name || ''),
    endpointUrl: String(fields.endpoint_url || ''),
    teeType,
    teeTypeName: TEE_TYPES[teeType] || 'Unknown',
    supportedModels: (fields.supported_models as string[]) || [],
    reputation: Number(fields.reputation || 0),
    completedJobs: Number(fields.completed_jobs || 0),
    failedJobs: Number(fields.failed_jobs || 0),
    registeredAt: Number(fields.registered_at || 0),
    lastActiveAt: Number(fields.last_active_at || 0),
    isActive: Boolean(fields.is_active),
  };
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

      // Fetch ExecutorRegistry object
      const registry = await client.getObject({
        id: EXECUTOR_CONFIG.registryId,
        options: {
          showContent: true,
        },
      });

      if (!registry.data?.content || registry.data.content.dataType !== 'moveObject') {
        throw new Error('Invalid ExecutorRegistry object');
      }

      const registryFields = registry.data.content.fields as Record<string, unknown>;

      // Get executors table ID
      const executorsTable = registryFields.executors as { fields?: { id?: { id: string } } };
      const tableId = executorsTable?.fields?.id?.id;

      if (!tableId) {
        // No executors registered yet
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
            // Handle both nested (value.fields) and flat (value) structures
            const value = valueWrapper.fields ?? (valueWrapper as unknown as Record<string, unknown>);

            // Extract operator from the field name (dynamic field key)
            const operator = String((field.name as { value?: string })?.value || value.operator || '');
            const info = parseExecutorInfo(value, operator);
            if (info.isActive) {
              executorList.push(info);
            }
          }
        } catch (err) {
          console.warn('Failed to fetch executor info:', field.name, err);
        }
      }

      // Sort by reputation (highest first)
      executorList.sort((a, b) => b.reputation - a.reputation);

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
