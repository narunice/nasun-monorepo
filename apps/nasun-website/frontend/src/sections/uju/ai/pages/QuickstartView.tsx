import { useMemo, useState } from "react";
import { useSigner } from "@nasun/wallet";
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
import { AgentCard } from "./AgentsList";
import type { AgentSubTab } from "./AgentDetail";

interface SelectAgentOptions {
  sub?: AgentSubTab;
  fromQuickstart?: boolean;
}

interface QuickstartViewProps {
  walletAddress: string;
  onShowRegister: () => void;
  onOpenBudgets: (agentAddress?: string) => void;
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
  desc: string;
  state: StepState;
  action?: React.ReactNode;
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
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white leading-snug">
                Step {step.num}. {step.title}
              </h3>
              <p className="mt-1 text-sm text-uju-secondary leading-relaxed">
                {step.desc}
              </p>
              {step.subtext && (
                <p className="mt-1.5 text-xs text-pado-2/80 font-medium">
                  {step.subtext}
                </p>
              )}
            </div>
            {step.action && (
              <div className="shrink-0 mt-0.5">{step.action}</div>
            )}
          </div>
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
  onOpenBudgets,
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
  const hasBudget =
    !!budgets && budgets.some((b) => b.agent === firstAgent?.agentAddress);
  const hasPolicy = !!traderConfig;
  const isRunning = !!agents && agents.some((a) => a.isActive);

  const totalBalance = useMemo(
    () => (budgets ?? []).reduce((sum, b) => sum + b.balance, 0),
    [budgets],
  );

  const completedCount = [
    hasAgents,
    hasBudget,
    hasAgents,
    hasPolicy,
    isRunning,
  ].filter(Boolean).length;

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

  // Determine per-step state
  function stepState(stepIdx: number): StepState {
    // Completion status array for each step (0-indexed)
    const done = [hasAgents, hasBudget, hasAgents, hasPolicy, isRunning];
    if (done[stepIdx]) return "done";
    // A step is active if all previous steps are done
    for (let i = 0; i < stepIdx; i++) {
      if (!done[i]) return "locked";
    }
    return "active";
  }

  const steps: StepDef[] = [
    {
      num: 1,
      title: "Register your agent",
      desc: "Pick a name and a passphrase. The passphrase encrypts your agent's keypair locally. Lose it and the agent is gone forever, so back up the recovery key shown next.",
      state: stepState(0),
      action: (
        <button
          type="button"
          onClick={onShowRegister}
          disabled={stepState(0) === "locked" || createBlock.blocked}
          title={createBlock.message ?? undefined}
          className="px-3 py-1.5 text-sm font-medium rounded-lg border border-uju-border/60 text-uju-secondary hover:border-pado-2/60 hover:text-pado-2 transition-colors disabled:pointer-events-none disabled:opacity-50 whitespace-nowrap"
        >
          Open registration
        </button>
      ),
    },
    {
      num: 2,
      title: "Fund the agent's inference balance",
      desc: "Your agent pays for every AI inference it runs. Top up NUSDC here to cover that cost. You can withdraw any time.",
      state: stepState(1),
      subtext:
        hasAgents && totalBalance === 0
          ? "No inference balance funded yet"
          : undefined,
      action: (
        <button
          type="button"
          onClick={() => onOpenBudgets(firstAgent?.agentAddress)}
          disabled={stepState(1) === "locked"}
          className="px-3 py-1.5 text-sm font-medium rounded-lg border border-uju-border/60 text-uju-secondary hover:border-pado-2/60 hover:text-pado-2 transition-colors disabled:pointer-events-none whitespace-nowrap"
        >
          Open inference balance
        </button>
      ),
    },
    {
      num: 3,
      title: "Pick an executor",
      desc: "The executor runs your agent's inference and signs the onchain settlement. For this prototype, Nasun operates a single shared executor. On the roadmap, more executors will join and you'll be able to choose by model, reputation, price, or TEE-backed execution.",
      state: stepState(2),
      action: (
        <button
          type="button"
          onClick={() =>
            firstAgent &&
            onSelectAgent(firstAgent.id, {
              sub: "settings",
              fromQuickstart: true,
            })
          }
          disabled={stepState(2) === "locked" || !firstAgent}
          className="px-3 py-1.5 text-sm font-medium rounded-lg border border-uju-border/60 text-uju-secondary hover:border-pado-2/60 hover:text-pado-2 transition-colors disabled:pointer-events-none whitespace-nowrap"
        >
          Open executor
        </button>
      ),
    },
    {
      num: 4,
      title: "Configure the agent",
      desc: "Open the agent's Settings to choose the trading pair, position and risk caps, cadence, and a custom prompt that tells the agent how to think. Every value is included in each onchain report.",
      state: stepState(3),
      action: (
        <button
          type="button"
          onClick={() =>
            firstAgent &&
            onSelectAgent(firstAgent.id, {
              sub: "settings",
              fromQuickstart: true,
            })
          }
          disabled={stepState(3) === "locked" || !firstAgent}
          className="px-3 py-1.5 text-sm font-medium rounded-lg border border-uju-border/60 text-uju-secondary hover:border-pado-2/60 hover:text-pado-2 transition-colors disabled:pointer-events-none whitespace-nowrap"
        >
          Open editor
        </button>
      ),
    },
    {
      num: 5,
      title: "Start",
      desc: "The agent wakes on your cadence, reads the market, reasons, trades, and writes an Agent Execution Report onchain. You see every report, every trade, every cost, in real time below.",
      state: stepState(4),
      action: isRunning ? null : (
        <button
          type="button"
          onClick={() =>
            firstAgent &&
            onSelectAgent(firstAgent.id, {
              sub: "overview",
              fromQuickstart: true,
            })
          }
          disabled={stepState(4) === "locked" || !firstAgent}
          className={[
            "px-3 py-1.5 text-sm font-medium rounded-lg transition-colors disabled:pointer-events-none whitespace-nowrap",
            stepState(4) === "active"
              ? "bg-pado-2 text-uju-bg hover:bg-pado-3"
              : "border border-uju-border/60 text-uju-secondary hover:border-pado-2/60 hover:text-pado-2",
          ].join(" ")}
        >
          {stepState(4) === "active" ? "Activate agent" : "Go to agent"}
        </button>
      ),
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
