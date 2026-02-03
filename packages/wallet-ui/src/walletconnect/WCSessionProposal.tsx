/**
 * WCSessionProposal
 *
 * Displays a WalletConnect session proposal from a dApp.
 * User can approve or reject the connection request.
 */

import { useState } from "react";
import {
  useWalletConnect,
  useWallet,
  canSatisfyProposal,
} from "@nasun/wallet";
import type { ViewMode } from "../connect/types";
import { sanitizeImageUrl } from "../shared";

interface WCSessionProposalProps {
  setViewMode: (mode: ViewMode) => void;
}

export function WCSessionProposal({ setViewMode }: WCSessionProposalProps) {
  const { state, approveSession, rejectSession } = useWalletConnect();
  const { account } = useWallet();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const proposal = state.pendingProposals[0];

  if (!proposal) {
    return (
      <div className="p-4 w-full">
        <BackButton onClick={() => setViewMode("wc-main")} />
        <div className="text-center py-8">
          <p className="text-sm text-gray-500 dark:text-zinc-400">No pending proposals</p>
        </div>
      </div>
    );
  }

  const { metadata } = proposal.params.proposer;
  const requiredNamespaces = proposal.params.requiredNamespaces;

  // Check if wallet can satisfy the proposal
  const hasSuiSigner = !!account;
  const hasEvmSigner = false; // TODO: check EVM signer availability
  const { canSatisfy, missingNamespaces } = canSatisfyProposal(
    requiredNamespaces,
    hasEvmSigner,
    hasSuiSigner
  );

  const handleApprove = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await approveSession(proposal.id);
      setViewMode("wc-main");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve session");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReject = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await rejectSession(proposal.id);
      setViewMode("wc-main");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject session");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 w-full">
      <BackButton onClick={() => setViewMode("wc-main")} />

      <h3 className="text-sm md:text-base font-medium text-gray-900 dark:text-white mb-4">
        Session Proposal
      </h3>

      {/* dApp info */}
      <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 dark:bg-zinc-700/50 rounded-lg">
        <DAppAvatar name={metadata.name} icon={metadata.icons[0]} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {metadata.name}
          </p>
          <p className="text-xs text-gray-500 dark:text-zinc-400 truncate">
            {metadata.url}
          </p>
        </div>
      </div>

      {/* Requested permissions */}
      <div className="mb-4">
        <p className="text-xs font-medium text-gray-500 dark:text-zinc-400 mb-2 uppercase tracking-wider">
          Requested Permissions
        </p>
        {Object.entries(requiredNamespaces).map(([ns, nsData]) => (
          <div key={ns} className="mb-2 p-2 bg-gray-50 dark:bg-zinc-700/30 rounded border border-gray-200 dark:border-zinc-600">
            <p className="text-xs font-medium text-gray-900 dark:text-white mb-1">
              {ns.toUpperCase()}
            </p>
            {/* Chains */}
            {nsData.chains && nsData.chains.length > 0 && (
              <div className="flex gap-1 flex-wrap mb-1">
                {nsData.chains.map((chain: string) => (
                  <span key={chain} className="px-1.5 py-0.5 text-[9px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                    {chain}
                  </span>
                ))}
              </div>
            )}
            {/* Methods */}
            {nsData.methods && nsData.methods.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {nsData.methods.map((method: string) => (
                  <span key={method} className="px-1.5 py-0.5 text-[9px] bg-gray-200 dark:bg-zinc-600 text-gray-600 dark:text-zinc-300 rounded font-mono">
                    {method}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Compatibility warning */}
      {!canSatisfy && (
        <div className="mb-4 p-2 bg-red-500/10 border border-red-500/30 rounded">
          <p className="text-xs text-red-400 font-medium mb-1">Incompatible Request</p>
          <p className="text-xs text-red-400">
            Missing support for: {missingNamespaces.join(", ")}
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
          {error}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleReject}
          disabled={isLoading}
          className="flex-1 px-3 py-2 text-sm text-gray-600 dark:text-zinc-300 bg-gray-100 dark:bg-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-600 rounded font-medium transition-colors disabled:opacity-50"
        >
          Reject
        </button>
        <button
          onClick={handleApprove}
          disabled={isLoading || !canSatisfy}
          className="flex-1 px-3 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-zinc-600 disabled:text-gray-500 dark:disabled:text-zinc-400 rounded font-medium transition-colors"
        >
          {isLoading ? "Processing..." : "Approve"}
        </button>
      </div>
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
