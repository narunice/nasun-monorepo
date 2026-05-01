// Base Staking & Apps Staking card.
//
// NSN keeps its native staking flow. SUI/ETH/SOL surfaces are temporarily
// "Coming Soon"; their hooks/state were removed to avoid wasting RPC and
// hiding deletion debt — git history retains the prior implementation for
// when the rows are re-enabled.

import { useState } from "react";
import { useWallet, useZkLogin, useStaking } from "@nasun/wallet";
import { UjuCard, UjuButton, UjuBadge, UjuSectionHeader, UjuComingSoonTag } from "../shared";
import { StakeModal } from "./staking/StakeModal";

interface RowProps {
  symbol: string;
  network?: string;
  trailing: React.ReactNode;
}

function Row({ symbol, network, trailing }: RowProps) {
  return (
    <li className="flex items-center justify-between gap-3 py-3 border-b border-uju-border/50 last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base font-semibold text-uju-primary">{symbol}</span>
        {network && <UjuBadge tone="violet">{network}</UjuBadge>}
      </div>
      <div className="flex items-center gap-2 shrink-0">{trailing}</div>
    </li>
  );
}

function ComingSoonTag() {
  return <UjuComingSoonTag />;
}

export function StakingCard() {
  const { status, account } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const { summary, isLoading } = useStaking();

  const [modalOpen, setModalOpen] = useState(false);

  const isNasunConnected = (status === "unlocked" && !!account) || isZkConnected;

  const nasunTrailing = (
    <>
      {isLoading ? (
        <span className="text-base text-uju-secondary">…</span>
      ) : isNasunConnected ? (
        <span className="text-base text-uju-primary tabular-nums">
          {summary?.formattedTotalStaked ?? "0.0000"}
          {summary?.formattedTotalRewards && summary.formattedTotalRewards !== "0"
            ? ` +${summary.formattedTotalRewards}`
            : ""}
        </span>
      ) : (
        <span className="text-base text-uju-secondary">Not connected</span>
      )}
      <UjuButton variant="primary" size="sm" onClick={() => setModalOpen(true)}>
        Stake
      </UjuButton>
    </>
  );

  return (
    <>
      <UjuCard>
        <UjuSectionHeader accent title="Base Staking & Apps Staking" subtitle="Earn rewards across networks" />

        <ul className="-mt-1">
          <Row symbol="NSN" trailing={nasunTrailing} />
          <Row symbol="SUI" trailing={<ComingSoonTag />} />
          <Row symbol="ETH" trailing={<ComingSoonTag />} />
          <Row symbol="SOL" trailing={<ComingSoonTag />} />
        </ul>
      </UjuCard>

      {modalOpen && <StakeModal open={modalOpen} onClose={() => setModalOpen(false)} />}
    </>
  );
}
