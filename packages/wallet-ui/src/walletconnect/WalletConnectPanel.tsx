/**
 * WalletConnect Main Panel
 *
 * Displays active sessions, pending proposals/requests, and connection entry point.
 * Accessed via MoreMenu "WalletConnect" item.
 */

import { useState } from "react";
import {
  useWalletConnect,
  getDAppMetadata,
  type DAppMetadata,
} from "@nasun/wallet";
import type { ViewMode } from "../connect/types";
import { sanitizeImageUrl } from "../shared";

const WC_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? "";

const WC_METADATA = {
  name: "Nasun Wallet",
  description: "Non-custodial wallet for Nasun Network",
  url: "https://nasun.io",
  icons: ["https://nasun.io/favicon.ico"],
};

interface WalletConnectPanelProps {
  setViewMode: (mode: ViewMode) => void;
}

export function WalletConnectPanel({ setViewMode }: WalletConnectPanelProps) {
  const { state, init } = useWalletConnect();
  const [initError, setInitError] = useState<string | null>(null);

  const handleInit = async () => {
    setInitError(null);
    try {
      await init({
        projectId: WC_PROJECT_ID,
        metadata: WC_METADATA,
      });
    } catch (err) {
      setInitError(err instanceof Error ? err.message : "Failed to initialize WalletConnect");
    }
  };

  // Not initialized state
  if (!state.initialized && !state.initializing) {
    return (
      <div className="p-4 w-full">
        <BackButton onClick={() => setViewMode("main")} />
        <h3 className={"text-base md:text-lg xl:text-xl font-medium text-gray-900 dark:text-white"}>WalletConnect</h3>
        <div className="text-center py-6">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-blue-500/10 flex items-center justify-center">
            <WCIcon className="w-6 h-6 text-blue-500" />
          </div>
          <p className="text-sm text-gray-600 dark:text-zinc-400 mb-4">
            Connect your wallet to external dApps via WalletConnect protocol.
          </p>
          <button
            onClick={handleInit}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors"
          >
            Initialize WalletConnect
          </button>
          {initError && (
            <p className="mt-2 text-xs text-red-400">{initError}</p>
          )}
        </div>
      </div>
    );
  }

  // Initializing state
  if (state.initializing) {
    return (
      <div className="p-4 w-full">
        <BackButton onClick={() => setViewMode("main")} />
        <h3 className={"text-base md:text-lg xl:text-xl font-medium text-gray-900 dark:text-white"}>WalletConnect</h3>
        <div className="flex items-center justify-center py-8 gap-2 text-sm text-gray-500 dark:text-zinc-400">
          <Spinner />
          Initializing...
        </div>
      </div>
    );
  }

  // Initialized state
  const { sessions, pendingProposals, pendingRequests, error } = state;
  const totalPending = pendingProposals.length + pendingRequests.length;

  return (
    <div className="p-4 w-full">
      <BackButton onClick={() => setViewMode("main")} />

      <div className="flex items-center justify-between mb-3">
        <h3 className={"text-base md:text-lg xl:text-xl font-medium text-gray-900 dark:text-white"}>
          WalletConnect
          {totalPending > 0 && (
            <span className="ml-2 px-1.5 py-0.5 text-[10px] font-medium bg-blue-600 text-white rounded-full">
              {totalPending}
            </span>
          )}
        </h3>
        <button
          onClick={() => setViewMode("wc-pair")}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition-colors"
        >
          + Connect
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Pending proposals */}
      {pendingProposals.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-wider text-yellow-500 font-medium mb-1">
            Pending Approval
          </p>
          {pendingProposals.map((proposal) => {
            const meta = proposal.params.proposer.metadata;
            return (
              <button
                key={proposal.id}
                onClick={() => setViewMode("wc-proposal")}
                className="w-full p-2 mb-1 bg-yellow-500/10 border border-yellow-500/30 rounded hover:bg-yellow-500/20 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <DAppIcon metadata={meta} size={24} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {meta.name}
                    </p>
                    <p className="text-[10px] text-yellow-500">
                      Wants to connect
                    </p>
                  </div>
                  <svg className="w-4 h-4 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Pending requests */}
      {pendingRequests.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-wider text-blue-400 font-medium mb-1">
            Pending Requests
          </p>
          {pendingRequests.map((request) => (
            <button
              key={request.id}
              onClick={() => setViewMode("wc-request")}
              className="w-full p-2 mb-1 bg-blue-500/10 border border-blue-500/30 rounded hover:bg-blue-500/20 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-blue-500/20 flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {request.method}
                  </p>
                  <p className="text-[10px] text-blue-400">
                    {request.chainId}
                  </p>
                </div>
                <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Active sessions */}
      {sessions.length > 0 ? (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-zinc-500 font-medium mb-1">
            Active Sessions ({sessions.length})
          </p>
          {sessions.map((session) => {
            const meta = getDAppMetadata(session);
            const chains = Object.keys(session.namespaces).flatMap(
              (ns) => session.namespaces[ns].chains ?? []
            );
            return (
              <button
                key={session.topic}
                onClick={() => setViewMode("wc-session-detail")}
                className="w-full p-2 mb-1 bg-gray-50 dark:bg-zinc-700/50 border border-gray-200 dark:border-zinc-600 rounded hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <DAppIcon metadata={meta} size={28} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {meta.name}
                    </p>
                    <div className="flex gap-1 mt-0.5 flex-wrap">
                      {chains.map((chain) => (
                        <span
                          key={chain}
                          className="px-1 py-0.5 text-[9px] bg-gray-200 dark:bg-zinc-600 text-gray-600 dark:text-zinc-300 rounded"
                        >
                          {chain}
                        </span>
                      ))}
                    </div>
                  </div>
                  <svg className="w-4 h-4 text-gray-400 dark:text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        totalPending === 0 && (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500 dark:text-zinc-400">
              No dApps connected
            </p>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-1">
              Tap &quot;+ Connect&quot; to pair with a dApp
            </p>
          </div>
        )
      )}
    </div>
  );
}

// -- Helper Components --

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-white transition-colors mb-3"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      Back
    </button>
  );
}

function WCIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M6.09 9.6c3.26-3.2 8.56-3.2 11.82 0l.39.39c.16.16.16.42 0 .58l-1.34 1.31a.2.2 0 01-.3 0l-.54-.53c-2.28-2.23-5.97-2.23-8.24 0l-.58.56a.2.2 0 01-.3 0L5.66 10.6a.41.41 0 010-.58l.43-.42zm14.6 2.72l1.2 1.17c.16.16.16.42 0 .58l-5.38 5.27a.41.41 0 01-.58 0l-3.82-3.74a.1.1 0 00-.15 0l-3.82 3.74a.41.41 0 01-.58 0L2.18 14.07a.41.41 0 010-.58l1.19-1.17a.41.41 0 01.58 0l3.82 3.74a.1.1 0 00.15 0l3.82-3.74a.41.41 0 01.58 0l3.82 3.74a.1.1 0 00.15 0l3.82-3.74a.41.41 0 01.58 0z" />
    </svg>
  );
}

function DAppIcon({ metadata, size = 24 }: { metadata: DAppMetadata; size?: number }) {
  const [imgError, setImgError] = useState(false);
  const iconUrl = sanitizeImageUrl(metadata.icons[0]);

  if (!iconUrl || imgError) {
    return (
      <div
        className="rounded-full bg-gray-200 dark:bg-zinc-600 flex items-center justify-center text-gray-500 dark:text-zinc-400 font-medium"
        style={{ width: size, height: size, fontSize: size * 0.4 }}
      >
        {metadata.name.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={iconUrl}
      alt={metadata.name}
      className="rounded-full"
      style={{ width: size, height: size }}
      onError={() => setImgError(true)}
    />
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
