import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSigner } from "@nasun/wallet";
import { NUSDC_TYPE } from "@nasun/devnet-config";
import { suiClient } from "@/lib/sui-client";
import { useAgentProfiles } from "../hooks/useAgentProfiles";
import { useAgentBudgets } from "../hooks/useAgentBudgets";
import { useCreateAgentBlocked } from "../alpha/useCreateAgentBlocked";
import { buildAgentFundTransaction } from "../services/transactionBuilder";
import { getNusdcCoins } from "../services/coinService";
import { QuickStartWizardModal } from "../components/modals/QuickStartWizardModal";
import { AgentCard } from "./AgentsList";
import type { AgentSubTab } from "./AgentDetail";

interface SelectAgentOptions {
  sub?: AgentSubTab;
  fromQuickstart?: boolean;
}

interface QuickstartViewProps {
  walletAddress: string;
  onShowRegister: () => void;
  onSelectAgent: (id: string, opts?: SelectAgentOptions) => void;
}

export function QuickstartView({
  walletAddress,
  onShowRegister,
  onSelectAgent,
}: QuickstartViewProps) {
  const { data: agents, isLoading: agentsLoading } =
    useAgentProfiles(walletAddress);
  const { data: budgets } = useAgentBudgets(walletAddress);

  const hasAgents = !!agents && agents.length > 0;

  // Standalone wizard for end-to-end create-and-configure flow. Single-modal
  // path for both new wallets and existing users adding additional agents.
  const [wizardOpen, setWizardOpen] = useState(false);
  const queryClient = useQueryClient();

  // Public-alpha gate for the Register CTAs. Mirrors the form-level block
  // in CreateAgentModal so non-invited users see the disabled state before
  // they even open the modal. The functional gate is in useCreateAgent.
  const createBlock = useCreateAgentBlocked(walletAddress);

  // Refetch agents + budgets after the wizard closes so a newly created
  // agent shows up in the Your agents grid without a manual page reload.
  const refetchAgentState = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ["nasun-ai", "agentProfiles", walletAddress],
    });
    void queryClient.invalidateQueries({
      queryKey: ["nasun-ai", "budgets", walletAddress],
    });
  }, [queryClient, walletAddress]);

  return (
    <div className="space-y-6">
      {/* Hero: only when no agents yet */}
      {!agentsLoading && !hasAgents && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-uju-bg via-pado-4/10 to-uju-card border border-pado-2/20 p-6 md:p-8">
          {/* Subtle grid texture */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />
          <div className="relative space-y-4 max-w-xl">
            <p className="text-xs font-semibold tracking-widest uppercase text-pado-2/80">
              Nasun AI
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-white leading-tight">
              Give your AI agent a trading wallet, an inference balance, and a
              permanent audit trail.
            </h2>
            <p className="text-sm text-uju-secondary leading-relaxed">
              Your agent runs on Nasun, a Move-based Layer 1. Every decision it
              makes (authority, model, cost, reasoning, action) is recorded
              onchain, forever. The first available agent is an autonomous
              trader on Pado DEX.
            </p>
            <button
              type="button"
              onClick={onShowRegister}
              disabled={createBlock.blocked}
              title={createBlock.message ?? undefined}
              className="inline-flex items-center gap-2 px-6 py-3 bg-pado-2 text-uju-bg rounded-xl font-semibold text-sm hover:bg-pado-3 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              Create your first agent
              <svg
                width={16}
                height={16}
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Quick Start: always-visible end-to-end wizard. Creates and configures
       *  an agent in a single modal flow. Highlighted in lime so it reads as
       *  the primary CTA on this page. */}
      <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-pado-5/40 bg-gradient-to-br from-pado-5/10 via-pado-5/5 to-transparent px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-pado-5">Quick Start</p>
          <p className="text-xs text-uju-secondary">
            Create and configure an agent end-to-end in one flow.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          disabled={createBlock.blocked}
          title={createBlock.message ?? undefined}
          className="shrink-0 px-4 py-2 text-sm font-semibold rounded-lg bg-gradient-to-r from-pado-4 via-pado-5 to-pado-5 text-uju-bg hover:from-pado-5 hover:via-pado-5 hover:to-pado-4 transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          Quick Start New Agent
        </button>
      </div>

      {/* Agent grid: only when agents exist */}
      {hasAgents && (
        <AgentsSection
          agents={agents!}
          budgets={budgets}
          onSelectAgent={onSelectAgent}
        />
      )}

      {wizardOpen && (
        <QuickStartWizardModal
          walletAddress={walletAddress}
          onClose={() => {
            setWizardOpen(false);
            // Pick up any new agent created inside the wizard so the
            // Your agents grid refreshes without a reload.
            refetchAgentState();
          }}
        />
      )}
    </div>
  );
}

interface AgentsSectionProps {
  agents: NonNullable<ReturnType<typeof useAgentProfiles>["data"]>;
  budgets: ReturnType<typeof useAgentBudgets>["data"];
  onSelectAgent: (agentId: string) => void;
}

