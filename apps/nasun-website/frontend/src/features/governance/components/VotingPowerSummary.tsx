/**
 * VotingPowerSummary Component (V3 - Compact)
 *
 * Compact, always-visible voting power display.
 * Shows total + inline breakdown chips + collapsible explanation.
 */

import { FC, useState } from "react";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { useVotingPower } from "../hooks/useVotingPower";
import { Spinner } from "@/components/ui";
import * as Tooltip from "@radix-ui/react-tooltip";
import { InfoCircledIcon, ChevronDownIcon } from "@radix-ui/react-icons";

interface VotingPowerSummaryProps {
  className?: string;
}

const InfoTooltip: FC<{ content: string }> = ({ content }) => (
  <Tooltip.Root>
    <Tooltip.Trigger asChild>
      <button className="text-nasun-white/30 hover:text-nasun-white/60 transition-colors">
        <InfoCircledIcon className="w-3 h-3" />
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

const BASE_POWER = 10;

const PowerChip: FC<{
  label: string;
  value: number;
  tooltip: string;
  rank?: number | null;
  isBase?: boolean;
}> = ({ label, value, tooltip, rank, isBase }) => {
  const active = isBase || value > 0;
  return (
    <div className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border ${
      active
        ? "border-nasun-white/15 bg-nasun-white/[0.07]"
        : "border-nasun-white/[0.1] bg-transparent"
    }`}>
      <span className={`text-xs font-medium ${active ? "text-nasun-white/90" : "text-nasun-white/40"}`}>
        {label}
      </span>
      <InfoTooltip content={tooltip} />
      {rank != null && rank <= 500 && (
        <span className="text-[10px] text-nasun-nw1 font-medium">#{rank}</span>
      )}
      <span className={`text-sm font-bold ml-0.5 ${
        isBase ? "text-nasun-white" : value > 0 ? "text-nasun-nw4" : "text-nasun-white/25"
      }`}>
        {isBase ? value : value > 0 ? `+${value}` : "-"}
      </span>
    </div>
  );
};

export const VotingPowerSummary: FC<VotingPowerSummaryProps> = ({ className = "" }) => {
  const { status, account } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const isConnected = (status === "unlocked" && account) || isZkConnected;

  const { votingPower, isLoading, isFetching } = useVotingPower();
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  const isRefetching = isFetching && !isLoading;
  const totalPower = votingPower?.totalVotingPower || BASE_POWER;
  const breakdown = votingPower?.breakdown;
  const rank = votingPower?.rank;

  if (!isConnected) return null;

  if (isLoading) {
    return (
      <div className={`rounded-lg border border-nasun-white/10 bg-gradient-to-r from-[#0f1a2e] via-[#162038] to-[#0d1f35] p-4 ${className}`}>
        <div className="flex items-center justify-center py-3">
          <Spinner size="sm" />
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-nasun-white/10 bg-gradient-to-r from-[#0f1a2e] via-[#162038] to-[#0d1f35] p-4 transition-opacity ${isRefetching ? "opacity-60" : ""} ${className}`}>
      <h4 className="text-xs font-semibold text-nasun-white/80 uppercase tracking-wider mb-3">Your Voting Power</h4>

      {/* Main row: Total + Breakdown chips */}
      <div className="flex items-center gap-4 flex-wrap">
        {/* Total */}
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-nasun-nw4 tabular-nums">{totalPower}</span>
          <span className="text-xs text-nasun-white/40 uppercase tracking-wider">VP</span>
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-nasun-white/10 hidden sm:block" />

        {/* Breakdown chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <PowerChip
            label="Base"
            value={breakdown?.base ?? BASE_POWER}
            tooltip="Every voter receives base voting power of 10."
            isBase
          />
          <PowerChip
            label="X"
            value={breakdown?.xLinked ?? 0}
            tooltip="Link your X account in My Account to earn +5 voting power."
          />
          <PowerChip
            label="TG"
            value={breakdown?.telegram ?? 0}
            tooltip="Join the Nasun Telegram channel and verify in My Account to earn +5 voting power."
          />
          <PowerChip
            label="Rank"
            value={breakdown?.rankBonus ?? 0}
            tooltip="Rank 1 gets +20, proportionally decreasing to +10 at Rank 100. Ranks 101-500 get +10."
            rank={rank}
          />
        </div>
      </div>

      {/* How Voting Power Works - Collapsible */}
      <div className="mt-2.5 pt-2.5 border-t border-nasun-white/5">
        <button
          onClick={() => setShowHowItWorks(!showHowItWorks)}
          className="flex items-center gap-1.5 text-xs text-nasun-white/30 hover:text-nasun-white/50 transition-colors"
        >
          <InfoCircledIcon className="w-3 h-3" />
          <span>How Voting Power Works</span>
          <ChevronDownIcon
            className={`w-3 h-3 transition-transform duration-200 ${showHowItWorks ? "rotate-180" : ""}`}
          />
        </button>

        {showHowItWorks && (
          <div className="mt-2 p-3 bg-nasun-black/30 rounded-sm text-xs text-nasun-white/60 animate-in slide-in-from-top-2 duration-200">
            <ul className="space-y-2">
              <li>
                <span className="text-nasun-white font-medium">Base (10)</span>
                <p className="mt-0.5">Every connected wallet receives base voting power.</p>
              </li>
              <li>
                <span className="text-nasun-white font-medium">X Account (+5)</span>
                <p className="mt-0.5">Link your X account in My Account page.</p>
              </li>
              <li>
                <span className="text-nasun-white font-medium">Telegram (+5)</span>
                <p className="mt-0.5">Join the Nasun Telegram channel and verify membership.</p>
              </li>
              <li>
                <span className="text-nasun-white font-medium">Leaderboard Rank (+10 to +20)</span>
                <p className="mt-0.5">Rank 1 gets +20, proportionally decreasing to +10 at Rank 100. Ranks 101-500 get +10. Unranked participants get no bonus.</p>
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default VotingPowerSummary;
