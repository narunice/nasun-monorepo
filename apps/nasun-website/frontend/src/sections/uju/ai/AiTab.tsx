/**
 * AiTab - root entry for the my-account "Agents" top-level tab.
 *
 * Sub-routes are driven by the `view` query param:
 *   view=list      (default) -> QuickstartView (agent list + onboarding)
 *   view=register           -> QuickstartView + CreateAgentModal
 *   view=detail&agent=<id>  -> AgentDetail (with sub-tab `sub=<overview|aer|chat|settings>`)
 *   view=budgets            -> Budgets page
 *
 * Generic LLM chat (the legacy useRequestWithRetry path) is NOT mounted here
 * anymore — it lives at `?tab=ai-chat` (AiChatTab). Per-agent wake-mode chat
 * is mounted inside AgentDetail as `sub=chat`.
 */

import { memo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { AgentDetail, SUB_TABS, normalizeSubTab, type AgentSubTab } from './pages/AgentDetail';
import { Budgets } from './pages/Budgets';
import { QuickstartView } from './pages/QuickstartView';
import { CreateAgentModal } from './components/modals/CreateAgentModal';
import { AgentsSidebar } from './components/AgentsSidebar';
import { AlphaNoticePanel } from './components/AlphaNoticePanel';
import { useCreateAgent } from './hooks/useCreateAgent';
import { useAgentProfiles } from './hooks/useAgentProfiles';
import { useAlphaStatus } from './alpha/useAlphaStatus';
import { useCreateAgentBlocked } from './alpha/useCreateAgentBlocked';

// Memoized AgentDetail keeps the heavy sub-tab body (charts, tables) from
// re-rendering on every sidebar search keystroke. Sidebar lives next to
// AgentDetail under the same grid, so without memo every parent render
// (including local search state changes) would cascade.
const MemoAgentDetail = memo(AgentDetail);

const VIEW_PARAM = 'view';
const AGENT_PARAM = 'agent';
// Registration sub-mode. Quickstart triggers default ('generate'); sidebar's
// Import button passes 'import' so the modal opens directly on the import
// path without an extra tab click. Treated as best-effort UX hint only —
// useCreateAgent still validates the actual mode at submit time.
const MODE_PARAM = 'mode';
const SUB_PARAM = 'sub';
const PREFILL_PARAM = 'prefill';
const FROM_PARAM = 'from';
const FROM_QUICKSTART = 'quickstart';


function NotConnected() {
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
        Connect your Nasun wallet to register AI agents, manage budgets, and track on-chain
        execution reports.
      </p>
      <p className="text-sm text-uju-secondary/60">
        Sign in with your Nasun wallet from the Profile tab to continue.
      </p>
    </div>
  );
}

