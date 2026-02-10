/**
 * useAgentProfiles - Query AgentProfile objects owned by the current wallet
 */

import { useQuery } from '@tanstack/react-query';
import { suiClient } from '../../../config/client';
import { AGENT_CONFIG } from '../../../config/network';

export interface AgentProfile {
  id: string;
  owner: string;
  agentAddress: string;
  name: string;
  role: string;
  capabilities: string[];
  isActive: boolean;
  createdAt: number;
  totalRequests: number;
  totalSpent: number;
  lastActiveAt: number;
}

function parseAgentProfile(obj: Record<string, unknown>): AgentProfile | null {
  try {
    const fields = obj as Record<string, unknown>;
    return {
      id: (fields.id as Record<string, string>)?.id ?? '',
      owner: fields.owner as string,
      agentAddress: fields.agent_address as string,
      name: fields.name as string,
      role: fields.role as string,
      capabilities: fields.capabilities as string[] ?? [],
      isActive: fields.is_active as boolean,
      createdAt: Number(fields.created_at ?? 0),
      totalRequests: Number(fields.total_executions ?? 0),
      totalSpent: Number(fields.total_spent ?? 0),
      lastActiveAt: Number(fields.last_active_at ?? 0),
    };
  } catch {
    return null;
  }
}

async function fetchAgentProfiles(ownerAddress: string): Promise<AgentProfile[]> {
  const profileType = `${AGENT_CONFIG.packageId}::agent_profile::AgentProfile`;
  const profiles: AgentProfile[] = [];
  let cursor: string | null | undefined = undefined;

  do {
    const result = await suiClient.getOwnedObjects({
      owner: ownerAddress,
      filter: { StructType: profileType },
      options: { showContent: true },
      cursor,
    });

    for (const item of result.data) {
      if (item.data?.content?.dataType === 'moveObject') {
        const parsed = parseAgentProfile(item.data.content.fields as Record<string, unknown>);
        if (parsed) profiles.push(parsed);
      }
    }

    cursor = result.hasNextPage ? result.nextCursor : null;
  } while (cursor);

  return profiles;
}

export function useAgentProfiles(ownerAddress: string | null) {
  return useQuery({
    queryKey: ['agentProfiles', ownerAddress],
    queryFn: () => fetchAgentProfiles(ownerAddress!),
    enabled: !!ownerAddress,
    refetchInterval: 15000,
    staleTime: 10000,
  });
}
