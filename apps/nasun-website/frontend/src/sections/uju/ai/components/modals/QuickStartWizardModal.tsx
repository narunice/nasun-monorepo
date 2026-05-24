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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useSigner } from '@nasun/wallet';
import { useAgentProfiles } from '../../hooks/useAgentProfiles';
import { useAgentBudgets } from '../../hooks/useAgentBudgets';
import { useTraderConfig } from '../../hooks/useTraderConfig';
import { useCapability } from '../../hooks/useCapability';
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

// Persist the activation-submitted signal so a page reload between vault
// upload and the first agent heartbeat doesn't bounce the user back to
// the Activate button. Without this the wizard re-renders Step 5 during
// the spawn-to-heartbeat gap (up to ~90s, see baram_agent_endpoints
// freshness check in chat-server) and a second click consumes the now-
// missing waitlist invite, surfacing as "Public alpha is full".
function activationSubmittedKey(wallet: string, agent: string): string {
  return `nasun-ai-quickstart-activation-submitted:${wallet.toLowerCase()}:${agent.toLowerCase()}`;
}
function readActivationSubmitted(wallet: string, agent: string | null): boolean {
  if (!agent) return false;
  try {
    return localStorage.getItem(activationSubmittedKey(wallet, agent)) === '1';
  } catch {
    return false;
  }
}
function writeActivationSubmitted(wallet: string, agent: string): void {
  try {
    localStorage.setItem(activationSubmittedKey(wallet, agent), '1');
  } catch {
    // best effort.
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
  const queryClient = useQueryClient();

  // Step 2 fund tx → invalidate the budgets query immediately so hasBudget
  // flips on the very next render. Without this the wizard waits on the
  // useBudgetsQuery 15s refetchInterval, which presents as "Confirm and
  // sign did nothing" and tempts the user to click again — re-running the
  // PTB and double-funding the escrow.
  const handleFunded = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ['nasun-ai', 'budgets', walletAddress],
    });
  }, [queryClient, walletAddress]);

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

  // Step 5/6 split: 'Activate' is the user-initiated upload (ActivateAgentModal
  // -> vault upload -> chain authorize -> enable=true save). 'Server ready'
  // is the passive wait until chat-server confirms the spawned process is
  // sending heartbeats. Splitting these prevents the recognition bug where
  // the activate button re-renders during the upload->heartbeat gap, which
  // tempted users to click again and burn their alpha invite.
  const [activationSubmittedFlag, setActivationSubmittedFlag] = useState(false);
  useEffect(() => {
    setActivationSubmittedFlag(readActivationSubmitted(walletAddress, wizardAgent?.address ?? null));
  }, [walletAddress, wizardAgent?.address]);

  // Vault row in 'active' or 'inactive' state means the SSM key is uploaded
  // and the chat-server agent_keys row is alive (only difference is whether
  // the heartbeat is fresh). Either counts as "Activate" done — even if
  // activationSubmittedFlag was cleared (e.g. different browser), the
  // server state proves the upload happened.
  const vaultLanded = vaultStatus.state === 'active' || vaultStatus.state === 'inactive';
  const activated = activationSubmittedFlag || vaultLanded;
  const serverReady = vaultStatus.state === 'active';

  const done: boolean[] = [
    !!wizardAgent,
    hasBudget,
    hasPolicy,
    tgLinkedFlag,
    activated,
    serverReady,
  ];
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

  const stepLabels = ['Register', 'Fund', 'Policy', 'Telegram', 'Activate', 'Server'];

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
              onFunded={handleFunded}
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

          {activeIdx === 5 && wizardAgent && (
            <Step6ServerReady vaultState={vaultStatus.state} />
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
            // Persist the activation-submitted signal BEFORE the async
            // config save so a reload mid-save still surfaces Step 6 (the
            // server-ready wait) instead of bouncing back to Step 5. The
            // vault row has already been inserted by uploadAgentKeyToVault
            // at this point, so this localStorage write is just belt-and-
            // suspenders for the heartbeat-delay window.
            writeActivationSubmitted(walletAddress, wizardAgent.address);
            setActivationSubmittedFlag(true);
            // Phase 6 (2026-05-23): flip enabled=true so the chat-server
            // orchestrator's reconcile spawns PM2. Vault upload alone is
            // no longer sufficient since the orchestrator now refuses to
            // spawn disabled agents.
            // Phase 4: save returns null on server reject. If the enable
            // save fails the wizard stays on Step 6 polling vault status;
            // the user can still confirm activation via Settings.
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
              // Explicit refresh kicks the fast-window forward so Step 6
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
  // Capability is the on-chain trust boundary; useCreateAgent seeds it with
  // DEFAULT_RISK_LIMITS (2 NUSDC per action). The wizard's policy form lets
  // the user set perTrade / dailyMax above that default, so we mirror the
  // raise onto the capability — otherwise every swap PTB aborts at
  // escrow::withdraw_for_action with E_PAYMENT_EXCEEDS_NOTIONAL_CAP (552)
  // and the user sees wake_http_422 with no heartbeat (2026-05-24 Danny
  // incident). Mirrors SettingsTab onSave; keep the two in sync.
  const capability = useCapability(agent.capabilityId);

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
        // Only raise on-chain limits; never lower (lowering is an explicit
        // tighten action via Settings). Skipping when the capability is
        // still loading would leave the user at default 2 NUSDC, so we
        // wait for the fetch — refetch is awaited in useCapability so a
        // fresh wizard sees the just-created cap before this branch runs.
        const newPerTrade = BigInt(values.perTradeMaxQuoteRaw);
        const newDailyMax = BigInt(values.dailyMaxQuoteRaw);
        const cap = capability.data;
        if (
          cap &&
          (newPerTrade > cap.riskLimits.maxNotionalPerAction ||
            newDailyMax > cap.riskLimits.maxDailyLoss)
        ) {
          const ok = await capability.updateRiskLimits({
            maxNotionalPerAction:
              newPerTrade > cap.riskLimits.maxNotionalPerAction
                ? newPerTrade
                : cap.riskLimits.maxNotionalPerAction,
            maxDailyLoss:
              newDailyMax > cap.riskLimits.maxDailyLoss
                ? newDailyMax
                : cap.riskLimits.maxDailyLoss,
            maxSlippageBps: cap.riskLimits.maxSlippageBps,
            stopLossBps: cap.riskLimits.stopLossBps,
            takeProfitBps: cap.riskLimits.takeProfitBps,
          });
          if (!ok) {
            // Surface the failure so the wizard does not auto-advance with
            // a divergent off-chain/on-chain pair. capability.txError holds
            // the human-readable reason for the caller / form to display.
            throw new Error(
              capability.txError ?? 'Failed to update on-chain risk limits',
            );
          }
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
// Step 5 — Activate. Single CTA opens the existing ActivateAgentModal,
// which decrypts + uploads + on-chain authorizes in one wallet flow.
// The follow-up "is the server actually running it" check lives in Step 6.
// =========================================================================

function Step5ActivateTrigger({
  onOpenActivateModal,
}: {
  onOpenActivateModal: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-uju-secondary">
        Sign with your wallet and upload the encrypted key. One signature, one click.
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

// =========================================================================
// Step 6 — Server ready. Passive wait: poll vault status until the chat-
// server confirms the spawned PM2 process is sending heartbeats. No CTA,
// so a second click cannot trigger a duplicate vault upload during the
// spawn-to-heartbeat gap.
// =========================================================================

function Step6ServerReady({
  vaultState,
}: {
  vaultState: 'active' | 'inactive' | 'grace' | 'not_vaulted';
}) {
  const subline =
    vaultState === 'inactive'
      ? 'Key uploaded. Waiting for the first agent heartbeat.'
      : vaultState === 'not_vaulted'
        ? 'Looking up the agent record on the chat-server.'
        : vaultState === 'grace'
          ? 'Agent is in the 7-day recovery window. Restore it from Settings if you want to keep using it.'
          : 'Server confirmed.';

  return (
    <div className="space-y-3 text-center py-4">
      <div className="flex justify-center" aria-hidden="true">
        <svg
          className="w-8 h-8 animate-spin text-pado-2"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
          <path d="M22 12a10 10 0 00-10-10" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-sm text-white font-medium">Activating on server...</p>
      <p className="text-xs text-uju-secondary">{subline}</p>
      <p className="text-xs text-uju-secondary/70">
        Usually under 60 seconds. You can close this; the agent will continue starting and you can check status in Settings.
      </p>
    </div>
  );
}
