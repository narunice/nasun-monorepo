/**
 * VotingPowerSummary Component (V2)
 *
 * Displays user's voting power breakdown:
 * Base + Leaderboard + On-Chain Activity + Allowlist + X Linked
 */

import { FC, useState, useEffect } from "react";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { WalletConnect } from "@nasun/wallet-ui";
import { useVotingPower } from "../hooks/useVotingPower";
import { useAuth } from "@/features/auth";
import { OuterBox, DividerBox } from "@/components/ui";
import * as Tooltip from "@radix-ui/react-tooltip";
import { InfoCircledIcon, ChevronDownIcon, CheckCircledIcon } from "@radix-ui/react-icons";

interface VotingPowerSummaryProps {
  className?: string;
}

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
        className="max-w-[250px] px-3 py-2 bg-nasun-gray text-nasun-white/90 text-xs border border-nasun-white/10 rounded-sm z-50 shadow-lg"
      >
        {content}
        <Tooltip.Arrow className="fill-nasun-gray" />
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>
);

export const VotingPowerSummary: FC<VotingPowerSummaryProps> = ({ className = "" }) => {
  const { status, account } = useWallet();
  const { isConnected: isZkConnected, state: zkState } = useZkLogin();
  const isConnected = (status === "unlocked" && account) || isZkConnected;

  const { votingPower, isLoading, fetchVotingPower } = useVotingPower();
  const { user, isAuthenticated, signInWithTwitter } = useAuth();

  const [showHowItWorks, setShowHowItWorks] = useState(false);

  const hasLinkedX = isAuthenticated && user?.provider === "Twitter";
  const walletAddress = isZkConnected ? zkState?.address : account?.address;

  // Fetch voting power when connected
  useEffect(() => {
    if (isConnected && walletAddress) {
      fetchVotingPower(user?.twitterHandle, walletAddress);
    }
  }, [isConnected, walletAddress, user?.twitterHandle, fetchVotingPower]);

  const totalPower = votingPower?.totalVotingPower || 1;
  const breakdown = votingPower?.breakdown;

  const handleLinkX = async () => {
    try {
      localStorage.setItem("auth_return_url", window.location.pathname);
      await signInWithTwitter();
    } catch (error) {
      console.error("X sign-in failed:", error);
    }
  };

  return (
    <OuterBox color="n2" padding="md" className={`h-full ${className}`}>
      <h3 className="text-lg font-medium text-nasun-white mb-4">
        Your Voting Power
      </h3>

      {!isConnected ? (
        <div className="text-center py-6">
          <p className="text-nasun-white/70 mb-4">
            Connect wallet to view your voting power
          </p>
          <WalletConnect />
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-nasun-nw1 border-t-transparent"></div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Total Power */}
          <DividerBox color="nw1" padding="sm" className="text-center">
            <div className="text-4xl font-bold text-nasun-nw4">
              {totalPower.toLocaleString()}
            </div>
            <div className="text-sm text-nasun-white/50 mt-1">Total Voting Power</div>
          </DividerBox>

          {/* Breakdown */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-nasun-white/70">Breakdown</h4>

            {/* Base Power */}
            <div className="flex items-center justify-between py-2 border-b border-nasun-white/5">
              <div className="flex items-center gap-2">
                <span className="text-nasun-white/80">Base</span>
                <InfoTooltip content="Base voting power for connecting your Nasun wallet." />
                <CheckCircledIcon className="w-4 h-4 text-green-400" />
              </div>
              <span className="text-nasun-white font-medium">{breakdown?.base ?? 1}</span>
            </div>

            {/* Leaderboard Bonus */}
            <div className="flex items-center justify-between py-2 border-b border-nasun-white/5">
              <div className="flex items-center gap-2">
                <span className="text-nasun-white/80">Leaderboard</span>
                <InfoTooltip content="Verify your X account to earn bonus voting power from community engagement on the leaderboard." />
                {!hasLinkedX ? (
                  <button
                    onClick={handleLinkX}
                    className="text-xs text-nasun-nw1 hover:text-nasun-nw2 hover:underline transition-colors"
                  >
                    Verify X Account
                  </button>
                ) : (
                  <CheckCircledIcon className="w-4 h-4 text-green-400" />
                )}
              </div>
              <span className={`font-medium ${(breakdown?.leaderboard ?? 0) > 0 ? "text-nasun-nw4" : "text-nasun-white/50"}`}>
                {(breakdown?.leaderboard ?? 0) > 0 ? `+${breakdown!.leaderboard}` : "\u2014"}
              </span>
            </div>

            {/* On-Chain Activity */}
            <div className="flex items-center justify-between py-2 border-b border-nasun-white/5">
              <div className="flex items-center gap-2">
                <span className="text-nasun-white/80">On-Chain Activity</span>
                <InfoTooltip content="Trade, bet, lend, and use AI on Nasun Devnet to earn more voting power." />
              </div>
              <span className={`font-medium ${(breakdown?.onChain ?? 0) > 0 ? "text-nasun-nw4" : "text-nasun-white/50"}`}>
                {(breakdown?.onChain ?? 0) > 0 ? `+${breakdown!.onChain}` : "\u2014"}
              </span>
            </div>

            {/* Battalion Allowlist Bonus */}
            <div className="flex items-center justify-between py-2 border-b border-nasun-white/5">
              <div className="flex items-center gap-2">
                <span className="text-nasun-white/80">Battalion Allowlist</span>
                <InfoTooltip content="Battalion NFT allowlist registrants receive +20 bonus voting power." />
              </div>
              <span className={`font-medium ${(breakdown?.battalionAllowlist ?? 0) > 0 ? "text-nasun-nw4" : "text-nasun-white/50"}`}>
                {(breakdown?.battalionAllowlist ?? 0) > 0 ? `+${breakdown!.battalionAllowlist}` : "\u2014"}
              </span>
            </div>

            {/* Genesis Whitelist Bonus */}
            <div className="flex items-center justify-between py-2 border-b border-nasun-white/5">
              <div className="flex items-center gap-2">
                <span className="text-nasun-white/80">Genesis Whitelist</span>
                <InfoTooltip content="Genesis NFT whitelist registrants receive +20 bonus voting power." />
              </div>
              <span className={`font-medium ${(breakdown?.genesisAllowlist ?? 0) > 0 ? "text-nasun-nw4" : "text-nasun-white/50"}`}>
                {(breakdown?.genesisAllowlist ?? 0) > 0 ? `+${breakdown!.genesisAllowlist}` : "\u2014"}
              </span>
            </div>

            {/* X Account Linked */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <span className="text-nasun-white/80">X Account</span>
                <InfoTooltip content="Link your X (Twitter) account to receive +10 bonus voting power." />
                {hasLinkedX && <CheckCircledIcon className="w-4 h-4 text-green-400" />}
              </div>
              <span className={`font-medium ${(breakdown?.xLinked ?? 0) > 0 ? "text-nasun-nw4" : "text-nasun-white/50"}`}>
                {(breakdown?.xLinked ?? 0) > 0 ? `+${breakdown!.xLinked}` : "\u2014"}
              </span>
            </div>
          </div>

          {/* How Voting Power Works - Collapsible */}
          <div className="mt-4 pt-4 border-t border-nasun-white/10">
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
              <div className="mt-3 p-3 bg-nasun-black/30 rounded-sm text-sm text-nasun-white/70 animate-in slide-in-from-top-2 duration-200">
                <ul className="space-y-3">
                  <li>
                    <span className="text-nasun-white font-medium">Base (1 power)</span>
                    <p className="mt-0.5 text-xs">Every wallet holder starts with 1 voting power.</p>
                  </li>
                  <li>
                    <span className="text-nasun-white font-medium">Leaderboard Bonus</span>
                    <p className="mt-0.5 text-xs">Higher rankers on the community leaderboard earn more voting power. Verify your X account and engage with the community.</p>
                  </li>
                  <li>
                    <span className="text-nasun-white font-medium">On-Chain Activity</span>
                    <p className="mt-0.5 text-xs">Trade on DeepBook, participate in prediction markets, lottery, lending, and use Baram AI to earn activity-based voting power.</p>
                  </li>
                  <li>
                    <span className="text-nasun-white font-medium">Allowlist Bonus (+30)</span>
                    <p className="mt-0.5 text-xs">Battalion NFT allowlist registrants receive a significant bonus to their voting power.</p>
                  </li>
                  <li>
                    <span className="text-nasun-white font-medium">X Account (+5)</span>
                    <p className="mt-0.5 text-xs">Link your X (Twitter) account to receive a small participation bonus.</p>
                  </li>
                  <li className="pt-2 border-t border-nasun-white/10">
                    <span className="text-nasun-nw4 font-medium flex items-center gap-1">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      Current Phase
                    </span>
                    <p className="mt-0.5 text-xs">This governance phase uses an off-chain Oracle to calculate and verify voting power. The Oracle signs certificates that are validated on-chain. In future phases, voting power calculation will be fully decentralized.</p>
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </OuterBox>
  );
};

export default VotingPowerSummary;
