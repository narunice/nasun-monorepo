/**
 * VotingPowerSummary Component
 *
 * Displays user's voting power breakdown in a card format.
 * Shows base power, NFT bonus, and delegated power.
 * Includes tooltips for explanations and CTA buttons for actions.
 */

import { FC, useState } from "react";
import { useWallet } from "@nasun/wallet";
import { WalletConnect } from "@nasun/wallet-ui";
import { useVotingPower } from "../hooks/useVotingPower";
import { useDelegation } from "../hooks/useDelegation";
import { useAuth } from "@/providers/auth/AuthContext";
import * as Tooltip from "@radix-ui/react-tooltip";
import { InfoCircledIcon, ChevronDownIcon, CheckCircledIcon } from "@radix-ui/react-icons";

interface VotingPowerSummaryProps {
  className?: string;
}

// Tooltip wrapper component for consistent styling
const InfoTooltip: FC<{ content: string }> = ({ content }) => (
  <Tooltip.Root>
    <Tooltip.Trigger asChild>
      <button className="text-nasun-white/40 hover:text-nasun-white/70 transition-colors">
        <InfoCircledIcon className="w-4 h-4" />
      </button>
    </Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Content
        side="top"
        align="center"
        sideOffset={5}
        className="max-w-[250px] px-3 py-2 bg-nasun-black text-nasun-white text-xs border border-nasun-white/20 rounded-lg z-50"
      >
        {content}
        <Tooltip.Arrow className="fill-nasun-black" />
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>
);

