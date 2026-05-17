/**
 * UjuConnectedWalletsCard
 *
 * Unified "Connected Wallets" card for the uju Profile tab. Replaces the
 * old split between UjuConnectedAccountsCard's wallet block and the
 * standalone AdditionalWalletsCard. Subsections, in order:
 *
 *   1. Nasun     — primary + additional registered Nasun wallets
 *   2. Ethereum  — verified primary (signature) + extras (with labels)
 *   3. Solana    — verified primary + extras (Phantom / Solflare)
 *   4. SUI       — paste-linked display-only address
 *
 * Mobile-first: wallet rows stack actions on small screens, full address
 * is line-wrapped, and all touch targets meet 36–40px minimum.
 */

import { FC, useCallback, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "react-toastify";
import { useAuth } from "@/features/auth";
import { useWalletAuth } from "@/features/wallet/hooks/useWalletAuth";

import { UjuCard, UjuSectionHeader, UjuButton } from "../../shared";
import { UjuNasunWalletSection } from "../internal/UjuNasunWalletSection";
import { useUjuAccountLinking } from "../../hooks/useUjuAccountLinking";
import { useVerifiedEvmAddresses } from "../../dashboard/positions/useValidEvmAddressForApp";
import {
  useVerifiedSuiAddresses,
  type VerifiedSuiAddressEntry,
} from "../../dashboard/positions/useValidSuiAddress";
import { useAddVerifiedSuiAddress } from "../../dashboard/positions/useAddVerifiedSuiAddress";
import {
  AdditionalSuiApiError,
  removeAdditionalSuiAddress,
} from "@/services/additionalSuiApi";
import { refreshAndSaveUserProfile } from "@/features/auth/services/userProfileService";
import { useUserStore } from "@/store/userStore";
import { AdditionalWalletsCard } from "@/sections/myAccount/AdditionalWalletsCard";

interface UjuConnectedWalletsCardProps {
  className?: string;
}

function shorten(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

const SubsectionTitle: FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-uju-secondary mb-3">
    {children}
  </h3>
);

const DevnetNoticeInline: FC = () => {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="shrink-0 text-sm flex flex-col items-end">
      <button
        type="button"
        className="flex items-center gap-1.5 text-uju-secondary hover:text-pado-2 transition-colors font-normal uppercase tracking-widest"
        onClick={() => setExpanded((v) => !v)}
      >
        <svg
          className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M9 5l7 7-7 7"
          />
        </svg>
        Devnet notice
      </button>
      {expanded && (
        <ul className="mt-3 space-y-2 text-uju-secondary leading-relaxed font-light text-left inline-block">
          <li className="flex gap-2">
            <span className="text-pado-2">•</span> Assets on Devnet have no
            monetary value.
          </li>
          <li className="flex gap-2">
            <span className="text-pado-2">•</span> The network may be reset at
            any time.
          </li>
          <li className="flex gap-2">
            <span className="text-pado-2">•</span> Your address is your
            permanent identity on Nasun.
          </li>
          <li className="flex gap-2">
            <span className="text-pado-2">•</span> Back up your Nasun Wallet
            now to ensure recovery.
          </li>
        </ul>
      )}
    </div>
  );
};

const SectionDivider: FC = () => (
  <div className="h-px bg-gradient-to-r from-transparent via-uju-border/60 to-transparent" />
);

