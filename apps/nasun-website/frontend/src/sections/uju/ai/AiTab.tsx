import { ecosystemAiPath } from "@/config/featureFlags";

/**
 * AiTab - root entry for the my-account "AI" sub-tab.
 *
 * Sub-routes are driven by the `view` query param:
 *   view=list      (default) -> QuickstartView
 *   view=register           -> QuickstartView + CreateAgentModal
 *   view=detail&agent=<id>  -> AgentDetail (with sub-tab `sub=<...>`)
 *   view=budgets            -> Budgets page
 *
 * The AgentDetail sub-tab is held in the `sub` query param so deep links
 * survive a refresh. An optional `from=quickstart` flag tells AgentDetail
 * to swap the back-link label so Quickstart-driven users know the round trip.
 */

import { useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { AgentDetail, normalizeSubTab } from './pages/AgentDetail';
import { Budgets } from './pages/Budgets';
import { QuickstartView } from './pages/QuickstartView';
import { ChatView } from './pages/ChatView';
import { CreateAgentModal } from './components/modals/CreateAgentModal';
import { useCreateAgent } from './hooks/useCreateAgent';
import { useAgentProfiles } from './hooks/useAgentProfiles';

const VIEW_PARAM = 'view';
const AGENT_PARAM = 'agent';
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
      });
    } else {
      updateView(null);
    }
    wasOnboardedRef.current = false;
    newProfileIdRef.current = null;
  }, [resetTxStatus, updateView]);

  if (!walletAddress) return <NotConnected />;

  if (view === 'detail' && agentId) {
    return (
      <div className="space-y-4">
        <AgentDetail
          walletAddress={walletAddress}
          agentId={agentId}
          subTab={sub}
          fromQuickstart={fromQuickstart}
          onChangeSub={(next) => updateView('detail', { sub: next })}
          onBack={() => updateView(null, { agent: null, sub: null, [FROM_PARAM]: null })}
        />
      </div>
    );
  }

  if (view === 'budgets') {
    const prefillAgent = searchParams.get(PREFILL_PARAM) ?? undefined;
    return (
      <div className="space-y-4">
        <Budgets
          walletAddress={walletAddress}
          onBack={() => updateView(null, { [PREFILL_PARAM]: null })}
          prefillAgent={prefillAgent}
        />
      </div>
    );
  }

  const isChatView = view === 'chat';

  return (
    <div className="space-y-4">
      <div
        className="flex gap-1 border-b border-uju-border/60"
        role="tablist"
        aria-label="AI section"
      >
        {(['list', 'chat'] as const).map((key) => {
          const active = key === 'chat' ? isChatView : !isChatView;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => updateView(key === 'list' ? null : 'chat')}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                active
                  ? 'border-pado-2 text-pado-2'
                  : 'border-transparent text-uju-secondary hover:text-white'
              }`}
            >
              {key === 'list' ? 'Agents' : 'Chat'}
            </button>
          );
        })}
      </div>

      {isChatView ? (
        <ChatView
          walletAddress={walletAddress}
          onRegisterAgent={() => updateView('register')}
        />
      ) : (
        <QuickstartView
          walletAddress={walletAddress}
          onShowRegister={() => updateView('register')}
          onOpenBudgets={(agentAddress) =>
            updateView('budgets', agentAddress ? { [PREFILL_PARAM]: agentAddress } : {})
          }
          onSelectAgent={(id, opts) =>
            updateView('detail', {
              agent: id,
              sub: opts?.sub ?? 'overview',
              [FROM_PARAM]: opts?.fromQuickstart ? FROM_QUICKSTART : null,
            })
          }
        />
      )}

      {/* Registration modal — triggered by view=register */}
      {view === 'register' && (
        <CreateAgentModal
          onClose={handleRegisterModalClose}
          onCreate={handleCreate}
          txStatus={txStatus}
          txError={txError}
          generatedAddress={generatedAddress}
          fallbackKey={fallbackKey}
          isOnboarded={!!agents && agents.some((a) => a.isActive)}
        />
      )}
    </div>
  );
}
