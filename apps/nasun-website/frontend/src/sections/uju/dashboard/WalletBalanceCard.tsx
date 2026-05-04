import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  useWallet,
  useZkLogin,
  useBalance as useNasunBalance,
  getMoveClient,
  isValidAddress,
} from "@nasun/wallet";
import { WalletConnect } from "@nasun/wallet-ui";
import { useBalance as useEthBalance } from "wagmi";
// Per-row "Open" buttons are commented out below. To re-enable, restore:
//   import { useConnectModal, useAccountModal } from "@rainbow-me/rainbowkit";
//   import { useSolanaWalletAdapter } from "./useSolanaWalletAdapter";
//   import { useSuiWalletAdapter } from "./useSuiWalletAdapter";
//   import { OpenChainWalletButton } from "./OpenChainWalletButton";
import { ACTIVE_EVM_CHAIN, IS_EVM_TESTNET } from "@/config/evmChain";
import { useAuth } from "@/features/auth";
import { SOL_ADDRESS_RE } from "@/lib/solana";
import { solReadCall } from "@/lib/solana-readonly";
import { UjuCard, UjuBadge, UjuButton, UjuSectionHeader } from "../shared";
import { goToProfileConnectedAccounts } from "../shared/ujuNavigation";
import { useMyProfile } from "@/features/profile/useMyProfile";
import { useLinkedAddresses } from "../profile/hooks/useLinkedAddresses";
import {
  useSolAddressForIdentity,
  useSolAddressStore,
} from "../stores/solAddressStore";
import {
  useSuiAddressStore,
  useSuiExternalAddress,
} from "../stores/suiAddressStore";
import { linkPasteAddress } from "@/services/userProfileApi";

// Plan v5+: read-only mainnet for all external chains.
const SUI_MAINNET_RPC = "https://fullnode.mainnet.sui.io:443";

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function NetworkBadge({ label }: { label: string }) {
  return <UjuBadge tone="violet">{label}</UjuBadge>;
}

// Public mainnet RPCs (Sui Foundation, Solana Foundation) are shared
// rate-limited and occasionally drop requests. retry up to 3 with the
// react-query default exponential backoff (1s, 2s, 4s) so a transient blip
// resolves silently instead of surfacing as an "RPC error" in the UI.
// keepPreviousData lets us show the last good balance during a refetch
// instead of flashing "-" or an error state.
const MAINNET_BALANCE_RETRY = 3;

function useSuiMainnetBalance(address: string | undefined | null) {
  return useQuery({
    queryKey: ["balance", "sui-mainnet", address],
    queryFn: async () => {
      if (!address || !isValidAddress(address))
        throw new Error("Invalid SUI address");
      const client = getMoveClient(SUI_MAINNET_RPC, "sui-mainnet");
      const { totalBalance } = await client.getBalance({ owner: address });
      const mist = BigInt(totalBalance);
      const sui = mist / 1_000_000_000n;
      const rem = mist % 1_000_000_000n;
      const dec = rem.toString().padStart(9, "0").slice(0, 4);
      return `${sui}.${dec}`;
    },
    enabled: !!address,
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: MAINNET_BALANCE_RETRY,
    placeholderData: keepPreviousData,
  });
}

function useSolMainnetBalance(address: string | null) {
  return useQuery({
    queryKey: ["balance", "sol-mainnet", address],
    queryFn: async () => {
      if (!address || !SOL_ADDRESS_RE.test(address))
        throw new Error("Invalid Solana address");
      const result = await solReadCall<{ value: number }>("getBalance", [
        address,
        { commitment: "confirmed" },
      ]);
      if (typeof result?.value !== "number") {
        throw new Error("SOL RPC: unexpected response");
      }
      return (result.value / 1e9).toFixed(4);
    },
    enabled: !!address,
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: MAINNET_BALANCE_RETRY,
    placeholderData: keepPreviousData,
  });
}

