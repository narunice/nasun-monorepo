import { useState } from "react";
import { useWallet, useZkLogin, useStaking } from "@nasun/wallet";
import { UjuCard } from "../shared/UjuCard";
import { StakeModal } from "./staking/StakeModal";

const SUI_VALIDATORS_URL = "https://suiscan.xyz/testnet/validators";
const LIDO_STAKING_URL = "https://stake.lido.fi";
const MARINADE_STAKING_URL = "https://marinade.finance";
const SUI_APY_DISPLAY = "~3.5%";
const ETH_LIDO_APY_DISPLAY = "~3.8%";

function NetworkBadge({ label }: { label: string }) {
  return (
    <span className="text-xs text-uju-secondary border border-uju-border rounded px-1 py-0.5">
      {label}
    </span>
  );
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm text-pado-3 hover:underline"
    >
      {children}
    </a>
  );
}

export function StakingCard() {
  const { status, account } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const { summary, isLoading } = useStaking();
  const [modalOpen, setModalOpen] = useState(false);

  const isNasunConnected = (status === "unlocked" && !!account) || isZkConnected;

  return (
    <>
      <UjuCard>
        <p className="text-sm font-medium text-uju-secondary mb-3">Staking</p>

        <ul className="space-y-3">
          {/* NSN */}
          <li className="flex items-center justify-between">
            <span className="text-sm text-uju-secondary">NSN</span>
            <div className="flex items-center gap-2">
              {isLoading ? (
                <span className="text-sm text-uju-secondary">-</span>
              ) : isNasunConnected ? (
                <span className="text-sm font-medium text-uju-primary tabular-nums">
                  {summary?.formattedTotalStaked ?? "0.0000"} staked
                  {summary?.formattedTotalRewards && summary.formattedTotalRewards !== "0"
                    ? ` +${summary.formattedTotalRewards}`
                    : ""}
                </span>
              ) : (
                <span className="text-sm text-uju-secondary">Not connected</span>
              )}
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="text-sm text-pado-3 hover:underline"
              >
                Stake
              </button>
            </div>
          </li>

          {/* SUI */}
          <li className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-uju-secondary">SUI</span>
              <NetworkBadge label="Testnet" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-uju-secondary tabular-nums">{SUI_APY_DISPLAY}</span>
              <ExternalLink href={SUI_VALIDATORS_URL}>Open</ExternalLink>
            </div>
          </li>

          {/* ETH */}
          <li className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-uju-secondary">ETH</span>
              <NetworkBadge label="Sepolia" />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-uju-secondary tabular-nums">{ETH_LIDO_APY_DISPLAY}</span>
              <ExternalLink href={LIDO_STAKING_URL}>Open</ExternalLink>
            </div>
          </li>

          {/* SOL */}
          <li className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-uju-secondary">SOL</span>
              <NetworkBadge label="Devnet" />
            </div>
            <ExternalLink href={MARINADE_STAKING_URL}>Open</ExternalLink>
          </li>
        </ul>
      </UjuCard>

      {modalOpen && <StakeModal open={modalOpen} onClose={() => setModalOpen(false)} />}
    </>
  );
}
