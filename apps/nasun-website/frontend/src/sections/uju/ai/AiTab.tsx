import { useState, useEffect, useCallback } from "react";
import { SuiClient } from "@mysten/sui/client";
import { BARAM, NETWORK } from "@nasun/devnet-config";
import { useAuth } from "@/features/auth";
import { LinkTelegramCTA } from "./LinkTelegramCTA";

const suiClient = new SuiClient({ url: NETWORK.rpcUrl });
const BARAM_DASHBOARD_URL =
  (import.meta.env.VITE_BARAM_DASHBOARD_URL as string | undefined) ?? "http://localhost:5177";

interface AgentProfile {
  id: string;
  agentAddress: string;
  name: string;
  role: string;
  isActive: boolean;
}

function truncate(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

async function fetchAgentProfiles(ownerAddress: string): Promise<AgentProfile[]> {
  const profileType = `${BARAM.agentPackageId}::agent_profile::AgentProfile`;
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
      if (item.data?.content?.dataType === "moveObject") {
        const f = item.data.content.fields as Record<string, unknown>;
        profiles.push({
          id: (f.id as Record<string, string>)?.id ?? "",
          agentAddress: f.agent_address as string,
          name: f.name as string,
          role: f.role as string,
          isActive: f.is_active as boolean,
        });
      }
    }

    cursor = result.hasNextPage ? result.nextCursor : null;
  } while (cursor);

  return profiles;
}

async function fetchEscrowNusdc(escrowId: string): Promise<bigint> {
  const nusdcType = BARAM.nusdcType;
  const typeNameStr = nusdcType.startsWith("0x") ? nusdcType.slice(2) : nusdcType;
  try {
    const df = await suiClient.getDynamicFieldObject({
      parentId: escrowId,
      name: { type: "0x1::type_name::TypeName", value: { name: typeNameStr } },
    });
    if (df.data?.content?.dataType === "moveObject") {
      const dfFields = df.data.content.fields as Record<string, unknown>;
      const val = dfFields.value as Record<string, unknown> | undefined;
      const raw =
        val && "fields" in val && val.fields
          ? (val.fields as Record<string, unknown>).value
          : undefined;
      if (raw !== undefined) return BigInt(String(raw));
    }
  } catch {
    // No balance yet
  }
  return 0n;
}

export function AiTab() {
  const { user } = useAuth();
  const walletAddress = user?.walletAddress;

  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balances, setBalances] = useState<Record<string, bigint>>({});

  const loadAgents = useCallback(async () => {
    if (!walletAddress) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAgentProfiles(walletAddress);
      setAgents(data);

      // For each agent, read the escrow ID saved by the Baram dashboard's EscrowTab
      // and fetch NUSDC balance from the on-chain dynamic field.
      const bal: Record<string, bigint> = {};
      await Promise.all(
        data.map(async (agent) => {
          const storageKey = `baram:escrow-id:${walletAddress}:${agent.id}`;
          const escrowId = localStorage.getItem(storageKey);
          if (escrowId) {
            bal[agent.id] = await fetchEscrowNusdc(escrowId);
          }
        }),
      );
      setBalances(bal);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  if (!walletAddress) {
    return (
      <div className="py-12 text-center space-y-4">
        <div className="w-12 h-12 mx-auto rounded-full bg-pado-2/10 flex items-center justify-center">
          <svg
            width={24}
            height={24}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="text-pado-2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1 1 .03 2.798-1.132 2.798H4.929c-1.161 0-2.131-1.797-1.132-2.798L5 14.5"
            />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-white">Nasun AI Settlement</h3>
        <p className="text-sm text-uju-secondary max-w-sm mx-auto">
          Connect your Nasun wallet to manage AI agents, view escrow balances, and track on-chain
          execution reports.
        </p>
        <p className="text-xs text-uju-secondary/60">
          Sign in with your Nasun wallet from the Profile tab to continue.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-white">Nasun AI Agents</h2>
          <p className="text-sm text-uju-secondary">
            AI agents delegated to execute on your behalf
          </p>
        </div>
        <a
          href={BARAM_DASHBOARD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 px-4 py-2 text-sm font-medium rounded-lg bg-pado-2 text-uju-bg hover:bg-pado-3 transition-colors"
        >
          Open Dashboard
        </a>
      </div>

      {/* Agent cards */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-uju-card/60 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="p-3 rounded-xl bg-red-500/10 text-sm text-red-400">{error}</div>
      ) : agents.length === 0 ? (
        <div className="py-8 text-center space-y-3 bg-uju-card/40 rounded-xl border border-uju-border/40">
          <p className="text-sm text-uju-secondary">No AI agents found for this wallet.</p>
          <a
            href={`${BARAM_DASHBOARD_URL}/agents`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-sm text-pado-2 hover:underline"
          >
            Register your first agent in Nasun AI
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => {
            const storageKey = `baram:escrow-id:${walletAddress}:${agent.id}`;
            const escrowId = localStorage.getItem(storageKey);
            const balance = balances[agent.id];

            return (
              <div
                key={agent.id}
                className="p-4 rounded-xl bg-uju-card border border-uju-border/60 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white truncate">
                        {agent.name}
                      </span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${
                          agent.isActive
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-uju-secondary/10 text-uju-secondary"
                        }`}
                      >
                        {agent.isActive ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <p className="text-xs text-uju-secondary mt-0.5">{agent.role}</p>
                    <p className="text-xs text-uju-secondary/60 font-mono mt-0.5">
                      {truncate(agent.agentAddress)}
                    </p>
                  </div>
                  {escrowId && balance !== undefined ? (
                    <div className="text-right shrink-0">
                      <p className="text-xs text-uju-secondary">Escrow</p>
                      <p className="text-sm font-semibold text-white">
                        {(Number(balance) / 1e6).toFixed(2)} NUSDC
                      </p>
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <a
                    href={`${BARAM_DASHBOARD_URL}/agents/${agent.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-pado-2 hover:underline"
                  >
                    Open in Nasun AI
                  </a>
                  {!escrowId && (
                    <span className="text-uju-secondary/60">
                      Set escrow ID in Nasun AI dashboard to see balance
                    </span>
                  )}
                </div>

                {/* Telegram CTA */}
                <div className="pt-1">
                  <LinkTelegramCTA
                    agentId={agent.id}
                    agentAddress={agent.agentAddress}
                    walletAddress={walletAddress}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Baram description card */}
      <div className="p-4 rounded-xl bg-uju-card/40 border border-uju-border/40 space-y-2">
        <h4 className="text-sm font-semibold text-white">What is Nasun AI?</h4>
        <p className="text-xs text-uju-secondary leading-relaxed">
          Nasun AI is the AI compliance settlement layer on Nasun Network. Every AI execution
          produces an on-chain receipt that proves what the agent did, what it cost, and who
          authorized it. All activity is transparent and auditable.
        </p>
        <a href="/ecosystem/baram" className="inline-block text-xs text-pado-2 hover:underline">
          Learn more about Nasun AI
        </a>
      </div>
    </div>
  );
}
