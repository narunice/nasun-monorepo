/**
 * QuickStartWizardModal — guided 5-step flow that creates a brand-new
 * Nasun AI agent and walks the user through fund, policy, telegram, and
 * activation in one continuous surface. Independent of the Setup guide
 * cards on QuickstartView, which still track the *first* agent's progress.
 *
 * The wizard always starts at Step 1 (register a new agent) so existing
 * wallet users can use the same entry to add additional agents.
 *
 * Reuses existing form components where possible:
 *   - Step 2: Step2FundBody (from QuickstartView)  -> handled inline below
 *   - Step 3: TraderConfigForm                     -> existing component
 *   - Step 4: LinkTelegramModal                    -> child modal trigger
 *   - Step 5: ActivateAgentModal                   -> child modal trigger
 *
 * Resume: the only persisted state is the freshly-created agent address.
 * Closing the wizard mid-flow loses local state, but the user's chain
 * state survives so they can either re-open the wizard for the same
 * agent (picked up via createdAt heuristic) or finish the remaining
 * steps via the Setup guide cards on QuickstartView.
 */

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSigner } from '@nasun/wallet';
import { useAgentProfiles } from '../../hooks/useAgentProfiles';
import { useAgentBudgets } from '../../hooks/useAgentBudgets';
import { useTraderConfig } from '../../hooks/useTraderConfig';
import { useCreateAgent } from '../../hooks/useCreateAgent';
import { useAerRecords } from '../../hooks/useAerRecords';
import { useAgentVaultStatus } from '../../hooks/useAgentVaultStatus';
import { useCreateAgentBlocked } from '../../alpha/useCreateAgentBlocked';
import { TraderConfigForm } from '../forms/TraderConfigForm';
import { Step2FundBody } from '../../pages/QuickstartView';
import { LinkTelegramModal } from './LinkTelegramModal';
import { ActivateAgentModal } from './ActivateAgentModal';

// Same localStorage key shape as QuickstartView uses for the Setup guide
// so a Telegram link completed in the wizard also marks Step 4 done on
// the Setup guide (the agent address is the same).
function tgLinkedKey(wallet: string, agent: string): string {
  return `nasun-ai-quickstart-tg-linked:${wallet.toLowerCase()}:${agent.toLowerCase()}`;
}
function readTgLinked(wallet: string, agent: string | null): boolean {
  if (!agent) return false;
  try {
    return localStorage.getItem(tgLinkedKey(wallet, agent)) === '1';
  } catch {
    return false;
  }
}
function writeTgLinked(wallet: string, agent: string): void {
  try {
    localStorage.setItem(tgLinkedKey(wallet, agent), '1');
  } catch {
    // private window or storage quota — best effort.
  }
}

interface WizardAgentRef {
  id: string;
  address: string;
  capabilityId: string;
  name: string;
}

interface QuickStartWizardModalProps {
  walletAddress: string;
  onClose: () => void;
}

const inputBase =
  'w-full px-3 py-2 text-sm rounded-lg bg-uju-bg border border-uju-border/60 text-white placeholder:text-uju-secondary/60 focus:outline-none focus:border-pado-2 transition-colors';

