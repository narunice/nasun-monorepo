import { FC, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { useAuth } from "@/features/auth";
import { useWalletAuth } from "@/features/wallet/hooks/useWalletAuth";
import type { LinkPasteChain } from "@/services/userProfileApi";
import { useLinkedAddresses } from "../hooks/useLinkedAddresses";
import {
  useSuiAddressStore,
  useSuiExternalAddress,
} from "../../stores/suiAddressStore";
import {
  useSolAddressStore,
  useSolAddressForIdentity,
} from "../../stores/solAddressStore";
import { useUjuAccountLinking } from "../../hooks/useUjuAccountLinking";
import { UjuButton } from "../../shared";
import { LinkPasteAddressModal } from "./LinkPasteAddressModal";

type AddressSource = "paste" | "nasun-wallet" | "legacy";

interface ChainConfig {
  chain: LinkPasteChain;
  label: string;
  symbol: string;
  iconBg: string;
  iconText: string;
}

// SUI is paste-linked (display-only address). Ethereum and Solana are
// rendered separately (EthereumVerifiedRow + the verified Solana section
// inside AdditionalWalletsCard) -- both require an ownership signature.
// The Solana paste flow was retired from this surface on 2026-05-17 once
// the auth-solana-additional Lambda landed; legacy `linkedSolanaAddress`
// values keep rendering in WalletBalanceCard but cannot be added here.
const CHAINS: ChainConfig[] = [
  {
    chain: "sui",
    label: "SUI",
    symbol: "S",
    iconBg: "bg-pado-2/15",
    iconText: "text-pado-2",
  },
];

const SOURCE_LABEL: Record<Exclude<AddressSource, "paste">, string> = {
  "nasun-wallet": "via Nasun wallet",
  legacy: "via wallet adapter",
};

function shorten(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/**
 * Profile-page section listing the user's external chain wallet addresses
 * (SUI / Solana). Ethereum is intentionally excluded — see CHAINS comment.
 * Sources reflect the dashboard Wallet Integration card so the two surfaces
 * stay in sync:
 *   - paste-linked address (`linkedSuiAddress`/`linkedSolanaAddress`)
 *   - Nasun-derived address for SUI (since Nasun is a Sui fork)
 *   - legacy localStorage adapter address as last-resort fallback
 *
 * Display-only — uju does not initiate transactions on these networks.
 */
export const ExternalChainSection: FC = () => {
  const { addresses, link, unlink, pendingChain, isAuthenticated } =
    useLinkedAddresses();
  const { user: authUser } = useAuth();
  const { account } = useWallet();
  const { state: zkState } = useZkLogin();
  const identityId = authUser?.identityId;

  // Hydrate legacy stores so SUI/SOL fallbacks become visible on first mount.
  const hydrateSui = useSuiAddressStore((s) => s.hydrateFromStorage);
  const hydrateSol = useSolAddressStore((s) => s.hydrateFromStorage);
  // Setters for legacy localStorage stores — used by Remove for legacy source.
  const setSuiExternal = useSuiAddressStore((s) => s.setExternal);
  const setSolForIdentity = useSolAddressStore((s) => s.setForIdentity);
  useEffect(() => {
    if (identityId) {
      hydrateSui(identityId);
      hydrateSol(identityId);
    }
  }, [identityId, hydrateSui, hydrateSol]);

  const legacySui = useSuiExternalAddress(identityId);
  const sol = useSolAddressForIdentity(identityId);
  const legacySol = sol?.solAddress ?? null;
  const nasunDerivedSui = account?.address ?? zkState?.address ?? null;

  const [modalChain, setModalChain] = useState<LinkPasteChain | null>(null);

  if (!isAuthenticated) return null;

  // Per-source removal. Each source has a different backing store, so the
  // Remove button needs source-specific cleanup:
  //   paste        → backend PATCH unlink (existing useLinkedAddresses)
  //   legacy       → clear the localStorage Zustand store
  //   nasun-wallet → out of scope (the address IS the user's identity)
  function removeBySource(chain: LinkPasteChain, source: AddressSource) {
    if (source === "paste") {
      void unlink(chain);
      return;
    }
    if (source === "legacy") {
      if (!identityId) return;
      if (chain === "sui") {
        setSuiExternal(identityId, null);
        toast.info("SUI address removed");
      } else if (chain === "solana") {
        setSolForIdentity(identityId, null, null);
        toast.info("Solana address removed");
      }
      return;
    }
    if (source === "nasun-wallet") {
      toast.info(
        "This SUI address is derived from your Nasun wallet itself and can't be unlinked here.",
      );
      return;
    }
  }

  // Resolve the effective address + source for each chain. Order matches
  // WalletBalanceCard so the two surfaces never disagree about which address
  // is "the one" for a given chain.
  function resolve(chain: LinkPasteChain): {
    addr: string | null;
    source: AddressSource | null;
  } {
    if (chain === "sui") {
      if (addresses.sui) return { addr: addresses.sui, source: "paste" };
      if (legacySui) return { addr: legacySui, source: "legacy" };
      if (nasunDerivedSui)
        return { addr: nasunDerivedSui, source: "nasun-wallet" };
      return { addr: null, source: null };
    }
    // solana (ethereum intentionally not surfaced here — see CHAINS comment)
    if (addresses.solana) return { addr: addresses.solana, source: "paste" };
    if (legacySol) return { addr: legacySol, source: "legacy" };
    return { addr: null, source: null };
  }

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold text-uju-secondary uppercase tracking-[0.2em] mt-2">
        External Chain Addresses
      </div>
      <p className="text-sm text-uju-secondary leading-relaxed">
        Display-only. Nasun shows balances but never initiates transactions on
        these networks.
      </p>

      <ul className="space-y-2">
        <EthereumVerifiedRow />
        {CHAINS.map((c) => {
          const { addr, source } = resolve(c.chain);
          const isPending = pendingChain === c.chain;
          return (
            <li
              key={c.chain}
              className="flex items-center justify-between gap-3 p-3 bg-uju-bg/40 rounded-xl border border-uju-border/60"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${c.iconBg} ${c.iconText}`}
                  aria-hidden="true"
                >
                  {c.symbol}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-base font-medium text-uju-primary">
                      {c.label}
                    </p>
                    {addr && source && source !== "paste" && (
                      <span className="text-xs text-uju-secondary px-1.5 py-0.5 rounded-md bg-uju-card/60 border border-uju-border/30">
                        {SOURCE_LABEL[source]}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-uju-secondary font-mono truncate">
                    {addr ? shorten(addr) : "Not linked"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {addr ? (
                  <>
                    {/* Replace works for both paste-linked and fallback
                        sources — fallback addresses are read-only at the
                        source (verified MetaMask / Nasun wallet) but the
                        user can still override with a paste-link. */}
                    <UjuButton
                      variant="ghost"
                      size="xs"
                      onClick={() => setModalChain(c.chain)}
                      disabled={isPending}
                    >
                      Replace
                    </UjuButton>
                    {/* Remove is offered for every source. paste/legacy
                        actually unlink; verified-metamask and nasun-wallet
                        surfaces a toast pointing to the right place since
                        those sources can't be cleared from here. */}
                    {source && (
                      // Soft-red treatment matches the Unlink/Disconnect
                      // buttons in the Connected Wallets section above so
                      // destructive actions read as quiet rather than alarming.
                      <UjuButton
                        variant="secondary"
                        size="xs"
                        className="text-red-400 border-red-500/20 hover:border-red-500/40 !shadow-none hover:!shadow-none"
                        onClick={() => removeBySource(c.chain, source)}
                        disabled={isPending}
                        title={
                          source === "nasun-wallet"
                            ? "Tied to your Nasun wallet"
                            : undefined
                        }
                      >
                        Remove
                      </UjuButton>
                    )}
                  </>
                ) : (
                  <UjuButton
                    variant="primary"
                    size="xs"
                    onClick={() => setModalChain(c.chain)}
                    disabled={isPending}
                  >
                    Add address
                  </UjuButton>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <LinkPasteAddressModal
        isOpen={!!modalChain}
        chain={modalChain}
        initialValue={modalChain ? (resolve(modalChain).addr ?? "") : ""}
        isPending={pendingChain === modalChain}
        onClose={() => setModalChain(null)}
        onSubmit={link}
      />
    </div>
  );
};

/**
 * Ethereum row inside External Chain Addresses. Unlike SUI/Solana, EVM
 * addresses require a signed challenge — the paste flow was deprecated
 * 2026-05-16 (ownership-proof bypass). Link triggers RainbowKit's connect
 * modal via `useWalletAuth({ mode: 'link' })`, which:
 *   1. Connects an EVM wallet (MetaMask / Rainbow / Trust / WalletConnect)
 *   2. Fetches a challenge from the server
 *   3. Signs it, verifies on the server, and writes linkedAccounts.metamask
 *
 * The displayed address is `linkedAccounts.metamask.walletAddress`, but only
 * when manualEntry !== true — legacy paste-linked records still carry that
 * flag and must not be treated as verified.
 */
const EthereumVerifiedRow: FC = () => {
  const { user } = useAuth();
  const linking = useUjuAccountLinking({ user });
  const wallet = useWalletAuth({
    mode: "link",
    onSuccess: () => toast.success("EVM wallet linked."),
    onError: (e) => toast.error(e.message || "Failed to link wallet."),
  });

  const meta = user?.linkedAccounts?.metamask;
  const isVerified = !!meta?.walletAddress && meta.manualEntry !== true;
  const addr = isVerified ? meta!.walletAddress! : null;
  const isMetaMaskPrimary = user?.provider === "MetaMask";

  return (
    <li className="flex items-center justify-between gap-3 p-3 bg-uju-bg/40 rounded-xl border border-uju-border/60">
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="w-9 h-9 rounded-xl flex items-center justify-center font-bold bg-pado-1/20 text-pado-3"
          aria-hidden="true"
        >
          E
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-base font-medium text-uju-primary">Ethereum</p>
            {addr && (
              <span className="text-xs text-uju-secondary px-1.5 py-0.5 rounded-md bg-uju-card/60 border border-uju-border/30">
                verified
              </span>
            )}
          </div>
          <p className="text-sm text-uju-secondary font-mono truncate">
            {addr ? shorten(addr) : "Not linked"}
          </p>
          {wallet.error && (
            <p className="text-sm text-red-400 mt-1">{wallet.error}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {addr ? (
          !isMetaMaskPrimary && (
            <UjuButton
              variant="secondary"
              size="xs"
              className="text-red-400 border-red-500/20 hover:border-red-500/40 !shadow-none hover:!shadow-none"
              onClick={() => linking.unlinkAccount("metamask")}
              disabled={linking.isLinking}
            >
              Unlink
            </UjuButton>
          )
        ) : (
          <UjuButton
            variant="primary"
            size="xs"
            onClick={wallet.connect}
            disabled={wallet.isAuthenticating}
          >
            {wallet.isAuthenticating ? "Linking..." : "Link"}
          </UjuButton>
        )}
      </div>
    </li>
  );
};