/**
 * One-shot migration: any pre-existing localStorage SUI/SOL address that
 * isn't yet stored on the backend is silently linked via the PATCH endpoint.
 * Failures are swallowed — the UI still renders from localStorage.
 */
function useMigrateLegacyLocalStorageAddresses(args: {
  identityId: string | undefined;
  cognitoToken: string | undefined;
  serverSui: string | null | undefined;
  serverSolana: string | null | undefined;
  legacySuiExternal: string | undefined;
  legacySol: string | null;
}) {
  const {
    identityId,
    cognitoToken,
    serverSui,
    serverSolana,
    legacySuiExternal,
    legacySol,
  } = args;

  useEffect(() => {
    if (!identityId || !cognitoToken) return;
    if (legacySuiExternal && !serverSui) {
      linkPasteAddress(cognitoToken, "sui", legacySuiExternal).catch(() => {});
    }
    if (legacySol && !serverSolana) {
      linkPasteAddress(cognitoToken, "solana", legacySol).catch(() => {});
    }
    // Run once per identity. Subsequent renders no-op because server fields
    // will be populated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identityId, cognitoToken]);
}

export function WalletBalanceCard() {
  const { user } = useAuth();
  const { status, account } = useWallet();
  const { isConnected: isZkConnected, state: zkState } = useZkLogin();
  const { data: nasunBalance } = useNasunBalance();
  const { data: serverProfile } = useMyProfile();
  const { addresses: linked } = useLinkedAddresses();
  const [, setSearchParams] = useSearchParams();

  const identityId = user?.identityId ?? undefined;

  // ETH: prefer verified MetaMask flow, fall back to paste-linked address.
  const verifiedEthAddress = user?.linkedAccounts?.metamask?.walletAddress;
  const pastedEthAddress = linked.ethereum ?? null;
  const ethAddress = (verifiedEthAddress ?? pastedEthAddress ?? undefined) as
    | `0x${string}`
    | undefined;
  const ethVerified = !!verifiedEthAddress;
  const { data: ethBalance } = useEthBalance({
    address: ethAddress,
    chainId: ACTIVE_EVM_CHAIN.id,
  });

  // SUI: backend `linkedSuiAddress` > legacy localStorage external > Nasun-derived.
  const legacySuiExternal = useSuiExternalAddress(identityId);
  const suiNasunDerived = account?.address ?? zkState?.address;
  const suiDisplayAddress =
    linked.sui ?? legacySuiExternal ?? suiNasunDerived ?? null;
  const isExternalSui = !!(linked.sui || legacySuiExternal);
  const hydrateSuiStorage = useSuiAddressStore((s) => s.hydrateFromStorage);
  const {
    data: suiBalance,
    isPending: suiPending,
    isError: suiError,
  } = useSuiMainnetBalance(suiDisplayAddress);

  // SOL: backend `linkedSolanaAddress` > legacy localStorage adapter address.
  const sol = useSolAddressForIdentity(identityId);
  const hydrateFromStorage = useSolAddressStore((s) => s.hydrateFromStorage);
  const legacySolAddress = sol?.solAddress ?? null;
  const solAddress = linked.solana ?? legacySolAddress;
  const {
    data: solBalance,
    isPending: solPending,
    isError: solFetchError,
  } = useSolMainnetBalance(solAddress);

  // Hydrate legacy stores on identity change (still needed during migration).
  useEffect(() => {
    if (identityId) {
      hydrateFromStorage(identityId);
      hydrateSuiStorage(identityId);
    }
  }, [identityId, hydrateFromStorage, hydrateSuiStorage]);

  useMigrateLegacyLocalStorageAddresses({
    identityId,
    cognitoToken: user?.cognitoToken,
    serverSui: serverProfile?.linkedSuiAddress,
    serverSolana: serverProfile?.linkedSolanaAddress,
    legacySuiExternal: legacySuiExternal ?? undefined,
    legacySol: legacySolAddress,
  });

  const isNasunConnected =
    (status === "unlocked" && !!account) || isZkConnected;

  // External-chain wallet opener wiring removed alongside the commented-out
  // per-row "Open" JSX below. To re-enable: restore the imports
  // (useConnectModal/useAccountModal from @rainbow-me/rainbowkit,
  // useSolanaWalletAdapter, useSuiWalletAdapter, OpenChainWalletButton) plus
  // the corresponding hook calls and `onOpenEth`/`sol2`/`sui2` bindings.

  // NSN wallet drawer is launched from the NSN row's "Open" button. The
  // shared @nasun/wallet-ui WalletConnect component supports `embedded` mode,
  // which renders just the wallet UI body; we wrap it in our own portal-
  // backed modal so the panel always centers on the viewport instead of
  // dropping below the trigger and getting clipped by the next dashboard
  // section.
  const [nasunModalOpen, setNasunModalOpen] = useState(false);

  useEffect(() => {
    if (!nasunModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNasunModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [nasunModalOpen]);

  const goManage = () => goToProfileConnectedAccounts(setSearchParams);

  // Plain "Not connected" text — the section-level Manage CTA below the list
  // is the single linking entry point, so per-row prompts would be redundant.
  const notConnectedHint = (
    <span className="text-base text-uju-secondary">Not connected</span>
  );

  return (
    <UjuCard>
      <UjuSectionHeader
        accent
        title="Wallet Integration"
        subtitle="Connected addresses across networks"
      />

      <ul className="space-y-3">
        {/* NSN — Nasun-native. Click "Open" to launch the wallet UI in a
            centered modal (so it doesn't get clipped by the cards below). */}
        <li className="flex items-center justify-between gap-2">
          <span className="text-base text-uju-secondary">NSN</span>
          <div className="flex items-center gap-2 shrink-0">
            {isNasunConnected ? (
              <span className="text-base font-light text-uju-primary tabular-nums">
                {nasunBalance?.formattedBalance ?? "0"} NSN
              </span>
            ) : (
              <span className="text-base text-uju-secondary">Not connected</span>
            )}
            {/* Open buttons hidden per UX direction — keep wired so re-enabling
                is a comment toggle, not a re-implementation. */}
            {/* <UjuButton
              variant="ghost"
              size="xs"
              onClick={() => setNasunModalOpen(true)}
            >
              Open
            </UjuButton> */}
          </div>
        </li>

        {/* SUI */}
        <li>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base text-uju-secondary">SUI</span>
              <NetworkBadge label="Testnet" />
              {isExternalSui && (
                <UjuBadge tone="amber" className="uppercase tracking-wide">
                  <span title="Address ownership not verified">unverified</span>
                </UjuBadge>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {suiDisplayAddress ? (
                <span className="text-base font-light text-uju-primary tabular-nums">
                  {suiPending ? (
                    "-"
                  ) : suiError ? (
                    <span
                      className="text-uju-secondary"
                      title="Mainnet balance is temporarily unavailable. The public RPC may be rate-limited; we'll retry shortly."
                    >
                      Unavailable
                    </span>
                  ) : (
                    `${suiBalance} SUI`
                  )}
                </span>
              ) : (
                notConnectedHint
              )}
              {/* <OpenChainWalletButton
                chainLabel="Sui"
                installed={sui2.installed}
                connectedAddress={
                  sui2.installed.length > 0 ? suiDisplayAddress : null
                }
                onConnect={(name) => sui2.connect(name)}
                onDisconnect={() => sui2.disconnect()}
                isConnecting={sui2.isConnecting}
                installSuggestions={[
                  { name: "Slush", url: "https://slush.app/" },
                  { name: "Suiet", url: "https://suiet.app/" },
                  { name: "Sui Wallet", url: "https://suiwallet.com/" },
                ]}
              /> */}
            </div>
          </div>
        </li>

        {/* ETH */}
        <li>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base text-uju-secondary">ETH</span>
              <NetworkBadge label={IS_EVM_TESTNET ? "Testnet" : "Mainnet"} />
              {ethAddress && !ethVerified && (
                <UjuBadge tone="amber" className="uppercase tracking-wide">
                  <span title="Address ownership not verified">unverified</span>
                </UjuBadge>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {ethAddress ? (
                <span className="text-base font-light text-uju-primary tabular-nums">
                  {ethBalance
                    ? (() => {
                        const dec = BigInt(ethBalance.decimals);
                        const divisor = 10n ** dec;
                        const whole = ethBalance.value / divisor;
                        const rem = ethBalance.value % divisor;
                        const remStr = rem
                          .toString()
                          .padStart(ethBalance.decimals, "0")
                          .slice(0, 4);
                        return `${whole}.${remStr} ETH`;
                      })()
                    : shortenAddress(ethAddress)}
                </span>
              ) : (
                notConnectedHint
              )}
              {/* <UjuButton
                variant="ghost"
                size="xs"
                onClick={onOpenEth}
                disabled={!openConnectModal && !openAccountModal}
              >
                Open
              </UjuButton> */}
            </div>
          </div>
        </li>

        {/* SOL */}
        <li>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base text-uju-secondary">SOL</span>
              <NetworkBadge label="Testnet" />
              {solAddress && (
                <UjuBadge tone="amber" className="uppercase tracking-wide">
                  <span title="Address ownership not verified">unverified</span>
                </UjuBadge>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {solAddress ? (
                <span className="text-base font-light text-uju-primary tabular-nums">
                  {solPending ? (
                    "-"
                  ) : solFetchError ? (
                    <span
                      className="text-uju-secondary"
                      title="Mainnet balance is temporarily unavailable. The public RPC may be rate-limited; we'll retry shortly."
                    >
                      Unavailable
                    </span>
                  ) : (
                    `${solBalance} SOL`
                  )}
                </span>
              ) : (
                notConnectedHint
              )}
              {/* <OpenChainWalletButton
                chainLabel="Solana"
                installed={sol2.installed}
                connectedAddress={
                  sol2.installed.length > 0 ? solAddress : null
                }
                onConnect={(name) =>
                  sol2.connect(name as "phantom" | "solflare")
                }
                onDisconnect={async () => {
                  for (const name of sol2.installed) {
                    await sol2.disconnect(name);
                  }
                }}
                isConnecting={sol2.isConnecting}
                installSuggestions={[
                  { name: "Phantom", url: "https://phantom.app/download" },
                  { name: "Solflare", url: "https://solflare.com/" },
                ]}
              /> */}
            </div>
          </div>
        </li>
      </ul>

      {/* Manage CTA — wallet linking is owned by the Profile page now. */}
      <div className="mt-5 pt-4 border-t border-uju-border/30 flex justify-center">
        <UjuButton
          variant="secondary"
          size="sm"
          onClick={goManage}
          trailingIcon={<span aria-hidden="true">→</span>}
        >
          Manage in Connected Wallets
        </UjuButton>
      </div>

      {/* Nasun wallet centered modal. Renders into document.body so it
          escapes any ancestor stacking contexts that would otherwise let
          subsequent dashboard sections overlap the panel. */}
      {nasunModalOpen &&
        createPortal(
          <>
            <div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99998]"
              onClick={() => setNasunModalOpen(false)}
              aria-hidden="true"
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Nasun Wallet"
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[99999] w-[calc(100%-2rem)] max-w-md max-h-[calc(100vh-4rem)] overflow-hidden rounded-2xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <WalletConnect
                embedded
                defaultOpen
                onDropdownClose={() => setNasunModalOpen(false)}
              />
            </div>
          </>,
          document.body,
        )}
    </UjuCard>
  );
}