// Lifted into its own component so the all/active/inactive filter chip state
// is scoped to the agent grid instead of leaking into QuickstartView's
// already-busy top-level state. Counts label each chip so the user can see
// the partition without flipping through filters.
function AgentsSection({ agents, budgets, onSelectAgent }: AgentsSectionProps) {
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "inactive"
  >("active");
  const counts = useMemo(() => {
    const active = agents.filter((a) => a.isActive).length;
    return { all: agents.length, active, inactive: agents.length - active };
  }, [agents]);
  const filtered = useMemo(() => {
    if (statusFilter === "active") return agents.filter((a) => a.isActive);
    if (statusFilter === "inactive") return agents.filter((a) => !a.isActive);
    return agents;
  }, [agents, statusFilter]);

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-white">Agents</h2>

      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-uju-card/60 border border-uju-border/60 w-fit">
        {(["all", "active", "inactive"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatusFilter(key)}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              statusFilter === key
                ? "bg-pado-2 text-uju-bg font-semibold"
                : "text-uju-secondary hover:text-white font-medium"
            }`}
          >
            {key === "all" ? "All" : key === "active" ? "Active" : "Inactive"}
            <span className="ml-1.5 text-xs opacity-70">{counts[key]}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="py-10 text-center bg-uju-card/40 rounded-xl border border-uju-border/40">
          <p className="text-sm text-uju-secondary">
            No {statusFilter} agents.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              budget={budgets?.find((b) => b.agent === agent.agentAddress)}
              onSelect={() => onSelectAgent(agent.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// =========================================================================
// Step ② Fund body — single PTB combines budget::create_budget (inference
// balance) and escrow::deposit<NUSDC> (trading capital). The active alpha
// blocker: the previous flow required users to (a) go to the Budgets page
// to create a budget, and separately (b) figure out where to top up the
// escrow trading capital. Users completed neither cleanly; 9 alpha day-1
// agents but zero spot trades.
// =========================================================================

export interface Step2FundBodyProps {
  // useSigner.signer is `unknown` to React types but `WalletSigner` at
  // runtime. We treat it opaquely and let buildAgentFundTransaction +
  // executeTransactionBlock unwrap as needed.
  signer: NonNullable<ReturnType<typeof useSigner>["signer"]>;
  walletAddress: string;
  agentAddress: string;
  capabilityId: string;
  onFunded: () => void;
}

// NUSDC has 6 decimal places (mirrors usdc::DECIMALS in the move module).
const NUSDC_DECIMALS = 6n;
const NUSDC_UNIT = 10n ** NUSDC_DECIMALS;

export function Step2FundBody({
  signer,
  walletAddress,
  agentAddress,
  capabilityId,
  onFunded,
}: Step2FundBodyProps) {
  // Defaults: 5 NUSDC inference balance + 500 NUSDC trading capital. nasun
  // devnet NUSDC has no monetary value so users can fund generously, and
  // 500 is enough capital for the first trades to feel real instead of
  // dust-sized.
  const [budgetInput, setBudgetInput] = useState("5");
  const [tradingInput, setTradingInput] = useState("500");
  const [walletBalance, setWalletBalance] = useState<bigint | null>(null);
  const [status, setStatus] = useState<
    "idle" | "submitting" | "executing" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  // Wallet NUSDC balance, refreshed when capabilityId or walletAddress
  // changes (i.e. a different agent enters Step ②). suiClient.getBalance
  // is a single RPC call; no need for a heavier hook.
  useEffect(() => {
    let cancelled = false;
    void suiClient
      .getBalance({ owner: walletAddress, coinType: NUSDC_TYPE })
      .then((b) => {
        if (!cancelled) setWalletBalance(BigInt(b.totalBalance));
      })
      .catch(() => {
        if (!cancelled) setWalletBalance(0n);
      });
    return () => {
      cancelled = true;
    };
  }, [walletAddress, capabilityId]);

  const budgetRaw = parseDecimalNusdc(budgetInput);
  const tradingRaw = parseDecimalNusdc(tradingInput);
  const totalRaw =
    budgetRaw !== null && tradingRaw !== null ? budgetRaw + tradingRaw : null;

  // Validation: both fields parse, both >= MIN_DEPOSIT (0.1 NUSDC per the
  // move module assertion in budget.move L41), and wallet has enough.
  const minDeposit = 100_000n; // 0.1 NUSDC raw
  let validationError: string | null = null;
  if (budgetRaw === null || tradingRaw === null) {
    validationError = "Enter a positive number for each field.";
  } else if (budgetRaw < minDeposit) {
    validationError = "Inference balance must be at least 0.1 NUSDC.";
  } else if (tradingRaw <= 0n) {
    validationError = "Trading capital must be greater than 0.";
  } else if (
    walletBalance !== null &&
    totalRaw !== null &&
    walletBalance < totalRaw
  ) {
    const need = formatNusdc(totalRaw);
    const have = formatNusdc(walletBalance);
    validationError = `Insufficient NUSDC. Need ${need}, have ${have}. Use the faucet.`;
  }

  const handleConfirm = async () => {
    if (validationError || budgetRaw === null || tradingRaw === null) return;
    setError(null);
    setStatus("submitting");
    try {
      // Resolve the escrow id from the capability object so a page reload
      // between Step ① and Step ② still works (lastSetup in useCreateAgent
      // may be cleared). capability.escrow_id is set by Cmd 4 of the
      // atomic setup PTB and persists for the life of the agent.
      const capObj = await suiClient.getObject({
        id: capabilityId,
        options: { showContent: true },
      });
      const fields = (
        capObj.data?.content as { fields?: Record<string, unknown> }
      )?.fields;
      const escrowIdField = fields?.["escrow_id"];
      let escrowId: string | null = null;
      if (typeof escrowIdField === "string") {
        escrowId = escrowIdField;
      } else if (
        escrowIdField &&
        typeof escrowIdField === "object" &&
        "fields" in (escrowIdField as Record<string, unknown>)
      ) {
        // Option<ID> sometimes serializes as { fields: { id: '0x..' } }.
        const inner = (escrowIdField as { fields?: { id?: string } }).fields;
        if (typeof inner?.id === "string") escrowId = inner.id;
      }
      if (!escrowId) {
        throw new Error(
          "Could not resolve escrow id from capability. Try reloading the page.",
        );
      }

      // Coins selection: NUSDC type assertion is enforced inside
      // getNusdcCoins by reading coinType from each entry. Insufficient
      // balance throws before signing so the user does not see a wallet
      // popup that's doomed to fail.
      const coins = await getNusdcCoins(
        suiClient,
        walletAddress,
        Number(budgetRaw + tradingRaw),
      );

      const tx = buildAgentFundTransaction({
        coins,
        agentAddress,
        escrowId,
        budgetDeposit: budgetRaw,
        tradingCapitalDeposit: tradingRaw,
      });
      tx.setSender(walletAddress);
      const txBytes = await tx.build({ client: suiClient });
      const { signature } = await signer.sign(txBytes);

      setStatus("executing");
      const result = await suiClient.executeTransactionBlock({
        transactionBlock: txBytes,
        signature,
        options: { showEffects: true, showObjectChanges: true },
      });
      if (result.effects?.status?.status !== "success") {
        throw new Error(
          result.effects?.status?.error ?? "Fund transaction failed",
        );
      }
      await suiClient.waitForTransaction({ digest: result.digest });
      onFunded();
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fund failed");
      setStatus("error");
    }
  };

  const busy = status === "submitting" || status === "executing";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-uju-secondary">Inference (NUSDC)</span>
          <input
            type="number"
            min="0.1"
            step="0.1"
            value={budgetInput}
            onChange={(e) => setBudgetInput(e.target.value)}
            disabled={busy}
            className="mt-1 w-full px-3 py-2 text-sm rounded-lg bg-uju-bg border border-uju-border/60 text-white focus:outline-none focus:border-pado-2 transition-colors"
          />
        </label>
        <label className="block">
          <span className="text-xs text-uju-secondary">Trading (NUSDC)</span>
          <input
            type="number"
            min="0"
            step="1"
            value={tradingInput}
            onChange={(e) => setTradingInput(e.target.value)}
            disabled={busy}
            className="mt-1 w-full px-3 py-2 text-sm rounded-lg bg-uju-bg border border-uju-border/60 text-white focus:outline-none focus:border-pado-2 transition-colors"
          />
        </label>
      </div>
      <p className="text-xs text-uju-secondary/80">
        Wallet:{" "}
        {walletBalance === null ? "..." : `${formatNusdc(walletBalance)} NUSDC`}
      </p>
      {validationError && (
        <p className="text-sm text-amber-300">{validationError}</p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="button"
        disabled={busy || !!validationError}
        onClick={() => void handleConfirm()}
        className="px-3 py-2 text-sm font-medium rounded-lg bg-pado-2 text-uju-bg hover:bg-pado-3 transition-colors disabled:opacity-50 disabled:pointer-events-none"
      >
        {status === "submitting"
          ? "Signing..."
          : status === "executing"
            ? "Submitting..."
            : "Confirm and sign"}
      </button>
    </div>
  );
}

// Decimal NUSDC string → raw u64 bigint. Returns null on parse failure or
// when the value would round to <= 0. Accepts up to 6 decimals; extras are
// truncated (not rounded) to match how the wallet would split the coin.
function parseDecimalNusdc(s: string): bigint | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  const m = /^(\d*)(?:\.(\d{0,6}))?\d*$/.exec(trimmed);
  if (!m) return null;
  const whole = m[1] || "0";
  const frac = (m[2] || "").padEnd(6, "0");
  if (!/^\d+$/.test(whole) || !/^\d+$/.test(frac)) return null;
  const raw = BigInt(whole) * NUSDC_UNIT + BigInt(frac);
  if (raw <= 0n) return null;
  return raw;
}

function formatNusdc(raw: bigint): string {
  const whole = raw / NUSDC_UNIT;
  const frac = raw % NUSDC_UNIT;
  if (frac === 0n) return whole.toString();
  // Trim trailing zeros so 5.000000 → 5, 5.500000 → 5.5.
  const fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "");
  return fracStr ? `${whole}.${fracStr}` : whole.toString();
}
