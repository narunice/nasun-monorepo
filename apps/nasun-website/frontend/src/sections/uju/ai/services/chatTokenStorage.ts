/**
 * chatToken cache for the agent-mode (wake) chat path.
 *
 * Storage choice: sessionStorage. Tokens have a 10-minute server TTL so the
 * recover-cost of a re-sign on refresh is low, and sessionStorage gives us
 * survives-refresh-within-tab without the cross-tab leakage of localStorage.
 *
 * Key shape: `nasun-ai-chat-token::{wallet}::{agent}::{capability}`. The
 * capabilityId is part of the key (not just the payload) because a user may
 * rotate caps on the same (wallet, agent) pair — pulling a stale token from
 * a previous cap would trip the chat-server's `agent_capability_mismatch`
 * 403 and lock the input on UX. Including capabilityId here means a rotated
 * cap simply misses the cache and re-leases cleanly.
 *
 * Defense-in-depth: payload also carries capabilityId, and `getToken`
 * invalidates the row if the payload's cap doesn't match the requested one.
 * That handles the (unlikely) case of a manual sessionStorage edit or a
 * future key-shape migration that drops the cap segment.
 */

const KEY_PREFIX = 'nasun-ai-chat-token';
const SKEW_MS = 30_000;

export interface StoredChatToken {
  chatToken: string;
  sid: string;
  expiresAt: number;
  wallet: string;
  agentAddress: string;
  capabilityId: string;
}

function makeKey(wallet: string, agentId: string, capabilityId: string): string {
  return `${KEY_PREFIX}::${wallet.toLowerCase()}::${agentId.toLowerCase()}::${capabilityId.toLowerCase()}`;
}

export function saveToken(payload: StoredChatToken): void {
  try {
    const key = makeKey(payload.wallet, payload.agentAddress, payload.capabilityId);
    sessionStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // sessionStorage write can fail in incognito with quota errors. Falling
    // back to in-memory only is acceptable — the user just re-signs on next
    // turn instead of every turn.
  }
}

export function getToken(
  wallet: string,
  agentId: string,
  capabilityId: string,
): StoredChatToken | null {
  try {
    const key = makeKey(wallet, agentId, capabilityId);
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredChatToken;
    if (
      !parsed.chatToken ||
      !parsed.sid ||
      typeof parsed.expiresAt !== 'number' ||
      parsed.capabilityId?.toLowerCase() !== capabilityId.toLowerCase() ||
      parsed.agentAddress?.toLowerCase() !== agentId.toLowerCase() ||
      parsed.wallet?.toLowerCase() !== wallet.toLowerCase()
    ) {
      sessionStorage.removeItem(key);
      return null;
    }
    if (parsed.expiresAt - SKEW_MS < Date.now()) {
      sessionStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearToken(wallet: string, agentId: string, capabilityId: string): void {
  try {
    sessionStorage.removeItem(makeKey(wallet, agentId, capabilityId));
  } catch {
    // ignore
  }
}

/** Clear every chat token in storage. Called on wallet disconnect / reset. */
export function clearAllTokens(): void {
  try {
    const toDrop: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(`${KEY_PREFIX}::`)) toDrop.push(k);
    }
    for (const k of toDrop) sessionStorage.removeItem(k);
  } catch {
    // ignore
  }
}
