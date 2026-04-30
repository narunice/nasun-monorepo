// Base Staking & Apps Staking card.
//
// Connect/disconnect for external wallets (ETH/SUI/SOL) lives in
// WalletBalanceCard ("Wallet Integration"). This card is read-only display
// of staking positions + deep-links to canonical staking sites. NSN keeps
// its native staking flow.

import { useMemo, useState } from "react";
import { useWallet, useZkLogin, useStaking } from "@nasun/wallet";
import { useAuth } from "@/features/auth";
import { UjuCard, UjuButton, UjuBadge, UjuSectionHeader } from "../shared";
import { StakeModal } from "./staking/StakeModal";
import { SuiStakingPositionsModal } from "./staking/sui/SuiStakingPositionsModal";
import { useSuiTestnetStakes } from "./staking/sui/useSuiTestnetStaking";
import { useUjuWalletRegistration } from "../hooks/useUjuWalletRegistration";
import { useEthLst } from "./staking/eth/useEthLst";
import { useSolLst } from "./staking/sol/useSolLst";
import { useSolAddressForIdentity } from "../stores/solAddressStore";
import { useSuiExternalAddress } from "../stores/suiAddressStore";

// SUI address resolution for read-only display:
//   1. External typed address (suiAddressStore — set in WalletBalanceCard)
//   2. Server-registered SUI-shape address (useUjuWalletRegistration)
//   3. Active signer (zkLogin/mnemonic keypair → nasun-derived Sui address)
const SUI_ADDRESS_RE = /^0x[a-fA-F0-9]{64}$/;
function pickSuiAddress(
  external: string | null,
  registered: { walletAddress: string; registeredAt: string }[],
  signerAddress: string | null,
): string | null {
  if (external) return external;
  const suiRegistered = registered
    .filter((w) => SUI_ADDRESS_RE.test(w.walletAddress))
    .sort((a, b) => a.registeredAt.localeCompare(b.registeredAt));
  if (suiRegistered[0]) return suiRegistered[0].walletAddress;
  if (signerAddress && SUI_ADDRESS_RE.test(signerAddress)) return signerAddress;
  return null;
}

interface RowProps {
  symbol: string;
  network?: string;
  /** Append a small "address not verified" badge after the symbol. */
  unverified?: boolean;
  trailing: React.ReactNode;
}

function Row({ symbol, network, unverified, trailing }: RowProps) {
  return (
    <li className="flex items-center justify-between gap-3 py-3 border-b border-uju-border/50 last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-base font-semibold text-uju-primary">{symbol}</span>
        {network && <UjuBadge tone="violet">{network}</UjuBadge>}
        {unverified && (
          <span
            className="text-xs text-uju-secondary border border-uju-border rounded-full px-2 py-0.5"
            title="Address ownership not verified"
          >
            unverified
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">{trailing}</div>
    </li>
  );
}

function ComingSoonTag() {
  return (
    <span className="text-sm text-uju-secondary border border-uju-border rounded-full px-2 py-0.5 uppercase tracking-widest">
      Coming Soon
    </span>
  );
}

export function StakingCard() {
  const { user } = useAuth();
  const { status, account } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const { summary, isLoading } = useStaking();
  const { registeredWallets, signerAddress } = useUjuWalletRegistration();

  // SUI/ETH/SOL staking surfaces are temporarily Coming Soon; we keep the
  // hooks live so the data is warmed for when we re-enable the rows.
  const suiExternal = useSuiExternalAddress(user?.identityId);
  const suiAddress = useMemo(
    () => pickSuiAddress(suiExternal, registeredWallets, signerAddress),
    [suiExternal, registeredWallets, signerAddress],
  );
  void useSuiTestnetStakes(suiAddress);

  const ethAddress = (user?.linkedAccounts?.metamask?.walletAddress ?? undefined) as
    | `0x${string}`
    | undefined;
  void useEthLst(ethAddress);

  const sol = useSolAddressForIdentity(user?.identityId);
  const solAddress = sol?.solAddress ?? null;
  void useSolLst(solAddress);

  const [modalOpen, setModalOpen] = useState(false);
  const [suiModalOpen, setSuiModalOpen] = useState(false);

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
      <UjuButton size="sm" onClick={() => setModalOpen(true)}>
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
      {suiModalOpen && suiAddress && (
        <SuiStakingPositionsModal
          open={suiModalOpen}
          onClose={() => setSuiModalOpen(false)}
          address={suiAddress}
        />
      )}
    </>
  );
}