export const UjuConnectedWalletsCard: FC<UjuConnectedWalletsCardProps> = ({
  className = "",
}) => {
  const { user } = useAuth();

  if (!user) {
    return (
      <UjuCard className={className}>
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-pado-2 border-t-transparent rounded-full animate-spin" />
        </div>
      </UjuCard>
    );
  }

  return (
    <UjuCard
      className={`animate-fade-slide-up ${className}`}
      data-uju-scroll-target="connected-accounts"
    >
      <UjuSectionHeader
        accent
        title="Connected Wallets"
        subtitle="Wallets linked to your Nasun identity"
      />

      <div className="mt-6 space-y-6 sm:space-y-8">
        <section>
          <div className="flex items-start justify-between gap-3 mb-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-uju-secondary">
              Nasun
            </h3>
            <DevnetNoticeInline />
          </div>
          <UjuNasunWalletSection />
        </section>

        {user.cognitoToken && (
          <>
            <SectionDivider />
            <EthereumSubsection />

            <SectionDivider />
            <section>
              {/* Renders AdditionalWalletsCard with only the Solana block.
                  The card supplies its own <h3>, so we don't add a
                  SubsectionTitle here — the visual rhythm matches the
                  EVM block when present. */}
              <AdditionalWalletsCard
                bare
                showEvm={false}
                showHeader={false}
                solanaTitle="Solana"
              />
            </section>

            <SectionDivider />
            <SuiSubsection />
          </>
        )}
      </div>
    </UjuCard>
  );
};

/**
 * Ethereum subsection. When a verified primary exists, we delegate the
 * full management UI (primary row + extras + Add button) to
 * AdditionalWalletsCard in bare/EVM-only mode. When no primary is
 * verified yet, we show a single Link CTA row that triggers the
 * signature flow via useWalletAuth.
 */
