/**
 * Query AgentProfile objects owned by a wallet.
 * Ported from baram features/agents/hooks/useAgentProfiles.ts; uses
 * nasun-website's shared SuiClient + @nasun/devnet-config IDs.
 */

import { useQuery } from '@tanstack/react-query';
import { BARAM } from '@nasun/devnet-config';
import { suiClient } from '@/lib/sui-client';

export interface AgentProfile {
  id: string;
  owner: string;
  agentAddress: string;
  name: string;
  role: string;
  capabilities: string[];
  isActive: boolean;
  createdAt: number;
  totalExecutions: number;
  totalSpent: number;
  lastActiveAt: number;
  // Move Option<ID> -> linked Capability shared object id, or null when the
  // profile has no execution authority wired up (legacy / pre-Plan-B agents).
  capabilityId: string | null;
}

function parseOptionId(field: unknown): string | null {
  if (field == null) return null;
  if (typeof field === 'string') return field;
  if (typeof field === 'object' && field !== null && 'vec' in field) {
    const vec = (field as { vec: unknown[] }).vec;
    if (Array.isArray(vec) && vec.length > 0) return String(vec[0]);
    return null;
  }
  return null;
}

function parseAgentProfile(fields: Record<string, unknown>): AgentProfile | null {
  try {
    return {
      id: (fields.id as Record<string, string>)?.id ?? '',
      owner: fields.owner as string,
      agentAddress: fields.agent_address as string,
      name: fields.name as string,
      role: fields.role as string,
      capabilities: (fields.capabilities as string[]) ?? [],
      isActive: fields.is_active as boolean,
      createdAt: Number(fields.created_at ?? 0),
      totalExecutions: Number(fields.total_executions ?? 0),
      totalSpent: Number(fields.total_spent ?? 0),
      lastActiveAt: Number(fields.last_active_at ?? 0),
      capabilityId: parseOptionId(fields.capability),
    };
  } catch {
    return null;
  }
}

async function fetchAgentProfiles(ownerAddress: string): Promise<AgentProfile[]> {
  // Struct type tags always use the original publish package id, never the
  // upgrade id. Filtering by the upgraded `agentPackageId` returns 0 rows
  // and makes the freshly registered agent invisible to Quickstart.
  const profileType = `${BARAM.agentOriginalPackageId}::agent_profile::AgentProfile`;
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

export function useAgentProfiles(ownerAddress: string | null | undefined) {
  return useQuery({
    queryKey: ['nasun-ai', 'agentProfiles', ownerAddress],
    queryFn: () => fetchAgentProfiles(ownerAddress!),
    enabled: !!ownerAddress,
    refetchInterval: 15000,
    staleTime: 10000,
  });
}
