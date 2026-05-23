/**
 * Phase 8 — unified agent state client.
 *
 * Calls GET /api/nasun-ai/agent/:addr/state which returns the derived
 * 3-state model (activated / paused / killed / unknown) plus the
 * underlying flags. Replaces the prior pattern of composing three hooks
 * (useAgentProfiles + useTraderConfig + useAgentVaultStatus) on the
 * client side, eliminating drift between read sites.
 */

const CHAT_SERVER_URL =
  (import.meta.env.VITE_CHAT_SERVER_URL as string | undefined) ?? 'https://nasun.io';

export type AgentDerivedState = 'activated' | 'paused' | 'killed' | 'unknown';
export type AgentRuntime = 'running' | 'stopped';

export interface AgentStateResponse {
  state: AgentDerivedState;
  runtime: AgentRuntime;
  onChain: { isActive: boolean | null; profileId: string | null };
  config: { enabled: boolean };
  /** Backend omits deleted_at timestamp from the public response — only the
   *  presence boolean is exposed to avoid account-lifecycle timing leak. */
  vault: { present: boolean };
  pending: boolean;
}

export async function fetchAgentState(
  agentAddress: string,
  signal?: AbortSignal,
): Promise<AgentStateResponse> {
  const url = `${CHAT_SERVER_URL}/api/nasun-ai/agent/${agentAddress.toLowerCase()}/state`;
  const res = await fetch(url, { method: 'GET', signal });
  if (!res.ok) {
    throw new Error(`agent_state_fetch_failed:${res.status}`);
  }
  return (await res.json()) as AgentStateResponse;
}
