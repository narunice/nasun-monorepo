import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSigner } from "@nasun/wallet";
import { NUSDC_TYPE } from "@nasun/devnet-config";
import { suiClient } from "@/lib/sui-client";
import { useAgentProfiles } from "../hooks/useAgentProfiles";
import { useAgentBudgets } from "../hooks/useAgentBudgets";
import { useTraderConfig } from "../hooks/useTraderConfig";
import { useAlphaStatus } from "../alpha/useAlphaStatus";
import { useCreateAgentBlocked } from "../alpha/useCreateAgentBlocked";
import {
  joinAlphaWaitlist,
  leaveAlphaWaitlist,
  AlphaApiError,
} from "../alpha/alphaApiClient";
import { buildAgentFundTransaction } from "../services/transactionBuilder";
import { getNusdcCoins } from "../services/coinService";
import { useAgentVaultStatus } from "../hooks/useAgentVaultStatus";
import { ActivateAgentModal } from "../components/modals/ActivateAgentModal";
import { LinkTelegramModal } from "../components/modals/LinkTelegramModal";
import { QuickStartWizardModal } from "../components/modals/QuickStartWizardModal";
import { AgentCard } from "./AgentsList";
import type { AgentSubTab } from "./AgentDetail";

// Quickstart "Telegram linked" is tracked client-side via localStorage so a
// page reload between Step 4 and Step 5 does not re-prompt for sig. The
// authoritative check still lives on chat-server (`baram_sessions`) and is
// implicit in the agent's first wake; this flag only drives stepState UI.
function tgLinkedKey(wallet: string, agent: string): string {
  return `nasun-ai-quickstart-tg-linked:${wallet.toLowerCase()}:${agent.toLowerCase()}`;
}
function readTgLinked(wallet: string, agent: string | null | undefined): boolean {
  if (!agent) return false;
  try {
    return localStorage.getItem(tgLinkedKey(wallet, agent)) === "1";
  } catch {
    return false;
  }
}
function writeTgLinked(wallet: string, agent: string): void {
  try {
    localStorage.setItem(tgLinkedKey(wallet, agent), "1");
  } catch {
    // localStorage may be disabled in private windows; ignore.
  }
}

interface SelectAgentOptions {
  sub?: AgentSubTab;
  fromQuickstart?: boolean;
}

interface QuickstartViewProps {
  walletAddress: string;
  onShowRegister: () => void;
  onSelectAgent: (id: string, opts?: SelectAgentOptions) => void;
}

function CheckIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="8"
        cy="8"
        r="8"
        fill="currentColor"
        className="text-emerald-500"
      />
      <path
        d="M4.5 8l2.5 2.5 4.5-4.5"
        stroke="white"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

type StepState = "done" | "active" | "locked";

interface StepDef {
  num: number;
  title: string;
  // Terse hint, <= 60 chars per UX rule (label + 1-line hint + Confirm).
  desc: string;
  state: StepState;
  // Active step renders this inline body inside the card. Done/locked steps
  // hide it. External actions (e.g. "+ New agent") are not needed when the
  // body provides the full form + Confirm.
  body?: React.ReactNode;
  subtext?: string;
}

