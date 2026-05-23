// Phase 8 — shared on-chain reader for Nasun AI agent state.
//
// Centralizes AgentProfile.is_active fetches so reconcile and lazy-GET
// converge on a single TTL cache. baram-budget-guard.ts uses its own
// SuiClient for Budget reads (different object, different cache lifetime,
// different fail-mode) and is intentionally left alone; the shared
// migration is a follow-up.

import { SuiClient } from '@mysten/sui/client';

const CACHE_TTL_MS = 10_000;

/**
 * Resolve RPC URL at module init. Throws if RPC_URL is set but malformed
 * so a typo surfaces at boot rather than at first reconcile. When unset,
 * falls back to the canonical devnet endpoint and logs once — operators
 * running against testnet/mainnet must set RPC_URL explicitly.
 */
function resolveRpcUrl(): string {
  const raw = process.env.RPC_URL;
  if (!raw) {
    console.warn('[sui-client] RPC_URL unset; falling back to https://rpc.devnet.nasun.io');
    return 'https://rpc.devnet.nasun.io';
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error(`unsupported protocol: ${parsed.protocol}`);
    }
    return raw;
  } catch (err) {
    throw new Error(`[sui-client] invalid RPC_URL "${raw}": ${(err as Error).message}`);
  }
}

const RPC_URL = resolveRpcUrl();
let client: SuiClient | null = null;
export function getSharedSuiClient(): SuiClient {
  if (!client) client = new SuiClient({ url: RPC_URL });
  return client;
}

export interface AgentProfileSnapshot {
  isActive: boolean;
  owner: string;
}

interface CachedEntry {
  value: AgentProfileSnapshot | null;
  expiresAt: number;
}

const cache = new Map<string, CachedEntry>();

/**
 * Read AgentProfile.is_active + owner. Returns null when RPC fails or the
 * object is not a Move object (deleted / wrong id). Caller treats null as
 * "unknown" and does not change state.
 *
 * 10s TTL is tight enough that a frontend kill action's downstream reconcile
 * (called immediately after the on-chain tx confirms) sees a fresh value
 * after invalidate(); operators bouncing chat-server pick up external
 * deactivations through the 60s event poller in agent-vault-killswitch.
 */
export async function readAgentProfileIsActive(
  profileId: string,
): Promise<AgentProfileSnapshot | null> {
  const now = Date.now();
  const hit = cache.get(profileId);
  if (hit && hit.expiresAt > now) return hit.value;

  try {
    const obj = await getSharedSuiClient().getObject({
      id: profileId,
      options: { showContent: true },
    });
    if (obj.data?.content?.dataType !== 'moveObject') {
      cache.set(profileId, { value: null, expiresAt: now + CACHE_TTL_MS });
      return null;
    }
    const fields = obj.data.content.fields as Record<string, unknown>;
    const snapshot: AgentProfileSnapshot = {
      isActive: Boolean(fields.is_active),
      owner: String(fields.owner ?? '').toLowerCase(),
    };
    cache.set(profileId, { value: snapshot, expiresAt: now + CACHE_TTL_MS });
    return snapshot;
  } catch (err) {
    // RPC error — surface null. Do NOT cache the failure so transient
    // outages clear on the next call.
    console.warn('[sui-client] readAgentProfileIsActive failed:', (err as Error).message);
    return null;
  }
}

export function invalidateAgentProfileCache(profileId: string): void {
  cache.delete(profileId);
}
