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
import { formatSui } from "./staking/sui/suiTestnet";
import { useUjuWalletRegistration } from "../hooks/useUjuWalletRegistration";
import { useEthLst, formatEthLstTotal } from "./staking/eth/useEthLst";
import { useSolLst } from "./staking/sol/useSolLst";
import { useSolAddressForIdentity } from "../stores/solAddressStore";
import { useSuiExternalAddress } from "../stores/suiAddressStore";

const LIDO_STAKING_URL = "https://stake.lido.fi";
const MARINADE_STAKING_URL = "https://marinade.finance";
const JITO_STAKING_URL = "https://www.jito.network/staking/";
const SANCTUM_STAKING_URL = "https://app.sanctum.so/lsts/bsol";
const SUI_VALIDATORS_URL = "https://suiscan.xyz/mainnet/validators";

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

function ExternalLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-base font-medium text-pado-2 hover:text-pado-4 transition-colors"
    >
      {label} ↗
    </a>
  );
}

/** Inline horizontal links group. Avoids dropdown dep. */
function ManageLinks({
  links,
}: {
  links: Array<{ label: string; href: string }>;
}) {
  return (
    <span className="flex items-center gap-2 flex-wrap justify-end">
      {links.map((l, i) => (
        <span key={l.href} className="flex items-center gap-2">
          {i > 0 && <span className="text-uju-secondary">·</span>}
          <a
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-pado-2 hover:text-pado-4 transition-colors"
          >
            {l.label} ↗
          </a>
        </span>
      ))}
    </span>
  );
}

export function StakingCard() {
  const { user } = useAuth();
  const { status, account } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const { summary, isLoading } = useStaking();
  const { registeredWallets, signerAddress } = useUjuWalletRegistration();

  // SUI: external typed > registered > signer-derived
  const suiExternal = useSuiExternalAddress(user?.identityId);
  const suiAddress = useMemo(
    () => pickSuiAddress(suiExternal, registeredWallets, signerAddress),
    [suiExternal, registeredWallets, signerAddress],
  );
  const isSuiUnverified = !!suiExternal; // typed entry has no proof-of-ownership
  const { data: suiStakes, isLoading: suiStakesLoading } = useSuiTestnetStakes(suiAddress);

  // ETH: read from linkedAccounts (proof-of-ownership via my-account flow)
  const ethAddress = (user?.linkedAccounts?.metamask?.walletAddress ?? undefined) as
    | `0x${string}`
    | undefined;
  const { view: ethLst, isLoading: ethLstLoading, isError: ethLstError } = useEthLst(ethAddress);

  // SOL: read from solAddressStore (set in WalletBalanceCard)
  const sol = useSolAddressForIdentity(user?.identityId);
  const solAddress = sol?.solAddress ?? null;
  const { data: solLst, isLoading: solLstLoading, isError: solLstError } = useSolLst(solAddress);

  const [modalOpen, setModalOpen] = useState(false);
  const [suiModalOpen, setSuiModalOpen] = useState(false);

  const isNasunConnected = (status === "unlocked" && !!account) || isZkConnected;

  const suiTotalStaked = (suiStakes ?? []).reduce((acc, s) => acc + s.principal, 0n);
  const suiTotalRewards = (suiStakes ?? []).reduce(
    (acc, s) => acc + (s.estimatedReward ?? 0n),
    0n,
  );

  // SUI row: read-only. Connect/disconnect happens in Wallet Integration.
  const suiTrailing = (() => {
    if (!suiAddress) {
      return <ExternalLink href={SUI_VALIDATORS_URL} label="Stake on Sui" />;
    }
    if (suiStakesLoading) {
      return <span className="text-base text-uju-secondary">…</span>;
    }
    if (suiTotalStaked > 0n) {
      return (
        <>
          <span className="text-base text-uju-primary tabular-nums">
            {formatSui(suiTotalStaked)}
            {suiTotalRewards > 0n ? ` +${formatSui(suiTotalRewards)}` : ""}
          </span>
          <UjuButton size="sm" onClick={() => setSuiModalOpen(true)}>
            View
          </UjuButton>
        </>
      );
    }
    return <ExternalLink href={SUI_VALIDATORS_URL} label="Stake on Sui" />;
  })();

  // ETH row: read-only stETH + wstETH summary (display only).
  const ethTrailing = (() => {
    if (!ethAddress) {
      return <ExternalLink href={LIDO_STAKING_URL} label="Stake on Lido" />;
    }
    if (ethLstLoading) {
      return <span className="text-base text-uju-secondary">…</span>;
    }
    if (ethLstError && !ethLst) {
      return <span className="text-sm text-uju-secondary">RPC unavailable</span>;
    }
    if (ethLst && ethLst.totalSteth > 0n) {
      return (
        <>
          <span
            className="text-base text-uju-primary tabular-nums"
            title={`stETH ${ethLst.stethBal} · wstETH ${ethLst.wstethBal} (= ${ethLst.stethFromWsteth} stETH)`}
          >
            {formatEthLstTotal(ethLst.totalSteth)}
          </span>
          <ExternalLink href={LIDO_STAKING_URL} label="Manage" />
        </>
      );
    }
    return <ExternalLink href={LIDO_STAKING_URL} label="Stake on Lido" />;
  })();

  // SOL row: read-only LST balances (mSOL/jitoSOL/bSOL).
  const solTrailing = (() => {
    if (!solAddress) {
      return <ExternalLink href={MARINADE_STAKING_URL} label="Stake on Marinade" />;
    }
    if (solLstLoading) {
      return <span className="text-base text-uju-secondary">…</span>;
    }
    if (solLstError && !solLst) {
      return <span className="text-sm text-uju-secondary">RPC unavailable</span>;
    }
    const nonZero = (solLst ?? []).filter((l) => l.uiAmount > 0);
    if (nonZero.length === 0) {
      return <ExternalLink href={MARINADE_STAKING_URL} label="Stake on Marinade" />;
    }
    return (
      <>
        <span className="text-base text-uju-primary tabular-nums">
          {nonZero
            .map((l) => `${l.uiAmount.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")} ${l.symbol}`)
            .join(" · ")}
        </span>
        <ManageLinks
          links={[
            { label: "Marinade", href: MARINADE_STAKING_URL },
            { label: "Jito", href: JITO_STAKING_URL },
            { label: "Sanctum", href: SANCTUM_STAKING_URL },
          ]}
        />
      </>
    );
  })();

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
          <Row
            symbol="SUI"
            network="Mainnet"
            unverified={isSuiUnverified}
            trailing={suiTrailing}
          />
          <Row
            symbol="ETH"
            network="Mainnet"
            trailing={ethTrailing}
          />
          <Row
            symbol="SOL"
            network="Mainnet"
            unverified={!!solAddress}
            trailing={solTrailing}
          />
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