const EthereumSubsection: FC = () => {
  const verified = useVerifiedEvmAddresses();
  const { user } = useAuth();
  const linking = useUjuAccountLinking({ user });
  const wallet = useWalletAuth({
    mode: "link",
    onSuccess: () => toast.success("Ethereum wallet linked."),
    onError: (e) => toast.error(e.message || "Failed to link wallet."),
  });

  const meta = user?.linkedAccounts?.metamask;
  const isVerified = !!meta?.walletAddress && meta.manualEntry !== true;
  const isMetaMaskPrimary = user?.provider === "MetaMask";

  if (verified.length > 0) {
    return (
      <section>
        <AdditionalWalletsCard
          bare
          showSolana={false}
          showHeader={false}
          evmTitle="Ethereum"
        />
      </section>
    );
  }

  return (
    <section>
      <SubsectionTitle>Ethereum</SubsectionTitle>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 bg-uju-bg/40 rounded-2xl border border-uju-border/60">
        <div className="flex items-start gap-3 min-w-0">
          <span
            className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center font-bold bg-pado-1/20 text-pado-3"
            aria-hidden="true"
          >
            Ξ
          </span>
          <div className="min-w-0">
            <p className="text-base font-medium text-uju-primary">Ethereum</p>
            <p className="text-sm text-uju-secondary font-light mt-0.5 break-all">
              {isVerified && !isMetaMaskPrimary
                ? meta!.walletAddress
                : "Sign a challenge with MetaMask, Rainbow, or WalletConnect"}
            </p>
            {wallet.error && (
              <p className="text-sm text-red-400 mt-1">{wallet.error}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 pl-[52px] sm:pl-0">
          {isVerified && !isMetaMaskPrimary ? (
            <UjuButton
              variant="secondary"
              size="xs"
              className="text-red-400 border-red-500/20 hover:border-red-500/40 !shadow-none hover:!shadow-none"
              onClick={() => linking.unlinkAccount("metamask")}
              disabled={linking.isLinking}
            >
              Unlink
            </UjuButton>
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
      </div>
    </section>
  );
};

/**
 * SUI verified-wallet subsection. Mirrors the Solana flow: first verified
 * signature becomes the primary; subsequent verifies are appended as
 * additional addresses (cap 5). The Nasun-derived address is intentionally
 * NOT surfaced here -- Nasun is currently devnet, and reusing that key on
 * Sui mainnet is unsafe.
 */
const SuiSubsection: FC = () => {
  const verified = useVerifiedSuiAddresses();
  const addState = useAddVerifiedSuiAddress();
  const [removingAddress, setRemovingAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onAdd = useCallback(
    async (walletName: string) => {
      setError(null);
      addState.reset();
      const result = await addState.add(walletName);
      if (!result && addState.phase === "error") {
        setError(addState.errorMessage);
      }
    },
    [addState],
  );

  const onRemove = useCallback(
    async (walletAddress: string) => {
      if (removingAddress) return;
      setError(null);
      const ok = window.confirm(
        `Remove ${walletAddress} from your verified Sui wallets?\n\n` +
          `Any per-dApp bindings that point at this address will be cleared.`,
      );
      if (!ok) return;
      setRemovingAddress(walletAddress);
      try {
        const token = useUserStore.getState().user?.cognitoToken;
        const identityId = useUserStore.getState().user?.identityId;
        if (!token || !identityId) throw new Error("Please sign in again.");
        await removeAdditionalSuiAddress(walletAddress, token);
        await refreshAndSaveUserProfile(identityId);
        toast.success("Sui wallet removed");
      } catch (err) {
        const msg =
          err instanceof AdditionalSuiApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to remove wallet.";
        setError(msg);
      } finally {
        setRemovingAddress(null);
      }
    },
    [removingAddress],
  );

  const installed = addState.installed;
  const hasPrimary = verified.length > 0;
  const extras = verified.filter((e) => !e.isPrimary);
  const cap = 5;
  const canAdd = !hasPrimary || extras.length < cap;
  const busy =
    addState.phase === "connecting" ||
    addState.phase === "signing" ||
    addState.phase === "verifying";

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <SubsectionTitle>SUI</SubsectionTitle>
        {hasPrimary && (
          <span className="text-sm text-uju-secondary">
            {extras.length} / {cap}
          </span>
        )}
      </div>

      {hasPrimary ? (
        <ul className="space-y-2">
          {verified.map((entry) => (
            <SuiWalletRow
              key={entry.walletAddress}
              entry={entry}
              removing={removingAddress === entry.walletAddress}
              disabled={!!removingAddress}
              onRemove={entry.isPrimary ? undefined : () => onRemove(entry.walletAddress)}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-uju-secondary font-light">
          Connect a Sui wallet and sign a one-time message to register an
          external address. Display-only — Nasun never initiates Sui
          transactions on your behalf.
        </p>
      )}

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {installed.length === 0 && (
          <span className="text-sm text-uju-secondary">
            Install Slush, Suiet, or Sui Wallet to register a Sui address.
          </span>
        )}
        {installed.map((name) => (
          <UjuButton
            key={name}
            variant="secondary"
            size="xs"
            onClick={() => onAdd(name)}
            disabled={!canAdd || busy}
          >
            {busy
              ? addState.phase === "signing"
                ? "Sign in wallet…"
                : addState.phase === "verifying"
                  ? "Verifying…"
                  : "Connecting…"
              : hasPrimary
                ? `Add via ${name}`
                : `Verify with ${name}`}
          </UjuButton>
        ))}
        {hasPrimary && !canAdd && (
          <span className="text-sm text-uju-secondary">
            Maximum reached. Remove one to add another.
          </span>
        )}
      </div>

      {(error || addState.errorMessage) && (
        <p className="mt-2 text-sm text-nasun-coral">
          {error || addState.errorMessage}
        </p>
      )}
    </section>
  );
};

interface SuiWalletRowProps {
  entry: VerifiedSuiAddressEntry;
  removing: boolean;
  disabled: boolean;
  onRemove?: () => void;
}

function SuiWalletRow({ entry, removing, disabled, onRemove }: SuiWalletRowProps) {
  return (
    <li className="rounded-lg border border-uju-border/60 bg-uju-bg/40 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-base text-uju-primary break-all">
              {shorten(entry.walletAddress)}
            </span>
            {entry.isPrimary && (
              <span className="rounded-full bg-pado-3/15 px-2 py-0.5 text-sm font-medium text-pado-4">
                Primary
              </span>
            )}
            {entry.label && (
              <span className="text-sm text-uju-secondary">{entry.label}</span>
            )}
          </div>
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="shrink-0 text-uju-secondary hover:text-nasun-coral disabled:opacity-40 transition-colors"
            aria-label={`Remove ${entry.walletAddress}`}
          >
            {removing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Trash2 className="h-5 w-5" />
            )}
          </button>
        )}
      </div>
    </li>
  );
}

export default UjuConnectedWalletsCard;
