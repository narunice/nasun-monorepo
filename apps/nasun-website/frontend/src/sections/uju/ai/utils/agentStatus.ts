/**
 * Shared 3-state status derivation for AgentProfile.
 *
 * Sidebar, AgentCard, and any future surface that surfaces an agent's
 * "Active / Paused / Inactive" must agree, otherwise the user sees the
 * same agent labelled two ways on the same screen (the 2026-05-24 grid
 * regression where John/Jason Bourne showed as "Active" in cards while
 * paused everywhere else).
 *
 * Inputs:
 *   - isActive: on-chain AgentProfile.is_active (kill axis)
 *   - enabled:  chat-server trader config.enabled (pause axis); undefined
 *               means "no config row yet" which we treat as not-enabled
 *               since the runtime gate refuses to spawn without it.
 *
 * Mirror of the chat-server's deriveAgentState (agent-orchestrator.ts)
 * minus the vault axis, which the frontend does not see in batch contexts
 * (per-card useAgentVaultStatus would fan out N requests). For the
 * filter-chip use case "active vs paused vs killed" is enough — the
 * vault-missing case still shows correctly as 'paused' here because
 * enabled defaults to false on the never-vaulted path.
 */
export type AgentDisplayStatus = 'active' | 'paused' | 'inactive';

export function deriveAgentStatus(
  isActive: boolean,
  enabled: boolean | undefined,
): AgentDisplayStatus {
  if (!isActive) return 'inactive';
  return enabled ? 'active' : 'paused';
}