export function QuickStartWizardModal({
  walletAddress,
  onClose,
}: QuickStartWizardModalProps) {
  const { signer } = useSigner();
  const createBlock = useCreateAgentBlocked(walletAddress);

  // Track the agent this wizard run operates on. Populated by Step 1
  // success OR by the resume chooser (continuing an incomplete agent).
  const [wizardAgent, setWizardAgent] = useState<WizardAgentRef | null>(null);

  // Two-phase wizard: 'choose' shows the resume / new-agent chooser when
  // the wallet has at least one incomplete agent; 'wizard' runs the actual
  // 5-step flow. We default to 'choose' and the useEffect below downgrades
  // to 'wizard' once we've determined there's nothing to resume.
  const [phase, setPhase] = useState<'choose' | 'wizard'>('choose');

  // Chain state for the wizard's agent. refetch is called on wizard mount
  // so a freshly created agent (e.g. user closed the wizard right after
  // Step 1 and re-opens it) shows up in the chooser without waiting for
  // the next polling interval.
  const { data: agents, refetch: refetchAgents } = useAgentProfiles(walletAddress);
  // useTraderConfig owns both the policy state and the save logic.
  // TraderConfigForm delegates persistence via its onSave prop, so we
  // need to thread `save` into the wizard's Step 3 body. Without this,
  // the form's Save button just resolves immediately and the policy is
  // never persisted, leaving Step 3 stuck active forever.
  const traderConfigState = useTraderConfig(wizardAgent?.address ?? null);
  const traderConfig = traderConfigState.config;
  const traderConfigSave = traderConfigState.save;

  // AER records for the wallet. "Never inferenced" agents are the only
  // ones worth resuming — once an agent has emitted a cognition or trade
  // AER, the user has effectively finished the wizard for it and any
  // further work belongs in the agent's Settings/Activity tab. We map
  // each AER to its agent via `capability_id` (AgentProfile owns one
  // capability) so the filter is exact.
  const { data: aerRecords } = useAerRecords(walletAddress);
  const usedCapabilityIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of aerRecords ?? []) {
      if (r.capabilityId) s.add(r.capabilityId.toLowerCase());
    }
    return s;
  }, [aerRecords]);

  // Force a one-shot refetch on wizard mount so the chooser sees agents
  // created in a previous wizard session (e.g. user created Jane,
  // closed the wizard before Step 2). Without this the cached
  // useAgentProfiles result may be older than the just-minted agent.
  useEffect(() => {
    void refetchAgents();
    // Mount-only intentionally.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Agents the user could plausibly resume:
  //   1. capabilityId present — subsequent wizard steps need it.
  //   2. no AER history — the agent has never run a cognition or trade.
  //
  // We intentionally do NOT check `isActive`. AgentProfile.is_active is a
  // Move-level enabled flag that defaults to true at create_agent time;
  // it is decoupled from the actual chat-server spawn / vault state. An
  // agent can be is_active=true while never having emitted a single AER
  // (the alpha day-1 incident shape: PTB ① landed but the user closed
  // the wizard before fund/policy/telegram/activate). Using AER history
  // as the sole "ever exercised" signal matches the user's intent
  // ("추론 한 번도 안 했던 에이전트만").
  const resumableAgents = useMemo(
    () =>
      (agents ?? []).filter(
        (a) =>
          typeof a.capabilityId === 'string' &&
          a.capabilityId &&
          !usedCapabilityIds.has(a.capabilityId.toLowerCase()),
      ),
    [agents, usedCapabilityIds],
  );

  // Phase decision waits for both agents and aerRecords to load. We don't
  // latch the decision — if a refetch surfaces a new resumable agent
  // while still on the chooser, the user sees it. Once we transition to
  // 'wizard' (auto-skip or chooser click), we stay there.
  useEffect(() => {
    if (phase !== 'choose') return;
    // Wait for both queries to settle (undefined = still loading).
    if (agents === undefined || aerRecords === undefined) return;
    if (resumableAgents.length === 0) {
      setPhase('wizard');
    }
  }, [phase, agents, aerRecords, resumableAgents]);
  const { data: budgets } = useAgentBudgets(walletAddress);

  // Step 5 done signal: vault upload landed on chat-server. We use
  // useAgentVaultStatus rather than AgentProfile.is_active because the
  // Move field defaults to true at create_agent time and is unrelated
  // to the actual spawn / SSM-vault state. `state === 'active'` flips
  // only after a successful POST /api/nasun-ai/vault/upload + pm2 spawn.
  // The hook polls fast (5s) for the first minute after mount so the
  // wizard advances within seconds of the Activate modal closing.
  const vaultStatus = useAgentVaultStatus(wizardAgent?.address ?? null);

  const hasBudget =
    !!budgets && !!wizardAgent && budgets.some((b) => b.agent === wizardAgent.address);
  const hasPolicy = !!traderConfig;
  const [tgLinkedFlag, setTgLinkedFlag] = useState(false);
  useEffect(() => {
    setTgLinkedFlag(readTgLinked(walletAddress, wizardAgent?.address ?? null));
  }, [walletAddress, wizardAgent?.address]);
  const isActive = vaultStatus.state === 'active';

  const done: boolean[] = [!!wizardAgent, hasBudget, hasPolicy, tgLinkedFlag, isActive];
  const activeIdx = done.findIndex((v) => !v); // -1 when every step is done

  // Child-modal toggles. Wizard mounts these on demand instead of always
  // rendering, so QR canvas / passphrase input only allocate when used.
  const [tgChildOpen, setTgChildOpen] = useState(false);
  const [activateChildOpen, setActivateChildOpen] = useState(false);

  // ESC to close (only when no child modal is open and we're not mid-tx).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !tgChildOpen && !activateChildOpen) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, tgChildOpen, activateChildOpen]);

  const stepLabels = ['Register', 'Fund', 'Policy', 'Telegram', 'Activate'];

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="quickstart-wizard-title"
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-uju-card border border-uju-border/60 shadow-xl">
        <div className="flex items-center justify-between p-5 border-b border-uju-border/60">
          <h2
            id="quickstart-wizard-title"
            className="text-base font-semibold text-white"
          >
            Quick Start
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-uju-secondary hover:bg-uju-bg/60 transition-colors"
            aria-label="Close"
          >
            <svg width={16} height={16} viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.293 4.293a1 1 0 011.414 0L8 6.586l2.293-2.293a1 1 0 111.414 1.414L9.414 8l2.293 2.293a1 1 0 01-1.414 1.414L8 9.414l-2.293 2.293a1 1 0 01-1.414-1.414L6.586 8 4.293 5.707a1 1 0 010-1.414z" />
            </svg>
          </button>
        </div>

        {phase === 'choose' && (
          <div className="p-5 space-y-4">
            {(agents === undefined || aerRecords === undefined) && (
              <p className="text-sm text-uju-secondary/70">Loading...</p>
            )}
            {agents !== undefined && aerRecords !== undefined && resumableAgents.length > 0 && (
              <p className="text-sm text-uju-secondary">
                You have {resumableAgents.length === 1 ? 'an agent' : 'agents'} in progress. Resume or start a new one?
              </p>
            )}
            <div className="space-y-2">
              {resumableAgents.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    if (!a.capabilityId) return;
                    setWizardAgent({
                      id: a.id,
                      address: a.agentAddress,
                      capabilityId: a.capabilityId,
                      name: a.name,
                    });
                    setPhase('wizard');
                  }}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border border-uju-border/60 hover:border-pado-2/60 hover:bg-uju-bg/40 transition-colors text-left"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-white truncate">
                      Continue: {a.name}
                    </span>
                    <span className="block text-xs text-uju-secondary truncate font-mono">
                      {a.agentAddress.slice(0, 12)}…{a.agentAddress.slice(-8)}
                    </span>
                  </span>
                  <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path d="M5 3l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPhase('wizard')}
              className="w-full px-3 py-2.5 text-sm font-medium rounded-lg bg-pado-2 text-uju-bg hover:bg-pado-3 transition-colors"
            >
              Create a new agent
            </button>
          </div>
        )}

        {phase === 'wizard' && (
          <>
        {/* Progress strip */}
        <div className="flex items-center gap-2 px-5 pt-4">
          {stepLabels.map((label, i) => {
            const isDone = done[i];
            const isCurrent = i === activeIdx;
            return (
              <div key={label} className="flex-1 flex items-center gap-2 min-w-0">
                <div
                  className={[
                    'w-6 h-6 shrink-0 rounded-full border flex items-center justify-center text-xs font-bold',
                    isDone
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : isCurrent
                        ? 'border-pado-2 text-pado-2'
                        : 'border-uju-border/60 text-uju-secondary',
                  ].join(' ')}
                >
                  {isDone ? '✓' : i + 1}
                </div>
                <span
                  className={[
                    'text-xs truncate',
                    isCurrent ? 'text-pado-2 font-medium' : 'text-uju-secondary',
                  ].join(' ')}
                >
                  {label}
                </span>
                {i < stepLabels.length - 1 && (
                  <div className="flex-1 h-px bg-uju-border/40" />
                )}
              </div>
            );
          })}
        </div>

        <div className="p-5 space-y-4">
          {activeIdx === 0 && (
            <Step1Register
              blocked={createBlock.blocked}
              blockedMessage={createBlock.message}
              onCreated={(agent) => setWizardAgent(agent)}
            />
          )}

          {activeIdx === 1 && wizardAgent && signer && (
            <Step2FundBody
              signer={signer}
              walletAddress={walletAddress}
              agentAddress={wizardAgent.address}
              capabilityId={wizardAgent.capabilityId}
              onFunded={() => {
                // budgets refetch via the same queryClient invalidation
                // path Setup guide uses; the wizard reads from the same
                // useAgentBudgets cache so hasBudget flips automatically.
              }}
            />
          )}

          {activeIdx === 2 && wizardAgent && (
            <Step3PolicyInline
              walletAddress={walletAddress}
              agent={wizardAgent}
              onSavePolicy={traderConfigSave}
            />
          )}

          {activeIdx === 3 && wizardAgent && (
            <Step4TelegramTrigger
              onOpenLinkModal={() => setTgChildOpen(true)}
            />
          )}

          {activeIdx === 4 && wizardAgent && (
            <Step5ActivateTrigger
              onOpenActivateModal={() => setActivateChildOpen(true)}
            />
          )}

          {activeIdx === -1 && (
            <div className="text-center py-6 space-y-3">
              <div className="text-2xl">🎉</div>
              <p className="text-sm text-white font-medium">
                Agent online. Trading starts within ~5 minutes.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-pado-2 text-uju-bg hover:bg-pado-3 transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>
          </>
        )}
      </div>

      {tgChildOpen && wizardAgent && (
        <LinkTelegramModal
          agentAddress={wizardAgent.address}
          capabilityId={wizardAgent.capabilityId}
          onClose={() => setTgChildOpen(false)}
          onLinked={() => {
            writeTgLinked(walletAddress, wizardAgent.address);
            setTgLinkedFlag(true);
          }}
        />
      )}

      {activateChildOpen && wizardAgent && (
        <ActivateAgentModal
          agentId={wizardAgent.id}
          agentAddress={wizardAgent.address}
          agentName={wizardAgent.name}
          capabilityId={wizardAgent.capabilityId}
          walletAddress={walletAddress}
          onClose={() => setActivateChildOpen(false)}
          onActivated={() => {
            // Phase 6 (2026-05-23): flip enabled=true so the chat-server
            // orchestrator's reconcile spawns PM2. Vault upload alone is
            // no longer sufficient since the orchestrator now refuses to
            // spawn disabled agents.
            // Phase 4: save returns null on server reject. If the enable
            // save fails, the wizard stays on the activate step (Step 5
            // done check won't advance) so the user notices and can retry.
            void (async () => {
              if (traderConfig) {
                const {
                  id: _id,
                  walletAddress: _w,
                  createdAt: _c,
                  updatedAt: _u,
                  ...rest
                } = traderConfig;
                const saved = await traderConfigSave({ ...rest, enabled: true });
                if (!saved) return;
              }
              // Vault state flips to 'active' shortly after pm2 spawn.
              // Explicit refresh kicks the fast-window forward so Step 5
              // done check advances as soon as chat-server confirms.
              void vaultStatus.refresh();
            })();
          }}
        />
      )}
    </div>,
    document.body,
  );
}

// =========================================================================
// Step 1 — Register a new agent. Inline form using useCreateAgent so the
// flow stays inside the wizard instead of bouncing to CreateAgentModal.
// =========================================================================

interface Step1RegisterProps {
  blocked: boolean;
  blockedMessage: string | null;
  onCreated: (agent: WizardAgentRef) => void;
}

function Step1Register({
  blocked,
  blockedMessage,
  onCreated,
}: Step1RegisterProps) {
  const [name, setName] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const {
    createAgent,
    txStatus,
    txError,
    fallbackKey,
    generatedAddress,
    lastSetup,
  } = useCreateAgent();

  // When the atomic PTB lands we lift the freshly minted ids into the
  // wizard's wizardAgent state. We need ALL of: AgentProfile object id
  // (lastSetup.profileId), agent wallet address (generatedAddress —
  // useCreateAgent already extracts this for us during the 'generate'
  // mode keypair derivation), capability object id (lastSetup.capabilityId),
  // and the user-chosen name. Without generatedAddress we'd accidentally
  // pass profileId to TraderConfigForm.agentAddress + escrow lookups —
  // both expect the wallet address, not the profile object id.
  useEffect(() => {
    if (lastSetup && generatedAddress && name.trim()) {
      onCreated({
        id: lastSetup.profileId,
        address: generatedAddress,
        capabilityId: lastSetup.capabilityId,
        name: name.trim(),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSetup, generatedAddress]);

  const busy = txStatus === 'signing' || txStatus === 'executing';
  const canSubmit =
    !busy && !blocked && name.trim().length >= 2 && passphrase.length >= 6;

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs text-uju-secondary">Agent name</span>
        <input
          type="text"
          maxLength={48}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
          className={`mt-1 ${inputBase}`}
          placeholder="e.g. Trader01"
        />
      </label>
      <label className="block">
        <span className="text-xs text-uju-secondary">
          Passphrase (encrypts the agent's key locally)
        </span>
        <input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          disabled={busy}
          autoComplete="new-password"
          className={`mt-1 ${inputBase}`}
          placeholder="At least 6 characters"
        />
      </label>

      {blocked && blockedMessage && (
        <p className="text-sm text-amber-300">{blockedMessage}</p>
      )}
      {txError && <p className="text-sm text-red-400">{txError}</p>}
      {fallbackKey && (
        <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5 text-xs">
          <p className="text-amber-200 font-medium mb-1">
            Recovery key (copy before closing):
          </p>
          <code className="block break-all text-amber-100">{fallbackKey}</code>
        </div>
      )}

      <button
        type="button"
        disabled={!canSubmit}
        onClick={() =>
          void createAgent({
            mode: 'generate',
            name: name.trim(),
            role: 'trader',
            capabilities: [],
            passphrase,
          })
        }
        className="px-3 py-2 text-sm font-medium rounded-lg bg-pado-2 text-uju-bg hover:bg-pado-3 transition-colors disabled:opacity-50 disabled:pointer-events-none"
      >
        {txStatus === 'signing'
          ? 'Signing...'
          : txStatus === 'executing'
            ? 'Submitting...'
            : 'Create agent'}
      </button>
    </div>
  );
}

// =========================================================================
// Step 3 — Policy. Reuses TraderConfigForm with budgetId resolved from the
// agent's just-minted budget. Wizard saves and advances to Step 4.
// =========================================================================

function Step3PolicyInline({
  walletAddress,
  agent,
  onSavePolicy,
}: {
  walletAddress: string;
  agent: WizardAgentRef;
  // Wired to useTraderConfig.save in the parent so the form actually
  // persists (IndexedDB + chat-server). On success the parent's
  // traderConfig state flips, hasPolicy becomes true, and the wizard
  // auto-advances to Step 4.
  onSavePolicy: ReturnType<typeof useTraderConfig>['save'];
}) {
  const { data: budgets } = useAgentBudgets(walletAddress);
  const budget = budgets?.find((b) => b.agent === agent.address);

  if (!budget) {
    return (
      <p className="text-sm text-uju-secondary">
        Waiting for the funding tx to settle...
      </p>
    );
  }

  return (
    <TraderConfigForm
      agentAddress={agent.address}
      agentName={agent.name}
      agentBudgetId={budget.id}
      initial={null}
      hideAutoFields
      onSave={async (values) => {
        const result = await onSavePolicy(values);
        if (!result) {
          throw new Error('Failed to save policy');
        }
      }}
    />
  );
}

// =========================================================================
// Step 4 — Telegram. Single CTA opens the existing LinkTelegramModal.
// =========================================================================

function Step4TelegramTrigger({
  onOpenLinkModal,
}: {
  onOpenLinkModal: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-uju-secondary">
        Receive alerts and confirm trades from your phone.
      </p>
      <button
        type="button"
        onClick={onOpenLinkModal}
        className="px-3 py-2 text-sm font-medium rounded-lg bg-pado-2 text-uju-bg hover:bg-pado-3 transition-colors"
      >
        Link Telegram
      </button>
    </div>
  );
}

// =========================================================================
// Step 5 — Activate. Single CTA opens the existing ActivateAgentModal.
// =========================================================================

function Step5ActivateTrigger({
  onOpenActivateModal,
}: {
  onOpenActivateModal: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-uju-secondary">
        Upload the encrypted key. Trading starts within ~5 minutes.
      </p>
      <button
        type="button"
        onClick={onOpenActivateModal}
        className="px-3 py-2 text-sm font-medium rounded-lg bg-pado-2 text-uju-bg hover:bg-pado-3 transition-colors"
      >
        Activate agent
      </button>
    </div>
  );
}