export const VotingPowerSummary: FC<VotingPowerSummaryProps> = ({ className = "" }) => {
  const { status, account } = useWallet();
  const isConnected = status === "unlocked" && account;

  const { votingPower, nftVerification, isLoading: isLoadingPower } = useVotingPower();
  const { delegationState, isLoading: isLoadingDelegation } = useDelegation();
  const { user, isAuthenticated, signInWithTwitter } = useAuth();

  const [showHowItWorks, setShowHowItWorks] = useState(false);

  const isLoading = isLoadingPower || isLoadingDelegation;

  // Check if user has linked X account (provider is stored as "Twitter" with capital T)
  const hasLinkedX = isAuthenticated && user?.provider === "Twitter";

  // Calculate voting power components
  const basePower = votingPower?.leaderboardScore || 1;
  const nftBonus = nftVerification?.nftBonus || 0;
  const delegatedPower = delegationState?.delegatorCount
    ? delegationState.delegatorCount * 100 // Placeholder: 100 power per delegator
    : 0;
  const totalPower = basePower + nftBonus + delegatedPower;

  // Check if MetaMask is available
  const hasMetaMask = typeof window !== "undefined" && !!window.ethereum?.isMetaMask;

  // Handle Link X button click
  const handleLinkX = async () => {
    try {
      // Save current page to return after OAuth
      localStorage.setItem("auth_return_url", window.location.pathname);
      await signInWithTwitter();
    } catch (error) {
      console.error("X sign-in failed:", error);
    }
  };

  return (
    <div className={`bg-nasun-c6 border border-nasun-c5/50 rounded-xl p-6 ${className}`}>
      <h3 className="text-lg font-semibold text-nasun-white mb-4">
        Your Voting Power
      </h3>

      {/* Not Connected */}
      {!isConnected ? (
        <div className="text-center py-6">
          <p className="text-nasun-white/70 mb-4">
            Connect wallet to view your voting power
          </p>
          <WalletConnect />
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-nasun-c3 border-t-transparent"></div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Total Power */}
          <div className="text-center py-4 bg-nasun-black/30 rounded-lg">
            <div className="text-4xl font-bold text-nasun-c3">
              {totalPower.toLocaleString()}
            </div>
            <div className="text-sm text-nasun-white/50 mt-1">Total Voting Power</div>
          </div>

          {/* Breakdown */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-nasun-white/70">Breakdown</h4>

            {/* Base Power */}
            <div className="flex items-center justify-between py-2 border-b border-nasun-c5/20">
              <div className="flex items-center gap-2">
                <span className="text-nasun-white/80">Base</span>
                <InfoTooltip content="Base voting power for connecting your Nasun wallet." />
                <CheckCircledIcon className="w-4 h-4 text-green-400" />
              </div>
              <span className="text-nasun-white font-medium">1</span>
            </div>

            {/* Leaderboard Bonus */}
            <div className="flex items-center justify-between py-2 border-b border-nasun-c5/20">
              <div className="flex items-center gap-2">
                <span className="text-nasun-white/80">Leaderboard Bonus</span>
                <InfoTooltip content="Verify your X account to earn bonus voting power from community engagement on the leaderboard." />
                {!hasLinkedX ? (
                  <button
                    onClick={handleLinkX}
                    className="text-xs text-nasun-c4 hover:text-nasun-c3 hover:underline transition-colors"
                  >
                    Verify X Account →
                  </button>
                ) : (
                  <CheckCircledIcon className="w-4 h-4 text-green-400" />
                )}
              </div>
              <span className={`font-medium ${hasLinkedX && basePower > 1 ? "text-nasun-c3" : "text-nasun-white/50"}`}>
                {hasLinkedX ? (basePower > 1 ? `+${(basePower - 1).toLocaleString()}` : "No Bonus") : "—"}
              </span>
            </div>

            {/* NFT Bonus */}
            <div className="flex items-center justify-between py-2 border-b border-nasun-c5/20">
              <div className="flex items-center gap-2">
                <span className="text-nasun-white/80">NFT Bonus</span>
                <InfoTooltip content="Verify Battalion NFT ownership with MetaMask to receive +2 voting power bonus." />
                {nftBonus > 0 ? (
                  <CheckCircledIcon className="w-4 h-4 text-green-400" />
                ) : (
                  <button
                    onClick={() => {
                      if (hasMetaMask) {
                        // NFT verification is done in vote modal
                        // Could show a tooltip or scroll to proposals
                      } else {
                        // Open MetaMask install page
                        window.open("https://metamask.io/download/", "_blank");
                      }
                    }}
                    className="text-xs text-nasun-c4 hover:text-nasun-c3 hover:underline transition-colors"
                  >
                    Verify Ownership →
                  </button>
                )}
              </div>
              <span className={`font-medium ${nftBonus > 0 ? "text-nasun-c3" : "text-nasun-white/50"}`}>
                {nftBonus > 0 ? `+${nftBonus.toLocaleString()}` : "—"}
              </span>
            </div>

            {/* Delegated Power */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <span className="text-nasun-white/80">Delegated to you</span>
                <InfoTooltip content="Other users can delegate their voting power to you. You'll vote on their behalf." />
                {delegationState && delegationState.delegatorCount > 0 && (
                  <span className="text-xs text-nasun-white/50">
                    ({delegationState.delegatorCount} {delegationState.delegatorCount === 1 ? "user" : "users"})
                  </span>
                )}
              </div>
              <span className={`font-medium ${delegatedPower > 0 ? "text-nasun-c3" : "text-nasun-white/50"}`}>
                {delegatedPower > 0 ? `+${delegatedPower.toLocaleString()}` : "—"}
              </span>
            </div>
          </div>

          {/* How Voting Power Works - Collapsible */}
          <div className="mt-4 pt-4 border-t border-nasun-c5/30">
            <button
              onClick={() => setShowHowItWorks(!showHowItWorks)}
              className="flex items-center gap-2 text-sm text-nasun-white/60 hover:text-nasun-white/80 transition-colors w-full"
            >
              <InfoCircledIcon className="w-4 h-4" />
              <span>How Voting Power Works</span>
              <ChevronDownIcon
                className={`w-4 h-4 ml-auto transition-transform duration-200 ${showHowItWorks ? "rotate-180" : ""}`}
              />
            </button>

            {showHowItWorks && (
              <div className="mt-3 p-3 bg-nasun-black/30 rounded-lg text-sm text-nasun-white/70 animate-in slide-in-from-top-2 duration-200">
                <ul className="space-y-3">
                  <li>
                    <span className="text-nasun-white font-medium">Base (1 power)</span>
                    <p className="mt-0.5 text-xs">Every wallet holder starts with 1 voting power just by connecting their Nasun wallet.</p>
                  </li>
                  <li>
                    <span className="text-nasun-white font-medium">Leaderboard Bonus</span>
                    <p className="mt-0.5 text-xs">Higher rankers on the community leaderboard earn more voting power. Verify your X account and engage with the community to climb the ranks.</p>
                  </li>
                  <li>
                    <span className="text-nasun-white font-medium">NFT Bonus (+2 power)</span>
                    <p className="mt-0.5 text-xs">Battalion NFT holders receive +2 bonus voting power. Verify ownership by signing with MetaMask when voting.</p>
                  </li>
                  <li>
                    <span className="text-nasun-white font-medium">Delegation</span>
                    <p className="mt-0.5 text-xs">Other community members can delegate their voting power to you. When they do, you vote on their behalf with combined power.</p>
                  </li>
                </ul>
              </div>
            )}
          </div>

          {/* Delegation Warning */}
          {delegationState?.hasDelegated && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 mt-4">
              <p className="text-sm text-yellow-400">
                Your voting power is delegated to another address. Revoke to vote directly.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VotingPowerSummary;
