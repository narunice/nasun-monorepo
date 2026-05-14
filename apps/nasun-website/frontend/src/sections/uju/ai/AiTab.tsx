/**
 * AiTab - root entry for the my-account "AI" sub-tab.
 *
 * Reads the `view` query param to drive sub-routes (S3 scope: list | register).
 * Future S4 sub-routes (detail, escrow, sessions) will key off `view=detail&agent=<id>`.
 */

import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/features/auth';
import { AgentsList } from './pages/AgentsList';

const VIEW_PARAM = 'view';
const AGENT_PARAM = 'agent';

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

function AboutCard() {
  return (
    <div className="p-4 rounded-xl bg-uju-card/40 border border-uju-border/40 space-y-2">
      <h4 className="text-sm font-semibold text-white">What is Nasun AI?</h4>
      <p className="text-sm text-uju-secondary leading-relaxed">
        Nasun AI is the AI compliance settlement layer on Nasun Network. Every AI execution
        produces an on-chain receipt that proves what the agent did, what it cost, and who
        authorized it. All activity is transparent and auditable.
      </p>
      <a href="/ecosystem/baram" className="inline-block text-sm text-pado-2 hover:underline">
        Learn more about Nasun AI
      </a>
    </div>
  );
}

export function AiTab() {
  const { user } = useAuth();
  const walletAddress = user?.walletAddress;
  const [searchParams, setSearchParams] = useSearchParams();
  const view = searchParams.get(VIEW_PARAM) ?? 'list';
  // agent param reserved for S4 (AgentDetail). Read here only so AgentsList can hand
  // off without us re-parsing.
  const _agent = searchParams.get(AGENT_PARAM);
  void _agent;

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

  if (!walletAddress) {
    return <NotConnected />;
  }

  return (
    <div className="space-y-4">
      <AgentsList
        walletAddress={walletAddress}
        showRegister={view === 'register'}
        onShowRegister={() => updateView('register')}
        onCloseRegister={() => updateView(null)}
        // Selecting an agent is a no-op until S4 wires AgentDetail.
        onSelectAgent={undefined}
      />
      <AboutCard />
    </div>
  );
}