export function AiTab() {
  const { user } = useAuth();
  const walletAddress = user?.walletAddress;
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get(VIEW_PARAM) ?? 'list';
  const agentId = searchParams.get(AGENT_PARAM);
  const sub = normalizeSubTab(searchParams.get(SUB_PARAM));
  const fromQuickstart = searchParams.get(FROM_PARAM) === FROM_QUICKSTART;

  const updateView = useCallback(
    (next: string | null, extra?: Record<string, string | null>) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next) params.set(VIEW_PARAM, next);
          else params.delete(VIEW_PARAM);
          for (const [k, v] of Object.entries(extra ?? {})) {
            if (v == null) params.delete(k);
            else params.set(k, v);
          }
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const { data: agents, refetch } = useAgentProfiles(walletAddress ?? '');
  const { createAgent, txStatus, txError, generatedAddress, fallbackKey, resetTxStatus } =
    useCreateAgent();

  // Alpha gate for the per-agent wake chat sub-tab. UX-only — chat-server
  // enforces the same gate server-side. We thread the raw status into
  // AgentDetail so it can render an inline banner inside the Chat sub-tab
  // without ChatView (legacy generic chat) being aware of any of this.
  const { status: alphaStatus } = useAlphaStatus(walletAddress);

  // Captured at "Register" submit time so the post-modal navigation reflects
  // the wallet's state *before* the new agent landed, not after.
  const wasOnboardedRef = useRef(false);
  // Profile id of the agent the user just registered, resolved by matching
  // generatedAddress against the refetched profile list. Used to deep-link
  // straight into the new agent's Settings tab when the wallet is already
  // onboarded (Setup guide collapsed scenario).
  const newProfileIdRef = useRef<string | null>(null);

  const handleCreate = useCallback(
    async (params: Parameters<typeof createAgent>[0]) => {
      wasOnboardedRef.current = !!agents && agents.some((a) => a.isActive);
      newProfileIdRef.current = null;
      const digest = await createAgent(params);
      if (digest) {
        // Sui RPC's owned-objects index can lag waitForTransaction by a beat,
        // so a single refetch sometimes returns stale "no agents" data and
        // QuickstartView keeps showing the hero / Step 1 active. Poll up to
        // ~3s until the new profile surfaces, then Step 1 flips to done and
        // Step 2 (Fund Budget) becomes the active call to action naturally.
        const prevCount = agents?.length ?? 0;
        for (let i = 0; i < 6; i++) {
          const { data: next } = await refetch();
          if ((next?.length ?? 0) > prevCount) {
            // For 'generate' mode, the new profile's agentAddress equals the
            // freshly generated Ed25519 pubkey we exposed as generatedAddress
            // on useCreateAgent. For 'import' mode params.agentAddress holds
            // the user-supplied address. Either way we can resolve the new
            // profile id from the polled list.
            const newAddr = (params.agentAddress ?? '').toLowerCase();
            const match = (next ?? []).find((a) => {
              const addr = a.agentAddress.toLowerCase();
              return addr === newAddr || (!newAddr && !agents?.some((p) => p.id === a.id));
            });
            if (match) newProfileIdRef.current = match.id;
            break;
          }
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      return digest;
    },
    [createAgent, refetch, agents],
  );

  const handleRegisterModalClose = useCallback(() => {
    resetTxStatus();
    // Onboarded power-user path: skip the Quickstart bounce-back and drop
    // the user straight into the new agent's Settings tab, where the Budget
    // section is the next clearly visible action.
    if (wasOnboardedRef.current && newProfileIdRef.current) {
      updateView('detail', {
        agent: newProfileIdRef.current,
        sub: 'settings',
        [FROM_PARAM]: null,
        [MODE_PARAM]: null,
      });
    } else {
      updateView(null, { [MODE_PARAM]: null });
    }
    wasOnboardedRef.current = false;
    newProfileIdRef.current = null;
  }, [resetTxStatus, updateView]);

  const createBlock = useCreateAgentBlocked(walletAddress);

  const handleSelectAgent = useCallback(
    (id: string) =>
      updateView('detail', {
        agent: id,
        sub: 'overview',
        [FROM_PARAM]: null,
      }),
    [updateView],
  );
  const handleClearSelection = useCallback(
    () => updateView(null, { agent: null, sub: null, [FROM_PARAM]: null }),
    [updateView],
  );
  const handleShowRegister = useCallback(
    () => updateView('register', { [MODE_PARAM]: null }),
    [updateView],
  );
  const handleShowImport = useCallback(
    () => updateView('register', { [MODE_PARAM]: 'import' }),
    [updateView],
  );
  const handleChangeSub = useCallback(
    (next: AgentSubTab) => updateView('detail', { sub: next }),
    [updateView],
  );

  if (!walletAddress) return <NotConnected />;

  const prefillAgent =
    view === 'budgets' ? (searchParams.get(PREFILL_PARAM) ?? undefined) : undefined;

  // Body for the right column. AgentDetail when a real agent is in URL,
  // Budgets when its dedicated view is requested, otherwise the grid view.
  let body: React.ReactNode;
  if (view === 'detail' && agentId) {
    body = (
      <MemoAgentDetail
        walletAddress={walletAddress}
        agentId={agentId}
        subTab={sub}
        fromQuickstart={fromQuickstart}
        alphaStatus={alphaStatus}
        onChangeSub={handleChangeSub}
        onBack={handleClearSelection}
      />
    );
  } else if (view === 'budgets') {
    body = (
      <Budgets
        walletAddress={walletAddress}
        onBack={() => updateView(null, { [PREFILL_PARAM]: null })}
        prefillAgent={prefillAgent}
      />
    );
  } else {
    body = (
      <QuickstartView
        walletAddress={walletAddress}
        onShowRegister={handleShowRegister}
        onSelectAgent={(id, opts) =>
          updateView('detail', {
            agent: id,
            sub: opts?.sub ?? 'overview',
            [FROM_PARAM]: opts?.fromQuickstart ? FROM_QUICKSTART : null,
          })
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <AlphaNoticePanel walletAddress={walletAddress} />

      <div className="md:flex md:gap-4">
        <AgentsSidebar
          agents={agents ?? []}
          selectedAgentId={view === 'detail' ? agentId : null}
          onSelectAgent={handleSelectAgent}
          onClearSelection={handleClearSelection}
          onShowImport={handleShowImport}
          createBlocked={createBlock.blocked}
          createBlockedMessage={createBlock.message}
        />
        <main className="flex-1 min-w-0 space-y-4">
          {view !== 'budgets' && (
            <SubTabBar
              agentName={
                view === 'detail' && agentId
                  ? (agents?.find((a) => a.id === agentId)?.name ?? null)
                  : null
              }
              subTab={view === 'detail' ? sub : null}
              disabled={view !== 'detail' || !agentId}
              onChangeSub={handleChangeSub}
            />
          )}
          {body}
        </main>
      </div>

      {/* Registration modal, triggered by view=register */}
      {view === 'register' && (
        <CreateAgentModal
          onClose={handleRegisterModalClose}
          onCreate={handleCreate}
          txStatus={txStatus}
          txError={txError}
          generatedAddress={generatedAddress}
          fallbackKey={fallbackKey}
          isOnboarded={!!agents && agents.some((a) => a.isActive)}
          walletAddress={walletAddress}
          initialMode={
            searchParams.get(MODE_PARAM) === 'import' ? 'import' : 'generate'
          }
        />
      )}
    </div>
  );
}

interface SubTabBarProps {
  agentName: string | null;
  subTab: AgentSubTab | null;
  disabled: boolean;
  onChangeSub: (next: AgentSubTab) => void;
}

// Always-visible sub-tab row. Lives at the top of the AI tab's right column
// so the user can always see Overview / AER / Settings, even before they
// pick an agent. The currently selected agent's name is rendered on the left
// as the primary identity cue; when no agent is selected the tabs render
// disabled and the label reads "No agent selected".
function SubTabBar({ agentName, subTab, disabled, onChangeSub }: SubTabBarProps) {
  return (
    <div
      className="flex items-stretch gap-4 border-b border-uju-border/60 overflow-x-auto"
      role="tablist"
    >
      <div
        className={`px-3 py-2 text-base font-semibold whitespace-nowrap self-center ${
          agentName ? 'text-white' : 'text-uju-secondary/60 italic font-medium'
        }`}
      >
        {agentName ?? 'No agent selected'}
      </div>
      {SUB_TABS.map((t) => {
        const isSelected = !disabled && subTab === t.key;
        return (
          <button
            type="button"
            key={t.key}
            role="tab"
            aria-selected={isSelected}
            aria-disabled={disabled}
            disabled={disabled}
            onClick={() => {
              if (!disabled) onChangeSub(t.key);
            }}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              isSelected
                ? 'border-pado-2 text-pado-2'
                : disabled
                  ? 'border-transparent text-uju-secondary/40 cursor-not-allowed'
                  : 'border-transparent text-uju-secondary hover:text-white'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