function StepCard({ step }: { step: StepDef }) {
  const isDone = step.state === "done";
  const isActive = step.state === "active";
  const isLocked = step.state === "locked";

  return (
    <div
      className={[
        "rounded-xl bg-uju-card border transition-all duration-200",
        isDone
          ? "border-l-4 border-l-emerald-500 border-uju-border/40 opacity-70"
          : isActive
            ? "border-l-4 border-l-pado-2 border-uju-border/60 shadow-[0_0_0_1px_rgba(var(--color-pado-2)/0.15)]"
            : "border-uju-border/30 opacity-40",
      ].join(" ")}
    >
      <div className="p-4 flex gap-3">
        {/* Step indicator */}
        <div className="shrink-0 mt-0.5">
          {isDone ? (
            <CheckIcon />
          ) : (
            <div
              className={[
                "w-5 h-5 rounded-full border flex items-center justify-center text-xs font-bold",
                isActive
                  ? "border-pado-2 text-pado-2"
                  : "border-uju-border/60 text-uju-secondary",
              ].join(" ")}
            >
              {isLocked ? <LockIcon /> : step.num}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-white leading-snug">
            Step {step.num}. {step.title}
          </h3>
          <p className="mt-1 text-sm text-uju-secondary leading-snug">
            {step.desc}
          </p>
          {step.subtext && (
            <p className="mt-1.5 text-xs text-pado-2/80 font-medium">
              {step.subtext}
            </p>
          )}
          {isActive && step.body && (
            <div className="mt-3 pt-3 border-t border-uju-border/40">
              {step.body}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-xl bg-uju-card border border-uju-border/30 p-4 animate-pulse">
      <div className="flex gap-3">
        <div className="w-5 h-5 rounded-full bg-uju-border/40 shrink-0 mt-0.5" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-40 rounded bg-uju-border/40" />
          <div className="h-3 w-full rounded bg-uju-border/30" />
          <div className="h-3 w-3/4 rounded bg-uju-border/30" />
        </div>
      </div>
    </div>
  );
}

export function QuickstartView({
  walletAddress,
  onShowRegister,
  onSelectAgent,
}: QuickstartViewProps) {
  const { data: agents, isLoading: agentsLoading } =
    useAgentProfiles(walletAddress);
  const { data: budgets } = useAgentBudgets(walletAddress);

  const firstAgent = agents?.[0] ?? null;

  // useTraderConfig must be called unconditionally at the top level.
  const { config: traderConfig } = useTraderConfig(
    firstAgent?.agentAddress ?? null,
  );

  const hasAgents = !!agents && agents.length > 0;
  // hasBudget proxies "Fund step done" for both first-fund and resume cases:
  // the new Step ② Fund PTB always creates the budget object together with
  // the escrow trading-capital deposit, so a budget row implies both
  // balances were funded. A power user who manually creates a budget
  // without the trading deposit would still see Step ② marked done but
  // Step ⑤ Activate checks vault-side preconditions on chain.
  const hasBudget =
    !!budgets && budgets.some((b) => b.agent === firstAgent?.agentAddress);
  const hasPolicy = !!traderConfig;
  // Telegram link is tracked client-side. Set to true after LinkTelegramModal
  // closes with status='success' (deep link was generated, user signed).
  // Trust-on-confirm matches the plan v3 UX rule and avoids a second sig
  // for a session-list read every time the AI tab is opened.
  const [tgLinkedFlag, setTgLinkedFlag] = useState(() =>
    readTgLinked(walletAddress, firstAgent?.agentAddress ?? null),
  );
  useEffect(() => {
    setTgLinkedFlag(readTgLinked(walletAddress, firstAgent?.agentAddress ?? null));
  }, [walletAddress, firstAgent?.agentAddress]);
  const hasTelegram = tgLinkedFlag;
  // Setup guide Step 5 done signal. AgentProfile.is_active defaults to true
  // at create_agent time, so `agents.some(a => a.isActive)` would mark
  // Step 5 done for any wallet that has registered an agent — including
  // an agent that never reached vault upload. Track the first agent's
  // chat-server vault state instead; 'active' means the keypair landed in
  // SSM and pm2 spawned the runtime. Matches the wizard's Step 5 signal.
  const firstAgentAddress = firstAgent?.agentAddress ?? null;
  const firstAgentVault = useAgentVaultStatus(firstAgentAddress);
  const isRunning = firstAgentVault.state === "active";

  const totalBalance = useMemo(
    () => (budgets ?? []).reduce((sum, b) => sum + b.balance, 0),
    [budgets],
  );

  const completedCount = [
    hasAgents,
    hasBudget,
    hasPolicy,
    hasTelegram,
    isRunning,
  ].filter(Boolean).length;

  // Modal toggles for steps that still open a focused secondary surface:
  // Telegram link (deep link + QR) and Activate (passphrase decrypt + vault
  // upload). Both modals report success via callbacks that flip our local
  // hasTelegram/refresh-isRunning state so the stepper advances without a
  // page reload.
  const [tgModalOpen, setTgModalOpen] = useState(false);
  const [activateModalOpen, setActivateModalOpen] = useState(false);
  // Standalone wizard for end-to-end create-and-configure flow. Independent
  // of the Setup guide cards above. Existing wallet users use this to add
  // a new agent without scrolling through the guide; new users use it as
  // a single-modal alternative to the cards.
  const [wizardOpen, setWizardOpen] = useState(false);
  const queryClient = useQueryClient();

  // Keep the Setup guide expanded until every step for the first agent is
  // explicitly done. isRunning alone is insufficient — useAgentProfiles can
  // flip isActive to true the moment the agent's pm2 process is spawned,
  // before the user has funded the inference balance, set a trader policy,
  // or clicked Start, which collapsed the guide mid-onboarding.
  const isOnboarded = completedCount === 5;
  const [showGuide, setShowGuide] = useState(false);

  // Inline alpha waitlist join. The notice below shows a Join button when
  // the wallet is GP-eligible but does not yet hold (or queue for) a slot;
  // for other states the notice shows status text instead. This is the
  // only surface that lets non-invited users reach the waitlist, since
  // AlphaGate/AlphaStatusPanel are not wired into the AI tab.
  const alpha = useAlphaStatus(walletAddress);
  const { signer } = useSigner();
  const [waitlistBusy, setWaitlistBusy] = useState<"join" | "leave" | null>(
    null,
  );
  const [waitlistError, setWaitlistError] = useState<string | null>(null);
  const alphaState = alpha.status?.state;
  const alphaEligible = alpha.status?.eligible;
  const alphaGateOn = alpha.status?.capacity.gate_enabled ?? false;
  const queuePos = alpha.status?.queue_position;
  const queueDepth = alpha.status?.queue_depth;
  const inviteExpiresAt = alpha.status?.invite_expires_at ?? null;
  // Public-alpha gate for the Register CTAs. Mirrors the form-level block
  // in CreateAgentModal so non-invited users see the disabled state before
  // they even open the modal. The functional gate is in useCreateAgent.
  const createBlock = useCreateAgentBlocked(walletAddress);

  const handleJoinWaitlist = async () => {
    if (!signer) {
      setWaitlistError("Connect your wallet first.");
      return;
    }
    setWaitlistBusy("join");
    setWaitlistError(null);
    try {
      await joinAlphaWaitlist(signer, walletAddress);
      alpha.refetch();
    } catch (err) {
      const code =
        err instanceof AlphaApiError ? err.code : (err as Error).message;
      setWaitlistError(joinErrorMessage(code));
    } finally {
      setWaitlistBusy(null);
    }
  };

  const handleLeaveWaitlist = async () => {
    if (!signer) return;
    if (
      !window.confirm(
        "Leave the alpha waitlist? You can re-join later but lose your spot.",
      )
    )
      return;
    setWaitlistBusy("leave");
    setWaitlistError(null);
    try {
      await leaveAlphaWaitlist(signer, walletAddress);
      alpha.refetch();
    } catch (err) {
      const code =
        err instanceof AlphaApiError ? err.code : (err as Error).message;
      setWaitlistError(`Could not leave the waitlist (${code}).`);
    } finally {
      setWaitlistBusy(null);
    }
  };

  // Determine per-step state. The 5-step Quickstart order is:
  //   0: Register agent (PTB ① atomic setup)
  //   1: Fund agent (PTB ② create_budget + escrow::deposit, single sign)
  //   2: Set policy (TraderConfig save, off-chain signed)
  //   3: Link Telegram (deep link + bot bind, client-side trust)
  //   4: Activate (vault upload + spawn)
  // "Pick executor" from the previous layout is dropped — alpha runs a
  // single shared executor and the choice is not yet a user-facing one.
  function stepState(stepIdx: number): StepState {
    const done = [hasAgents, hasBudget, hasPolicy, hasTelegram, isRunning];
    if (done[stepIdx]) return "done";
    for (let i = 0; i < stepIdx; i++) {
      if (!done[i]) return "locked";
    }
    return "active";
  }

  // Refetch agents + budgets right after Step ② Fund or Step ⑤ Activate so
  // the stepper advances without a manual page reload. Both mutations
  // change the on-chain state the StepState reads from. Query keys must
  // match the hooks: ['nasun-ai', 'agentProfiles', wallet] and
  // ['nasun-ai', 'budgets', wallet].
  const refetchAgentState = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ["nasun-ai", "agentProfiles", walletAddress],
    });
    void queryClient.invalidateQueries({
      queryKey: ["nasun-ai", "budgets", walletAddress],
    });
  }, [queryClient, walletAddress]);

  // Step ② Fund body: NUSDC inputs + single PTB (create_budget +
  // escrow::deposit). The active alpha blocker we're fixing — every other
  // step previously had a working path but Step ② was split across the
  // Budgets page + a separate trading-capital deposit that nobody found.
  // capabilityId is required to resolve the escrow object on chain when
  // the just-minted lastSetup state is no longer available (e.g. after a
  // page reload between Step ① and Step ②).
  const step2Body =
    stepState(1) === "active" && signer && firstAgent && firstAgent.capabilityId ? (
      <Step2FundBody
        signer={signer}
        walletAddress={walletAddress}
        agentAddress={firstAgent.agentAddress}
        capabilityId={firstAgent.capabilityId}
        onFunded={refetchAgentState}
      />
    ) : null;

  const steps: StepDef[] = [
    {
      num: 1,
      title: "Register your agent",
      desc: "Pick a name and a passphrase that encrypts the key locally.",
      state: stepState(0),
      body:
        stepState(0) === "active" ? (
          <button
            type="button"
            onClick={onShowRegister}
            disabled={createBlock.blocked}
            title={createBlock.message ?? undefined}
            className="px-3 py-2 text-sm font-medium rounded-lg bg-pado-2 text-uju-bg hover:bg-pado-3 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            Open registration
          </button>
        ) : undefined,
    },
    {
      num: 2,
      title: "Fund the agent",
      desc: "Deposit NUSDC for inference and trading capital.",
      state: stepState(1),
      subtext:
        hasAgents && totalBalance === 0
          ? "No inference balance funded yet"
          : undefined,
      body: step2Body ?? undefined,
    },
    {
      num: 3,
      title: "Set trading policy",
      desc: "Trading pair, per-trade and daily caps, strategy preset.",
      state: stepState(2),
      body:
        stepState(2) === "active" && firstAgent ? (
          <button
            type="button"
            onClick={() =>
              onSelectAgent(firstAgent.id, {
                sub: "settings",
                fromQuickstart: true,
              })
            }
            className="px-3 py-2 text-sm font-medium rounded-lg bg-pado-2 text-uju-bg hover:bg-pado-3 transition-colors"
          >
            Open policy editor
          </button>
        ) : undefined,
    },
    {
      num: 4,
      title: "Link Telegram",
      desc: "Receive alerts and confirm trades from your phone.",
      state: stepState(3),
      body:
        stepState(3) === "active" && firstAgent ? (
          <button
            type="button"
            onClick={() => setTgModalOpen(true)}
            className="px-3 py-2 text-sm font-medium rounded-lg bg-pado-2 text-uju-bg hover:bg-pado-3 transition-colors"
          >
            Link Telegram
          </button>
        ) : undefined,
    },
    {
      num: 5,
      title: "Activate",
      desc: "Upload the encrypted key. Trading starts within ~5 minutes.",
      state: stepState(4),
      body:
        stepState(4) === "active" && firstAgent ? (
          <button
            type="button"
            onClick={() => setActivateModalOpen(true)}
            className="px-3 py-2 text-sm font-medium rounded-lg bg-pado-2 text-uju-bg hover:bg-pado-3 transition-colors"
          >
            Activate agent
          </button>
        ) : undefined,
    },
  ];

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

      {/* Public alpha capacity notice with inline waitlist join.
       *
       * Lives above the setup guide so every visitor sees it regardless of
       * onboarding state. The 8-tester cap is enforced backend-side
       * (NASUN_AI_ALPHA_SYSTEM_CAP=6 public + 2 admin/dev exempt slots);
       * users can browse the UI freely but agent activation queues when
       * the public pool is full.
       *
       * This is the only UI surface that exposes the waitlist join + status
       * to non-invited users. AlphaGate / AlphaStatusPanel exist but are
       * not wired anywhere, so without this inline panel the activation
       * error ("Open the AI tab to join the waitlist") would have nowhere
       * to land. */}
      {/* Quick Start: always-visible end-to-end wizard. Distinct from the
       *  Setup guide cards below — those track the first agent's progress;
       *  Quick Start always operates on a freshly-created (or freshly
       *  selected) agent inside a single modal. Useful for both new
       *  wallets and existing users adding additional agents. */}
      <div className="flex items-center justify-between gap-3 flex-wrap rounded-xl border border-pado-2/30 bg-pado-2/5 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">Quick Start</p>
          <p className="text-xs text-uju-secondary">
            Create and configure an agent end-to-end in one flow.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          disabled={createBlock.blocked}
          title={createBlock.message ?? undefined}
          className="shrink-0 px-4 py-2 text-sm font-medium rounded-lg bg-pado-2 text-uju-bg hover:bg-pado-3 transition-colors disabled:opacity-50 disabled:pointer-events-none"
        >
          Start Quick Start
        </button>
      </div>

      <AlphaNotice
        gateOn={alphaGateOn}
        state={alphaState}
        eligible={alphaEligible}
        inviteExpiresAt={inviteExpiresAt}
        queuePos={queuePos}
        queueDepth={queueDepth}
        busy={waitlistBusy}
        error={waitlistError}
        hasSigner={!!signer}
        onJoin={handleJoinWaitlist}
        onLeave={handleLeaveWaitlist}
      />

      {/* Setup guide.
       *
       * Visible while the user is still onboarding (no agent has reached
       * Step 5 / isRunning yet). Once any agent is fully active, the guide
       * collapses behind a small "Show setup guide" link so power users
       * registering additional agents aren't forced to scroll past it.
       */}
      {(!isOnboarded || showGuide) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            {isOnboarded ? (
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-sm font-medium rounded-md border border-uju-border/60 text-uju-secondary hover:text-white hover:bg-uju-bg transition-colors"
                aria-expanded="true"
                aria-controls="setup-guide-steps"
              >
                Hide setup guide
                <svg
                  width={12}
                  height={12}
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M9 7L6 4L3 7" />
                </svg>
              </button>
            ) : (
              <span className="text-sm font-semibold text-white">
                Setup guide
              </span>
            )}
            <span className="text-xs px-2 py-0.5 rounded-full bg-pado-2/10 text-pado-2 border border-pado-2/20 font-medium">
              {completedCount} / 5 complete
            </span>
          </div>

          {agentsLoading ? (
            <div id="setup-guide-steps" className="space-y-2">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : (
            <div id="setup-guide-steps" className="space-y-2">
              {steps.map((step) => (
                <StepCard key={step.num} step={step} />
              ))}
            </div>
          )}
        </div>
      )}

      {isOnboarded && !showGuide && (
        <button
          type="button"
          onClick={() => setShowGuide(true)}
          className="inline-flex items-center gap-1 px-2.5 py-1 text-sm font-medium rounded-md border border-uju-border/60 text-uju-secondary hover:text-white hover:bg-uju-bg transition-colors"
          aria-expanded="false"
          aria-controls="setup-guide-steps"
        >
          Show setup guide
          <svg
            width={12}
            height={12}
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 5L6 8L9 5" />
          </svg>
        </button>
      )}

      {/* Agent grid: only when agents exist */}
      {hasAgents && (
        <AgentsSection
          agents={agents!}
          budgets={budgets}
          onShowRegister={onShowRegister}
          onSelectAgent={onSelectAgent}
          createBlocked={createBlock.blocked}
          createBlockedMessage={createBlock.message}
        />
      )}

      {/* Step ④ Telegram link modal. Trust-on-confirm: setting tgLinkedFlag
       *  after the LinkTelegramModal close (with deepLink generated) is the
       *  client-side signal that the user has gone through /start in
       *  Telegram. The agent's first wake will surface an error if the user
       *  closed without actually completing the bot bind; they can re-open
       *  Step ④ to retry. Avoids a second wallet sig for sessions/list. */}
      {tgModalOpen && firstAgent && firstAgent.capabilityId && (
        <LinkTelegramModal
          agentAddress={firstAgent.agentAddress}
          capabilityId={firstAgent.capabilityId}
          onClose={() => setTgModalOpen(false)}
          onLinked={() => {
            writeTgLinked(walletAddress, firstAgent.agentAddress);
            setTgLinkedFlag(true);
          }}
        />
      )}

      {/* Step ⑤ Activate modal. Reuses the existing ActivateAgentModal so
       *  passphrase decrypt + vault upload + on-chain delegation stay in
       *  one well-tested code path. onActivated triggers an agent refetch
       *  so Step ⑤ flips to "done" without a page reload. */}
      {activateModalOpen && firstAgent && firstAgent.capabilityId && (
        <ActivateAgentModal
          agentId={firstAgent.id}
          agentAddress={firstAgent.agentAddress}
          agentName={firstAgent.name}
          capabilityId={firstAgent.capabilityId}
          walletAddress={walletAddress}
          onClose={() => setActivateModalOpen(false)}
          onActivated={refetchAgentState}
        />
      )}

      {wizardOpen && (
        <QuickStartWizardModal
          walletAddress={walletAddress}
          onClose={() => {
            setWizardOpen(false);
            // Pick up any new agent created inside the wizard so the
            // Setup guide / Your agents grid refresh without a reload.
            refetchAgentState();
          }}
        />
      )}
    </div>
  );
}

