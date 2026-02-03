/**
 * WCSessionDetail
 *
 * Displays details of an active WalletConnect session.
 * Shows connected chains, methods, accounts, and disconnect option.
 */

import { useState } from "react";
import {
  useWalletConnect,
  getDAppMetadata,
} from "@nasun/wallet";
import type { ViewMode } from "../connect/LockedStateUI";
import { sanitizeImageUrl } from "../shared";

interface WCSessionDetailProps {
  setViewMode: (mode: ViewMode) => void;
  /** Session topic to display. If not provided, shows the first session. */
  sessionTopic?: string;
}

export function WCSessionDetail({ setViewMode, sessionTopic }: WCSessionDetailProps) {
  const { state, disconnect } = useWalletConnect();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const session = sessionTopic
    ? state.sessions.find((s) => s.topic === sessionTopic)
    : state.sessions[0];

  if (!session) {
    return (
      <div className="p-4 w-full">
        <BackButton onClick={() => setViewMode("wc-main")} />
        <div className="text-center py-8">
          <p className="text-sm text-gray-500 dark:text-zinc-400">Session not found</p>
        </div>
      </div>
    );
  }

  const meta = getDAppMetadata(session);

  // Extract chains, methods, accounts from namespaces
  const namespaceEntries = Object.entries(session.namespaces);
  const allChains = namespaceEntries.flatMap(([, ns]) => ns.chains ?? []);
  const allMethods = namespaceEntries.flatMap(([, ns]) => ns.methods ?? []);
  const allAccounts = namespaceEntries.flatMap(([, ns]) => ns.accounts ?? []);

  const handleDisconnect = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await disconnect(session.topic);
      setViewMode("wc-main");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 w-full">
      <BackButton onClick={() => setViewMode("wc-main")} />

      <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white mb-4">
        Session Detail
      </h3>

      {/* dApp info */}
      <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 dark:bg-zinc-700/50 rounded-lg">
        <DAppAvatar name={meta.name} icon={meta.icons[0]} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {meta.name}
          </p>
          <p className="text-xs text-gray-500 dark:text-zinc-400 truncate">
            {meta.url}
          </p>
          {meta.description && (
            <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-0.5 truncate">
              {meta.description}
            </p>
          )}
        </div>
        {/* Connected indicator */}
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 bg-green-500 rounded-full" />
          <span className="text-[10px] text-green-500">Active</span>
        </div>
      </div>

      {/* Connected chains */}
      {allChains.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-zinc-500 font-medium mb-1">
            Chains
          </p>
          <div className="flex gap-1 flex-wrap">
            {allChains.map((chain) => (
              <span
                key={chain}
                className="px-1.5 py-0.5 text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded"
              >
                {chain}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Methods */}
      {allMethods.length > 0 && (
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-zinc-500 font-medium mb-1">
            Permitted Methods
          </p>
          <div className="flex gap-1 flex-wrap">
            {allMethods.map((method) => (
              <span
                key={method}
                className="px-1.5 py-0.5 text-[9px] bg-gray-200 dark:bg-zinc-600 text-gray-600 dark:text-zinc-300 rounded font-mono"
              >
                {method}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Accounts */}
      {allAccounts.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-zinc-500 font-medium mb-1">
            Exposed Accounts
          </p>
          {allAccounts.map((account) => (
            <div
              key={account}
              className="p-1.5 mb-1 bg-gray-50 dark:bg-zinc-700/30 rounded border border-gray-200 dark:border-zinc-600"
            >
              <p className="text-[10px] font-mono text-gray-700 dark:text-zinc-300 break-all">
                {account}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Disconnect */}
      {showConfirm ? (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded">
          <p className="text-xs text-red-400 mb-2">
            Disconnect from {meta.name}?
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowConfirm(false)}
              disabled={isLoading}
              className="flex-1 px-3 py-1.5 text-xs text-gray-600 dark:text-zinc-300 bg-gray-100 dark:bg-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-600 rounded font-medium transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleDisconnect}
              disabled={isLoading}
              className="flex-1 px-3 py-1.5 text-xs text-white bg-red-600 hover:bg-red-700 rounded font-medium transition-colors disabled:opacity-50"
            >
              {isLoading ? "Disconnecting..." : "Disconnect"}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowConfirm(true)}
          className="w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-red-300 dark:border-red-500/50 rounded transition-colors"
        >
          Disconnect
        </button>
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

function DAppAvatar({ name, icon }: { name: string; icon?: string }) {
  const [imgError, setImgError] = useState(false);
  const safeIcon = sanitizeImageUrl(icon);

  if (!safeIcon || imgError) {
    return (
      <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-zinc-600 flex items-center justify-center text-gray-500 dark:text-zinc-400 font-medium text-sm">
        {name.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={safeIcon}
      alt={name}
      className="w-10 h-10 rounded-full"
      onError={() => setImgError(true)}
    />
  );
}
