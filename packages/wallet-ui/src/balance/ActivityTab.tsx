/**
 * ActivityTab Component
 *
 * Combined view of Transaction History and Pending Proposals.
 * Replaces the separate history tab from the original design.
 */

import { type NsaSignerProposal } from "@nasun/wallet";
import { TransactionHistoryPanel } from "../transaction/TransactionHistoryPanel";

interface ActivityTabProps {
  /** Pending signer proposals */
  pendingProposals: NsaSignerProposal[];
  /** Current wallet address */
  currentAddress?: string;
  /** Whether NSA is initialized */
  nsaIsInitialized: boolean;
  /** Callback when a proposal is clicked */
  onProposalClick?: (proposal: NsaSignerProposal) => void;
}

export function ActivityTab({
  pendingProposals,
  currentAddress,
  nsaIsInitialized,
  onProposalClick,
}: ActivityTabProps) {
  // Filter proposals relevant to current user
  const proposalsForMe = pendingProposals.filter(
    (p) =>
      currentAddress &&
      p.pendingSigner.toLowerCase() === currentAddress.toLowerCase() &&
      !p.isExecuted &&
      !p.isCancelled
  );

  return (
    <div className="overflow-x-hidden">
      {/* Pending Proposals Section - only show if there are any */}
      {nsaIsInitialized && proposalsForMe.length > 0 && (
        <div className="px-3 py-2 border-b border-gray-200 dark:border-zinc-700">
          <p className="text-xs xl:text-sm font-medium text-gray-500 dark:text-zinc-400 mb-2">
            Pending Invitations ({proposalsForMe.length})
          </p>
          <div className="space-y-2">
            {proposalsForMe.map((proposal) => (
              <button
                key={proposal.objectId}
                onClick={() => onProposalClick?.(proposal)}
                className="w-full p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md text-left hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <svg
                      className="w-4 h-4 text-blue-600 dark:text-blue-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                      />
                    </svg>
                    <div>
                      <p className="text-sm xl:text-base font-medium text-blue-700 dark:text-blue-300">
                        {proposal.label || "Signer Invitation"}
                      </p>
                      <p className="text-xs xl:text-sm text-blue-600/70 dark:text-blue-400/70">
                        From: {proposal.proposer.slice(0, 8)}...{proposal.proposer.slice(-4)}
                      </p>
                    </div>
                  </div>
                  <svg
                    className="w-4 h-4 text-blue-600 dark:text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Transaction History */}
      <TransactionHistoryPanel hideHeader limit={50} />
    </div>
  );
}