interface AlphaNoticeProps {
  gateOn: boolean;
  state: string | undefined;
  eligible: boolean | null | undefined;
  inviteExpiresAt: number | null;
  queuePos: number | undefined;
  queueDepth: number | undefined;
  busy: "join" | "leave" | null;
  error: string | null;
  hasSigner: boolean;
  onJoin: () => void;
  onLeave: () => void;
}

function AlphaNotice({
  gateOn,
  state,
  eligible,
  inviteExpiresAt,
  queuePos,
  queueDepth,
  busy,
  error,
  hasSigner,
  onJoin,
  onLeave,
}: AlphaNoticeProps) {
  const baseLine =
    "Nasun AI alpha test. Up to 8 testers can run an agent at the same time. If every slot is taken, your agent joins a waitlist and rotates in when one frees up (every 36 hours). Genesis Pass holders are invited first; Alliance-only holders get a testing window in a later round.";

  // active / exempt / unknown gate-off → static notice only.
  if (!gateOn || state === "active" || state === "exempt") {
    return (
      <div className="rounded-lg border border-pado-2/30 bg-pado-2/5 px-3 py-2 text-sm text-uju-secondary">
        {baseLine}
      </div>
    );
  }

  let statusLine: React.ReactNode = null;
  let action: React.ReactNode = null;

  if (state === "none") {
    if (eligible === false) {
      statusLine = (
        <span className="text-amber-200">
          Genesis Pass not detected on this wallet. Link your MetaMask on My
          Account and confirm the NFT to qualify for this round.
        </span>
      );
    } else if (eligible === true) {
      action = (
        <button
          type="button"
          onClick={onJoin}
          disabled={busy !== null || !hasSigner}
          className="shrink-0 px-3 py-1.5 text-sm rounded-md bg-pado-2 text-uju-bg font-medium hover:bg-pado-3 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {busy === "join" ? "Signing..." : "Join waitlist"}
        </button>
      );
    } else {
      statusLine = (
        <span className="text-uju-secondary/70">
          Checking Genesis Pass eligibility...
        </span>
      );
    }
  } else if (state === "waiting") {
    statusLine = (
      <span className="text-pado-2">
        On the waitlist · position #{queuePos ?? "?"}
        {queueDepth ? ` of ${queueDepth}` : ""}. We'll notify you when a slot
        opens.
      </span>
    );
    action = (
      <button
        type="button"
        onClick={onLeave}
        disabled={busy !== null}
        className="shrink-0 px-3 py-1.5 text-sm rounded-md border border-uju-border/60 text-uju-secondary hover:bg-uju-bg/60 disabled:opacity-50 transition-colors"
      >
        {busy === "leave" ? "Leaving..." : "Leave waitlist"}
      </button>
    );
  } else if (state === "invited") {
    statusLine = (
      <span className="text-pado-2 font-medium">
        Your alpha slot is ready! Activate an agent within{" "}
        {fmtRemaining(inviteExpiresAt)} to claim it.
      </span>
    );
  } else if (state === "paused") {
    statusLine = (
      <span className="text-amber-200">
        Your 36-hour session ended and the agent is paused. Funds and signing
        key are preserved.
      </span>
    );
  } else if (state === "expired") {
    statusLine = (
      <span className="text-uju-secondary/80">
        You missed two slot windows. Re-join below to try again from a fresh
        position.
      </span>
    );
    action = (
      <button
        type="button"
        onClick={onJoin}
        disabled={busy !== null || !hasSigner}
        className="shrink-0 px-3 py-1.5 text-sm rounded-md bg-pado-2 text-uju-bg font-medium hover:bg-pado-3 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {busy === "join" ? "Signing..." : "Re-join waitlist"}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-pado-2/30 bg-pado-2/5 px-3 py-2.5 text-sm text-uju-secondary space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p>{baseLine}</p>
          {statusLine && <p>{statusLine}</p>}
        </div>
        {action}
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

function fmtRemaining(expiresAt: number | null): string {
  if (!expiresAt) return "6 hours";
  const ms = expiresAt - Date.now();
  if (ms <= 0) return "0m";
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function joinErrorMessage(code: string): string {
  switch (code) {
    case "genesis_pass_required":
      return "Genesis Pass NFT is required. Alliance-only holders get a testing window in a later round.";
    case "eligibility_check_unavailable":
      return "Eligibility check is temporarily unavailable. Try again in a moment.";
    case "already_active":
      return "Your agent is already active on the alpha.";
    case "slot_exempt":
      return "This wallet is administratively exempt and does not use the waitlist.";
    case "alpha_gate_disabled":
      return "The public alpha is not open yet.";
    case "bad_signature":
      return "Signature verification failed. Please try again.";
    case "rate_limited":
      return "Too many attempts. Please wait a few minutes and try again.";
    default:
      return `Could not join the waitlist (${code}).`;
  }
}

interface AgentsSectionProps {
  agents: NonNullable<ReturnType<typeof useAgentProfiles>["data"]>;
  budgets: ReturnType<typeof useAgentBudgets>["data"];
  onShowRegister: () => void;
  onSelectAgent: (agentId: string) => void;
  /** True when the public-alpha gate denies create. Disables the
   *  "+ New agent" button and surfaces the reason via title tooltip. */
  createBlocked: boolean;
  createBlockedMessage: string | null;
}

// Lifted into its own component so the all/active/inactive filter chip state
// is scoped to the agent grid instead of leaking into QuickstartView's
// already-busy top-level state. Counts label each chip so the user can see
// the partition without flipping through filters.
function AgentsSection({
  agents,
  budgets,
  onShowRegister,
  onSelectAgent,
  createBlocked,
  createBlockedMessage,
}: AgentsSectionProps) {
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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-base font-semibold text-white">Your agents</h2>
        <button
          type="button"
          onClick={onShowRegister}
          disabled={createBlocked}
          title={createBlockedMessage ?? undefined}
          className="px-3 py-1.5 text-sm font-medium rounded-lg bg-pado-2 text-uju-bg hover:bg-pado-3 transition-colors whitespace-nowrap disabled:opacity-50 disabled:pointer-events-none"
        >
          + New agent
        </button>
      </div>

      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-uju-card/60 border border-uju-border/60 w-fit">
        {(["all", "active", "inactive"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatusFilter(key)}
            className={`px-3 py-1 text-sm rounded-md transition-colors ${
              statusFilter === key
                ? "bg-pado-2 text-uju-bg"
                : "text-uju-secondary hover:text-white"
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
  const [status, setStatus] = useState<"idle" | "submitting" | "executing" | "error">("idle");
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
  } else if (walletBalance !== null && totalRaw !== null && walletBalance < totalRaw) {
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
      const fields = (capObj.data?.content as { fields?: Record<string, unknown> })?.fields;
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
      const coins = await getNusdcCoins(suiClient, walletAddress, Number(budgetRaw + tradingRaw));

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
        throw new Error(result.effects?.status?.error ?? "Fund transaction failed");
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
