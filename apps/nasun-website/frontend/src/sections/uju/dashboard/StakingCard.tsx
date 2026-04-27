import { useState } from "react";
import { useWallet, useZkLogin, useStaking } from "@nasun/wallet";
import { UjuCard, UjuButton, UjuBadge, UjuSectionHeader } from "../shared";
import { StakeModal } from "./staking/StakeModal";

const SUI_VALIDATORS_URL = "https://suiscan.xyz/testnet/validators";
const LIDO_STAKING_URL = "https://stake.lido.fi";
const MARINADE_STAKING_URL = "https://marinade.finance";
const SUI_APY_DISPLAY = "~3.5%";
const ETH_LIDO_APY_DISPLAY = "~3.8%";

interface RowProps {
  symbol: string;
  network?: string;
  apy?: string;
  trailing: React.ReactNode;
}

function Row({ symbol, network, apy, trailing }: RowProps) {
  return (
    <li className="flex items-center justify-between gap-3 py-3 border-b border-uju-border/50 last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-semibold text-uju-primary">{symbol}</span>
        {network && <UjuBadge tone="violet">{network}</UjuBadge>}
        {apy && (
          <span className="text-sm text-pado-3 tabular-nums hidden sm:inline">
            {apy}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">{trailing}</div>
    </li>
  );
}

function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm font-medium text-pado-3 hover:text-pado-4 transition-colors"
    >
      {label} ↗
    </a>
  );
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
        <span className="text-sm text-uju-secondary">…</span>
      ) : isNasunConnected ? (
        <span className="text-sm text-uju-primary tabular-nums">
          {summary?.formattedTotalStaked ?? "0.0000"}
          {summary?.formattedTotalRewards && summary.formattedTotalRewards !== "0"
            ? ` +${summary.formattedTotalRewards}`
            : ""}
        </span>
      ) : (
        <span className="text-sm text-uju-secondary">Not connected</span>
      )}
      <UjuButton size="sm" onClick={() => setModalOpen(true)}>
        Stake
      </UjuButton>
    </>
  );

  return (
    <>
      <UjuCard>
        <UjuSectionHeader accent title="Staking" subtitle="Earn rewards across networks" />

        <ul className="-mt-1">
          <Row symbol="NSN" trailing={nasunTrailing} />
          <Row
            symbol="SUI"
            network="Testnet"
            apy={SUI_APY_DISPLAY}
            trailing={<ExternalLink href={SUI_VALIDATORS_URL} label="Open" />}
          />
          <Row
            symbol="ETH"
            network="Sepolia"
            apy={ETH_LIDO_APY_DISPLAY}
            trailing={<ExternalLink href={LIDO_STAKING_URL} label="Open" />}
          />
          <Row
            symbol="SOL"
            network="Devnet"
            trailing={<ExternalLink href={MARINADE_STAKING_URL} label="Open" />}
          />
        </ul>
      </UjuCard>

      {modalOpen && <StakeModal open={modalOpen} onClose={() => setModalOpen(false)} />}
    </>
  );
}
