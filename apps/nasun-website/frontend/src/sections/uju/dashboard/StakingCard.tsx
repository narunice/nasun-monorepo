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
import { SolConnectModal } from "./staking/sol/SolConnectModal";
import { useSolAddressForIdentity } from "../stores/solAddressStore";

const LIDO_STAKING_URL = "https://stake.lido.fi";
const MARINADE_STAKING_URL = "https://marinade.finance";
const JITO_STAKING_URL = "https://www.jito.network/staking/";
const SANCTUM_STAKING_URL = "https://app.sanctum.so/lsts/bsol";
const SUI_VALIDATORS_URL = "https://suiscan.xyz/testnet/validators";
const SUI_APY_DISPLAY = "~3.5%";

// Plan 1C selector: prefer registered SUI-shape address, fallback to signer if SUI-shape.
const SUI_ADDRESS_RE = /^0x[a-fA-F0-9]{64}$/;
function pickSuiAddress(
  registered: { walletAddress: string; registeredAt: string }[],
  signerAddress: string | null,
): string | null {
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
  apy?: string;
  /** Append a small "address not verified" badge after the symbol. */
  unverified?: boolean;
  trailing: React.ReactNode;
}

function Row({ symbol, network, apy, unverified, trailing }: RowProps) {
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
        {apy && (
          <span className="text-base text-pado-3 tabular-nums hidden sm:inline">
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
      className="text-base font-medium text-pado-3 hover:text-pado-4 transition-colors"
    >
      {label} ↗
    </a>
  );
}

/** Inline horizontal links group for SOL "Manage" CTA. Avoids dropdown dep. */
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
            className="text-sm font-medium text-pado-3 hover:text-pado-4 transition-colors"
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
  const {
    registeredWallets,
    signerAddress,
    hasSigner,
    isRegistering,
    error: registrationError,
    registerCurrentWallet,
  } = useUjuWalletRegistration();

  // SUI selector + read
  const suiAddress = useMemo(
    () => pickSuiAddress(registeredWallets, signerAddress),
    [registeredWallets, signerAddress],
  );
  const { data: suiStakes, isLoading: suiStakesLoading } = useSuiTestnetStakes(suiAddress);

  // ETH read (mainnet, stETH + wstETH)
  const ethAddress = (user?.linkedAccounts?.metamask?.walletAddress ?? undefined) as
    | `0x${string}`
    | undefined;
  const { view: ethLst, isLoading: ethLstLoading, isError: ethLstError } = useEthLst(ethAddress);

  // SOL read (mainnet LSTs)
  const sol = useSolAddressForIdentity(user?.identityId);
  const solAddress = sol?.solAddress ?? null;
  const { data: solLst, isLoading: solLstLoading, isError: solLstError } = useSolLst(solAddress);

  const [modalOpen, setModalOpen] = useState(false);
  const [suiModalOpen, setSuiModalOpen] = useState(false);
  const [solConnectOpen, setSolConnectOpen] = useState(false);

  const isNasunConnected = (status === "unlocked" && !!account) || isZkConnected;

  const suiTotalStaked = (suiStakes ?? []).reduce((acc, s) => acc + s.principal, 0n);
  const suiTotalRewards = (suiStakes ?? []).reduce(
    (acc, s) => acc + (s.estimatedReward ?? 0n),
    0n,
  );

  const handleRegisterSui = async () => {
    try {
      await registerCurrentWallet();
    } catch {
      /* surfaced via registrationError */
    }
  };

  // SUI row trailing
  const suiTrailing = (() => {
    if (!suiAddress) {
      return (
        <UjuButton
          size="sm"
          disabled={!hasSigner || isRegistering}
          onClick={handleRegisterSui}
          title={!hasSigner ? "Sign in first" : undefined}
        >
          {isRegistering ? "…" : "Connect"}
        </UjuButton>
      );
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

  // ETH row trailing (Mainnet, stETH + wstETH read-only)
  const ethTrailing = (() => {
    if (!ethAddress) {
      return <ExternalLink href={LIDO_STAKING_URL} label="Stake on Lido" />;
    }
    if (ethLstLoading) {
      return <span className="text-base text-uju-secondary">…</span>;
    }
    if (ethLstError && !ethLst) {
      return (
        <span className="text-sm text-uju-secondary">
          RPC unavailable
        </span>
      );
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

  // SOL row trailing (Mainnet LST read-only, self-display only)
  const solTrailing = (() => {
    if (!solAddress) {
      return (
        <UjuButton
          size="sm"
          disabled={!user?.identityId}
          onClick={() => setSolConnectOpen(true)}
          title={!user?.identityId ? "Sign in first" : undefined}
        >
          Connect
        </UjuButton>
      );
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
            network="Testnet"
            apy={SUI_APY_DISPLAY}
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

        {registrationError && !suiAddress && (
          <p className="mt-3 text-sm text-rose-400 text-center">{registrationError}</p>
        )}
      </UjuCard>

      {modalOpen && <StakeModal open={modalOpen} onClose={() => setModalOpen(false)} />}
      {suiModalOpen && suiAddress && (
        <SuiStakingPositionsModal
          open={suiModalOpen}
          onClose={() => setSuiModalOpen(false)}
          address={suiAddress}
        />
      )}
      {solConnectOpen && user?.identityId && (
        <SolConnectModal
          open={solConnectOpen}
          onClose={() => setSolConnectOpen(false)}
          identityId={user.identityId}
        />
      )}
    </>
  );
}
