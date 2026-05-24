/**
 * Persistent sidebar for the AI tab. Lists the wallet's agents and lets the
 * user jump between them; the "Agents" header doubles as a link back to the
 * grid view.
 *
 * URL contract: selected row mirrors AiTab's `agent` query param exactly.
 * No new URL state introduced — when on grid view, `selectedAgentId` is null
 * and no row is highlighted.
 *
 * Hidden below `md` (matches UjuChatSidebar). Mobile drawer is a follow-up.
 */

import { useMemo, useState } from "react";
import type { AgentProfile } from "../hooks/useAgentProfiles";
import { useTraderConfig } from "../hooks/useTraderConfig";

interface AgentsSidebarProps {
  agents: AgentProfile[];
  selectedAgentId: string | null;
  onSelectAgent: (id: string) => void;
  onClearSelection: () => void;
  /**
   * Opens CreateAgentModal preselected on the import path. Generate-mode
   * creation lives on the Quickstart card; the sidebar entry is for users
   * bringing their own keypair or address.
   */
  onShowImport: () => void;
  /** True when the alpha gate denies create. Disables the Import button. */
  createBlocked?: boolean;
  createBlockedMessage?: string | null;
}

// Search input only useful past a handful of agents. Below this threshold
// the list itself is the selector.
const SEARCH_THRESHOLD = 8;

export function AgentsSidebar({
  agents,
  selectedAgentId,
  onSelectAgent,
  onClearSelection,
  onShowImport,
  createBlocked = false,
  createBlockedMessage,
}: AgentsSidebarProps) {
  const [query, setQuery] = useState("");

  const sorted = useMemo(() => {
    // Active agents first, then by most-recently-active. Falls back to
    // createdAt when lastActiveAt is 0 (never woken).
    return [...agents].sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      const aTs = a.lastActiveAt || a.createdAt;
      const bTs = b.lastActiveAt || b.createdAt;
      return bTs - aTs;
    });
  }, [agents]);

  const filtered = useMemo(() => {
    if (!query.trim()) return sorted;
    const q = query.trim().toLowerCase();
    return sorted.filter((a) => a.name.toLowerCase().includes(q));
  }, [sorted, query]);

  const showSearch = agents.length > SEARCH_THRESHOLD;

  return (
    <aside className="hidden md:flex md:flex-col md:w-60 shrink-0 border-r border-uju-border/60 bg-gray-950/50 backdrop-blur-sm">
      {/* Header row: padding + border match the SubTabBar in AiTab so the
       *  baseline underline lines up across the sidebar and the main column. */}
      <button
        type="button"
        onClick={onClearSelection}
        className={[
          "text-left px-3 py-2 text-sm font-semibold border-b border-uju-border/60 transition-colors",
          selectedAgentId === null
            ? "text-white"
            : "text-uju-secondary hover:text-white",
        ].join(" ")}
      >
        Agents
      </button>

      <div className="flex-1 overflow-y-auto py-2">
        {showSearch && (
          <div className="px-3 pb-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search agents"
              className="w-full px-2.5 py-1.5 text-sm rounded-md bg-uju-bg border border-uju-border/60 text-white placeholder:text-uju-secondary/60 focus:outline-none focus:border-pado-2 transition-colors"
            />
          </div>
        )}

        {agents.length === 0 ? (
          <p className="px-4 py-2 text-sm text-uju-secondary/60">
            No agents yet.
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-2 text-sm text-uju-secondary/60">
            No matches.
          </p>
        ) : (
          <ul>
            {filtered.map((agent) => (
              <AgentRow
                key={agent.id}
                agent={agent}
                isSelected={agent.id === selectedAgentId}
                onSelect={() =>
                  agent.id === selectedAgentId
                    ? onClearSelection()
                    : onSelectAgent(agent.id)
                }
              />
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-uju-border/40 p-3">
        <button
          type="button"
          onClick={onShowImport}
          disabled={createBlocked}
          title={
            createBlockedMessage ??
            "Bring your own keypair or wallet address. Most users should use Quick Start instead."
          }
          className="w-full px-3 py-2 text-sm font-medium rounded-md border border-uju-border/60 text-uju-secondary hover:text-white hover:border-pado-2 transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          Import agent
        </button>
      </div>
    </aside>
  );
}

// Mirrors OverviewTab's badge logic so the sidebar dot and the Overview
// status badge never disagree: on-chain is_active=true AND runtime
// trader-config enabled=true is the only 'active' state. Profile registered
// on-chain but runtime disabled is 'paused' (amber); off-chain or unknown
// is 'inactive' (outline).
function AgentRow({
  agent,
  isSelected,
  onSelect,
}: {
  agent: AgentProfile;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const traderConfig = useTraderConfig(agent.agentAddress);
  const runtimeEnabled = traderConfig.config?.enabled === true;
  const status: "active" | "paused" | "inactive" =
    agent.isActive && runtimeEnabled
      ? "active"
      : agent.isActive
        ? "paused"
        : "inactive";

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={[
          "w-full text-left px-4 py-2 text-sm flex items-center gap-2 border-l-2 transition-colors",
          isSelected
            ? "bg-pado-2/10 border-l-pado-2 text-white"
            : "border-l-transparent text-uju-secondary hover:bg-uju-bg/40 hover:text-white",
        ].join(" ")}
      >
        <StatusDot status={status} />
        <span className="truncate">{agent.name}</span>
      </button>
    </li>
  );
}

function StatusDot({ status }: { status: "active" | "paused" | "inactive" }) {
  if (status === "active") {
    return (
      <span
        aria-label="active"
        className="shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-400"
      />
    );
  }
  if (status === "paused") {
    return (
      <span
        aria-label="paused"
        className="shrink-0 w-1.5 h-1.5 rounded-full bg-amber-400"
      />
    );
  }
  return (
    <span
      aria-label="inactive"
      className="shrink-0 w-1.5 h-1.5 rounded-full border border-uju-border/80"
    />
  );
}
