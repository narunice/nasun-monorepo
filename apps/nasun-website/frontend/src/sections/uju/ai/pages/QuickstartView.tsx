import { useMemo } from 'react';
import { useAgentProfiles } from '../hooks/useAgentProfiles';
import { useAgentBudgets } from '../hooks/useAgentBudgets';
import { useTraderConfig } from '../hooks/useTraderConfig';
import { useExecutors } from '../hooks/useExecutors';
import { AgentCard } from './AgentsList';
import { truncateAddress, formatNusdcValue } from '../utils/format';

interface QuickstartViewProps {
  walletAddress: string;
  onShowRegister: () => void;
  onOpenBudgets: () => void;
  onSelectAgent: (id: string) => void;
}

function CheckIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="8" fill="currentColor" className="text-emerald-500" />
      <path d="M4.5 8l2.5 2.5 4.5-4.5" stroke="white" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

type StepState = 'done' | 'active' | 'locked';

interface StepDef {
  num: number;
  title: string;
  desc: string;
  state: StepState;
  action?: React.ReactNode;
  subtext?: string;
}

function StepCard({ step }: { step: StepDef }) {
  const isDone = step.state === 'done';
  const isActive = step.state === 'active';
  const isLocked = step.state === 'locked';

  return (
    <div
      className={[
        'rounded-xl bg-uju-card border transition-all duration-200',
        isDone
          ? 'border-l-4 border-l-emerald-500 border-uju-border/40 opacity-70'
          : isActive
          ? 'border-l-4 border-l-pado-2 border-uju-border/60 shadow-[0_0_0_1px_rgba(var(--color-pado-2)/0.15)]'
          : 'border-uju-border/30 opacity-40',
      ].join(' ')}
    >
      <div className="p-4 flex gap-3">
        {/* Step indicator */}
        <div className="shrink-0 mt-0.5">
          {isDone ? (
            <CheckIcon />
          ) : (
            <div
              className={[
                'w-5 h-5 rounded-full border flex items-center justify-center text-xs font-bold',
                isActive
                  ? 'border-pado-2 text-pado-2'
                  : 'border-uju-border/60 text-uju-secondary',
              ].join(' ')}
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
                <p className="mt-1.5 text-xs text-pado-2/80 font-medium">{step.subtext}</p>
              )}
            </div>
            {step.action && (
              <div className="shrink-0 mt-0.5">
                {step.action}
              </div>
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
  const { data: agents, isLoading: agentsLoading } = useAgentProfiles(walletAddress);
  const { data: budgets } = useAgentBudgets(walletAddress);
  const { executors } = useExecutors();

  const firstAgent = agents?.[0] ?? null;

  // useTraderConfig must be called unconditionally at the top level.
  const { config: traderConfig } = useTraderConfig(firstAgent?.agentAddress ?? null);

  const activeExecutors = useMemo(
    () => executors.filter((e) => e.isActive && !e.isDormant),
    [executors],
  );
  const defaultExecutor = activeExecutors[0];

  const hasAgents = !!agents && agents.length > 0;
  const hasBudget = !!budgets && budgets.some((b) => b.balance > 0);
  const hasPolicy = !!traderConfig;
  const isRunning = !!agents && agents.some((a) => a.isActive);

  const totalBalance = useMemo(
    () => (budgets ?? []).reduce((sum, b) => sum + b.balance, 0),
    [budgets],
  );

  const completedCount = [hasAgents, hasBudget, hasAgents, hasPolicy, isRunning].filter(Boolean).length;

  // Determine per-step state
  function stepState(stepIdx: number): StepState {
    // Completion status array for each step (0-indexed)
    const done = [hasAgents, hasBudget, hasAgents, hasPolicy, isRunning];
    if (done[stepIdx]) return 'done';
    // A step is active if all previous steps are done
    for (let i = 0; i < stepIdx; i++) {
      if (!done[i]) return 'locked';
    }
    return 'active';
  }

  const steps: StepDef[] = [
    {
      num: 1,
      title: 'Register your agent',
      desc: 'Pick a name and a passphrase. The passphrase encrypts your agent\'s keypair locally. Lose it and the agent is gone forever, so back up the recovery key shown next.',
      state: stepState(0),
      action: stepState(0) !== 'done' ? (
        <button
          type="button"
          onClick={onShowRegister}
          disabled={stepState(0) === 'locked'}
          className="px-3 py-1.5 text-sm font-medium rounded-lg bg-pado-2 text-uju-bg hover:bg-pado-3 transition-colors disabled:pointer-events-none whitespace-nowrap"
        >
          Register Agent
        </button>
      ) : null,
    },
    {
      num: 2,
      title: 'Fund the agent\'s budget',
      desc: 'Your agent spends from a Budget you control. Top up with NASUN for gas and NUSDC for trading. You can withdraw any time.',
      state: stepState(1),
      subtext: hasAgents && totalBalance > 0
        ? `Current: ${formatNusdcValue(totalBalance)} NUSDC`
        : hasAgents
        ? 'No budget funded yet'
        : undefined,
      action: stepState(1) !== 'done' ? (
        <button
          type="button"
          onClick={onOpenBudgets}
          disabled={stepState(1) === 'locked'}
          className="px-3 py-1.5 text-sm font-medium rounded-lg border border-pado-2 text-pado-2 hover:bg-pado-2/10 transition-colors disabled:pointer-events-none whitespace-nowrap"
        >
          Fund Budget
        </button>
      ) : (
        <span className="text-xs px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 whitespace-nowrap">
          {formatNusdcValue(totalBalance)} NUSDC
        </span>
      ),
    },
    {
      num: 3,
      title: 'Pick an executor',
      desc: 'The executor runs your agent\'s inference and signs the onchain settlement. For the prototype, Nasun operates a single shared executor. (Coming later: a marketplace of competing executors, bring-your-own AI API key, and self-hosted inference with locally-served models.)',
      state: stepState(2),
      action: stepState(2) === 'done' ? (
        <span className="text-xs px-2 py-1 rounded bg-uju-bg border border-uju-border/60 text-uju-secondary font-mono whitespace-nowrap">
          {defaultExecutor ? truncateAddress(defaultExecutor.operator) : '0x286d…9b78'}
        </span>
      ) : (
        <span className="text-xs px-2 py-1 rounded bg-uju-bg border border-uju-border/40 text-uju-secondary/60 font-mono whitespace-nowrap">
          {defaultExecutor ? truncateAddress(defaultExecutor.operator) : '—'}
        </span>
      ),
    },
    {
      num: 4,
      title: 'Write the policy',
      desc: 'Tell the agent how to think. Trading pair, max position, risk constraints, cadence. Plain text. The policy is part of every onchain report.',
      state: stepState(3),
      action: (
        <button
          type="button"
          onClick={() => firstAgent && onSelectAgent(firstAgent.id)}
          disabled={stepState(3) === 'locked' || !firstAgent}
          className="px-3 py-1.5 text-sm font-medium rounded-lg border border-uju-border/60 text-uju-secondary hover:border-pado-2/60 hover:text-pado-2 transition-colors disabled:pointer-events-none whitespace-nowrap"
        >
          Open editor
        </button>
      ),
    },
    {
      num: 5,
      title: 'Start',
      desc: 'The agent wakes on your cadence, reads the market, reasons, trades, and writes an Agent Execution Report onchain. You see every report, every trade, every cost, in real time below.',
      state: stepState(4),
      action: (
        <button
          type="button"
          onClick={() => firstAgent && onSelectAgent(firstAgent.id)}
          disabled={stepState(4) === 'locked' || !firstAgent}
          className="px-3 py-1.5 text-sm font-medium rounded-lg border border-uju-border/60 text-uju-secondary hover:border-pado-2/60 hover:text-pado-2 transition-colors disabled:pointer-events-none whitespace-nowrap"
        >
          {isRunning ? 'View agent' : 'Go to agent'}
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Hero — only when no agents yet */}
      {!agentsLoading && !hasAgents && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-uju-bg via-pado-4/10 to-uju-card border border-pado-2/20 p-6 md:p-8">
          {/* Subtle grid texture */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
              backgroundSize: '32px 32px',
            }}
          />
          <div className="relative space-y-4 max-w-xl">
            <p className="text-xs font-semibold tracking-widest uppercase text-pado-2/80">
              Nasun AI
            </p>
            <h2 className="text-2xl md:text-3xl font-bold text-white leading-tight">
              Give your AI agent a wallet, a budget, and a permanent audit trail.
            </h2>
            <p className="text-sm text-uju-secondary leading-relaxed">
              Your agent runs on Nasun, a Move-based Layer 1. Every decision it makes
              — authority, model, cost, reasoning, action — is recorded onchain, forever.
              The first available agent is an autonomous trader on Pado DEX.
            </p>
            <button
              type="button"
              onClick={onShowRegister}
              className="inline-flex items-center gap-2 px-6 py-3 bg-pado-2 text-uju-bg rounded-xl font-semibold text-sm hover:bg-pado-3 transition-colors"
            >
              Create your first agent
              <svg width={16} height={16} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Setup guide */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-white">Setup guide</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-pado-2/10 text-pado-2 border border-pado-2/20 font-medium">
            {completedCount} / 5 complete
          </span>
        </div>

        {agentsLoading ? (
          <div className="space-y-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : (
          <div className="space-y-2">
            {steps.map((step) => (
              <StepCard key={step.num} step={step} />
            ))}
          </div>
        )}
      </div>

      {/* Agent grid — only when agents exist */}
      {hasAgents && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-white">Your agents</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {agents!.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                budget={budgets?.find((b) => b.agent === agent.agentAddress)}
                onSelect={() => onSelectAgent(agent.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
