/**
 * AdditionalWalletsCard
 *
 * Lists the user's signature-verified wallets (EVM primary + extras and
 * Solana primary + extras) and lets the user add or remove additional
 * wallets. The primary wallets are read-only here — they are managed by
 * the existing Connected Accounts flows.
 *
 * Removing an extra wallet also clears any per-app bindings that
 * pointed at it (handled server-side in DELETE /additional-address).
 *
 * Visible when the user has a verified primary metamask link OR a
 * verified primary Solana link. Card uses uju design tokens so it slots
 * into the /my-account ProfileTab cleanly; the legacy /archive/my-account
 * page reuses the same component.
 */

import { FC, useCallback, useEffect, useRef, useState } from "react";
import { Trash2, Loader2, Pencil, Check, X as XIcon } from "lucide-react";
import { useUserStore } from "@/store/userStore";
import {
  useVerifiedEvmAddresses,
  type VerifiedEvmAddressEntry,
} from "@/sections/uju/dashboard/positions/useValidEvmAddressForApp";
import {
  useVerifiedSolanaAddresses,
  type VerifiedSolanaAddressEntry,
} from "@/sections/uju/dashboard/positions/useValidSolanaAddress";
import { useAddVerifiedAddress } from "@/sections/uju/dashboard/positions/useAddVerifiedAddress";
import { useAddVerifiedSolanaAddress } from "@/sections/uju/dashboard/positions/useAddVerifiedSolanaAddress";
import type { SolWalletName } from "@/sections/uju/dashboard/useSolanaWalletAdapter";
import {
  AdditionalEvmApiError,
  ADDITIONAL_ADDRESS_LABEL_MAX,
  patchAdditionalAddressLabel,
  removeAdditionalAddress,
} from "@/services/additionalEvmApi";
import {
  AdditionalSolanaApiError,
  ADDITIONAL_SOL_ADDRESS_LABEL_MAX,
  patchAdditionalSolAddressLabel,
  removeAdditionalSolAddress,
} from "@/services/additionalSolanaApi";
import { refreshAndSaveUserProfile } from "@/features/auth/services/userProfileService";
import { UjuCard, UjuSectionHeader, UjuButton } from "@/sections/uju/shared";

interface AdditionalWalletsCardProps {
  className?: string;
  // When true, render the inner content without the UjuCard wrapper and
  // section header so the parent (e.g. the unified Connected Wallets card)
  // can compose this block as a sub-section. The legacy DevMyAccountPage
  // continues to use the default card-wrapped form.
  bare?: boolean;
  evmTitle?: string;
  solanaTitle?: string;
  // When false, suppress rendering of the corresponding sub-block so the
  // parent (e.g. the unified Connected Wallets card) can compose EVM and
  // Solana sections independently. Both default to true to preserve the
  // legacy DevMyAccountPage behavior.
  showEvm?: boolean;
  showSolana?: boolean;
  // When false, suppress the section header (used inside the unified card
  // where each subsection has its own title rendered by the parent).
  showHeader?: boolean;
}

export const AdditionalWalletsCard: FC<AdditionalWalletsCardProps> = ({
  className = "",
  bare = false,
  evmTitle = "Ethereum (EVM)",
  solanaTitle = "Solana",
  showEvm = true,
  showSolana = true,
  showHeader = true,
}) => {
  const verified = useVerifiedEvmAddresses();
  const meta = useUserStore((s) => s.user?.linkedAccounts?.metamask);
  const addState = useAddVerifiedAddress();
  const [removingAddress, setRemovingAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onAdd = useCallback(async () => {
    setError(null);
    addState.reset();
    const result = await addState.add();
    if (!result && addState.phase === "error") {
      setError(addState.errorMessage);
    }
  }, [addState]);

  const onRemove = useCallback(async (walletAddress: string) => {
    if (removingAddress) return;
    setError(null);
    const ok = window.confirm(
      `Remove ${walletAddress} from your verified wallets?\n\n` +
      `Any per-dApp bindings that point at this address will be cleared.`,
    );
    if (!ok) return;
    setRemovingAddress(walletAddress);
    try {
      const token = useUserStore.getState().user?.cognitoToken;
      const identityId = useUserStore.getState().user?.identityId;
      if (!token || !identityId) throw new Error("Please sign in again.");
      await removeAdditionalAddress(walletAddress, token);
      await refreshAndSaveUserProfile(identityId);
    } catch (err) {
      const msg = err instanceof AdditionalEvmApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Failed to remove wallet.";
      setError(msg);
    } finally {
      setRemovingAddress(null);
    }
  }, [removingAddress]);

  const solVerified = useVerifiedSolanaAddresses();
  const user = useUserStore((s) => s.user);

  // Require a signed-in user but otherwise always render. The EVM section
  // is internally gated on `verified.length > 0` (its primary is set up by
  // EthereumVerifiedRow in the profile Connected Accounts card), so for
  // users with no EVM verified primary the EVM block stays hidden. The
  // Solana section, in contrast, hosts BOTH the first-verify CTA and the
  // additional-wallet management, so it must always be reachable -- the
  // legacy paste flow for Solana was retired here on 2026-05-17.
  if (!user) return null;

  const extras = verified.filter((e) => !e.isPrimary);
  const cap = 5;
  const canAdd = extras.length < cap;
  const busy =
    addState.phase === "connecting" ||
    addState.phase === "signing" ||
    addState.phase === "verifying";

  const inner = (
    <>
      {!bare && showHeader && (
        <UjuSectionHeader
          accent
          title="Additional Wallets"
          subtitle="Verify extra wallets so each dApp can pull data from a different address than your primary link."
        />
      )}

      {showEvm && verified.length > 0 && (
        <div className={bare ? "" : "mt-4"}>
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-uju-secondary">
              {evmTitle}
            </h3>
            <span className="text-sm text-uju-secondary">{extras.length} / {cap}</span>
          </div>

          <ul className="mt-2 space-y-2">
            {verified.map((entry) => (
              <WalletRow
                key={entry.walletAddress}
                entry={entry}
                bindings={meta?.appBindings}
                removing={removingAddress === entry.walletAddress}
                disabled={!!removingAddress}
                onRemove={entry.isPrimary ? undefined : () => onRemove(entry.walletAddress)}
                canEditLabel={!entry.isPrimary}
              />
            ))}
          </ul>

          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <UjuButton
              variant="secondary"
              size="xs"
              onClick={onAdd}
              disabled={!canAdd || busy}
            >
              {busy
                ? addState.phase === "signing"
                  ? "Sign in wallet…"
                  : addState.phase === "verifying"
                    ? "Verifying…"
                    : "Connecting…"
                : "Add"}
            </UjuButton>
            {!canAdd && (
              <span className="text-sm text-uju-secondary">
                Maximum reached. Remove one to add another.
              </span>
            )}
          </div>

          {(error || addState.errorMessage) && (
            <p className="mt-2 text-sm text-nasun-coral">{error || addState.errorMessage}</p>
          )}
        </div>
      )}

      {showSolana && (
        <SolanaWalletsSection
          verified={solVerified}
          title={solanaTitle}
          bare={bare}
        />
      )}
    </>
  );

  if (bare) return <div className={className}>{inner}</div>;
  return <UjuCard className={className}>{inner}</UjuCard>;
};

interface SolanaWalletsSectionProps {
  verified: VerifiedSolanaAddressEntry[];
  title?: string;
  // When true, drop the top border-divider since the parent already places
  // this subsection in a structured stack with its own separators.
  bare?: boolean;
}

function SolanaWalletsSection({
  verified,
  title = "Solana",
  bare = false,
}: SolanaWalletsSectionProps) {
  const sol = useUserStore((s) => s.user?.linkedAccounts?.solana);
  const addState = useAddVerifiedSolanaAddress();
  const [removingAddress, setRemovingAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onAdd = useCallback(
    async (walletName: SolWalletName) => {
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
        `Remove ${walletAddress} from your verified wallets?\n\n` +
          `Any per-dApp bindings that point at this address will be cleared.`,
      );
      if (!ok) return;
      setRemovingAddress(walletAddress);
      try {
        const token = useUserStore.getState().user?.cognitoToken;
        const identityId = useUserStore.getState().user?.identityId;
        if (!token || !identityId) throw new Error("Please sign in again.");
        await removeAdditionalSolAddress(walletAddress, token);
        await refreshAndSaveUserProfile(identityId);
      } catch (err) {
        const msg =
          err instanceof AdditionalSolanaApiError
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

  const extras = verified.filter((e) => !e.isPrimary);
  const cap = 5;
  // When there is no verified primary, the Add button creates one (the
  // server's verify endpoint promotes the first verify to primary). We
  // still gate on the cap of additional extras when a primary exists.
  const hasPrimary = verified.length > 0;
  const canAdd = !hasPrimary || extras.length < cap;
  const busy =
    addState.phase === "connecting" ||
    addState.phase === "signing" ||
    addState.phase === "verifying";

  const installed = addState.installed;
  // Only render a chain-specific CTA when the matching extension is
  // actually installed. The previous fallback (`|| !showSolflareButton`)
  // rendered a Phantom button when neither extension was present, which
  // would always fail with "Phantom not installed". The hint at the
  // bottom of the row covers the empty case instead.
  const showPhantomButton = installed.includes("phantom");
  const showSolflareButton = installed.includes("solflare");

  return (
    <div className={bare ? "" : "mt-6 border-t border-uju-border/40 pt-5"}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-uju-secondary">
          {title}
        </h3>
        {hasPrimary && <span className="text-sm text-uju-secondary">{extras.length} / {cap}</span>}
      </div>

      {hasPrimary && (
        <ul className="mt-2 space-y-2">
          {verified.map((entry) => (
            <SolanaWalletRow
              key={entry.walletAddress}
              entry={entry}
              bindings={sol?.appBindings}
              removing={removingAddress === entry.walletAddress}
              disabled={!!removingAddress}
              onRemove={entry.isPrimary ? undefined : () => onRemove(entry.walletAddress)}
              canEditLabel={!entry.isPrimary}
            />
          ))}
        </ul>
      )}

      {!hasPrimary && (
        <p className="mt-2 text-sm text-uju-secondary">
          Connect Phantom or Solflare and verify ownership with a signature to surface
          Drift / Jupiter / Marinade positions inside Nasun.
        </p>
      )}

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {showPhantomButton && (
          <UjuButton
            variant="secondary"
            size="xs"
            onClick={() => onAdd("phantom")}
            disabled={!canAdd || busy}
          >
            {busy
              ? addState.phase === "signing"
                ? "Sign in wallet…"
                : addState.phase === "verifying"
                  ? "Verifying…"
                  : "Connecting…"
              : hasPrimary
                ? "Add via Phantom"
                : "Verify with Phantom"}
          </UjuButton>
        )}
        {showSolflareButton && (
          <UjuButton
            variant="secondary"
            size="xs"
            onClick={() => onAdd("solflare")}
            disabled={!canAdd || busy}
          >
            {busy ? "Working…" : hasPrimary ? "Add via Solflare" : "Verify with Solflare"}
          </UjuButton>
        )}
        {installed.length === 0 && (
          <span className="text-sm text-uju-secondary">
            Install Phantom or Solflare to verify a Solana wallet.
          </span>
        )}
        {hasPrimary && !canAdd && (
          <span className="text-sm text-uju-secondary">
            Maximum reached. Remove one to add another.
          </span>
        )}
      </div>

      {(error || addState.errorMessage) && (
        <p className="mt-2 text-sm text-nasun-coral">{error || addState.errorMessage}</p>
      )}
    </div>
  );
}

interface WalletRowProps {
  entry: VerifiedEvmAddressEntry;
  bindings: Record<string, string> | undefined;
  removing: boolean;
  disabled: boolean;
  canEditLabel: boolean;
  onRemove?: () => void;
}

function WalletRow({ entry, bindings, removing, disabled, canEditLabel, onRemove }: WalletRowProps) {
  // Reverse-lookup which appIds resolve to this wallet so the user can
  // see at a glance which dApps would be affected by a removal.
  const boundApps = Object.entries(bindings ?? {})
    .filter(([, addr]) => addr.toLowerCase() === entry.walletAddress.toLowerCase())
    .map(([appId]) => appId);

  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(entry.label ?? "");
  const [savingLabel, setSavingLabel] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editingLabel) setLabelDraft(entry.label ?? "");
  }, [entry.label, editingLabel]);

  useEffect(() => {
    if (editingLabel) inputRef.current?.focus();
  }, [editingLabel]);

  const commitLabel = useCallback(async () => {
    if (savingLabel) return;
    const trimmed = labelDraft.trim();
    const initial = entry.label ?? "";
    if (trimmed === initial) {
      setEditingLabel(false);
      setLabelError(null);
      return;
    }
    setSavingLabel(true);
    setLabelError(null);
    try {
      const token = useUserStore.getState().user?.cognitoToken;
      const identityId = useUserStore.getState().user?.identityId;
      if (!token || !identityId) throw new Error("Please sign in again.");
      await patchAdditionalAddressLabel(
        entry.walletAddress,
        trimmed === "" ? null : trimmed,
        token,
      );
      await refreshAndSaveUserProfile(identityId);
      setEditingLabel(false);
    } catch (err) {
      const msg = err instanceof AdditionalEvmApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Failed to save label.";
      setLabelError(msg);
    } finally {
      setSavingLabel(false);
    }
  }, [entry.walletAddress, entry.label, labelDraft, savingLabel]);

  const cancelLabel = useCallback(() => {
    setEditingLabel(false);
    setLabelDraft(entry.label ?? "");
    setLabelError(null);
  }, [entry.label]);

  return (
    <li className="rounded-lg border border-uju-border/60 bg-uju-bg/40 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-base text-uju-primary break-all">
              {entry.walletAddress}
            </span>
            {entry.isPrimary && (
              <span className="rounded-full bg-pado-3/15 px-2 py-0.5 text-sm font-medium text-pado-4">
                Primary
              </span>
            )}
          </div>

          {canEditLabel && (
            <div className="mt-1.5 flex items-center gap-2 text-sm">
              {editingLabel ? (
                <>
                  <input
                    ref={inputRef}
                    type="text"
                    value={labelDraft}
                    onChange={(e) => setLabelDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitLabel();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        cancelLabel();
                      }
                    }}
                    maxLength={ADDITIONAL_ADDRESS_LABEL_MAX}
                    placeholder="Label (e.g. Trading wallet)"
                    disabled={savingLabel}
                    className="flex-1 max-w-xs rounded-md border border-uju-border bg-uju-bg/60 px-2 py-1 text-sm text-uju-primary placeholder:text-uju-secondary/60 focus:outline-none focus:border-pado-3 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={commitLabel}
                    disabled={savingLabel}
                    className="text-pado-3 hover:text-pado-4 disabled:opacity-40"
                    aria-label="Save label"
                  >
                    {savingLabel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={cancelLabel}
                    disabled={savingLabel}
                    className="text-uju-secondary hover:text-uju-primary disabled:opacity-40"
                    aria-label="Cancel"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <span className={entry.label ? "text-uju-primary" : "text-uju-secondary italic"}>
                    {entry.label || "No label"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingLabel(true)}
                    disabled={disabled}
                    className="text-uju-secondary hover:text-pado-3 disabled:opacity-40"
                    aria-label={entry.label ? "Edit label" : "Add label"}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          )}
          {labelError && (
            <p className="mt-1 text-sm text-nasun-coral">{labelError}</p>
          )}

          {boundApps.length > 0 && (
            <p className="mt-1 text-sm text-uju-secondary">
              Used by: {boundApps.join(", ")}
            </p>
          )}
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="shrink-0 text-uju-secondary hover:text-nasun-coral disabled:opacity-40 transition-colors"
            aria-label={`Remove ${entry.walletAddress}`}
          >
            {removing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
          </button>
        )}
      </div>
    </li>
  );
}

interface SolanaWalletRowProps {
  entry: VerifiedSolanaAddressEntry;
  bindings: Record<string, string> | undefined;
  removing: boolean;
  disabled: boolean;
  canEditLabel: boolean;
  onRemove?: () => void;
}

function SolanaWalletRow({
  entry,
  bindings,
  removing,
  disabled,
  canEditLabel,
  onRemove,
}: SolanaWalletRowProps) {
  // Base58 is case-sensitive — compare as-is (no toLowerCase).
  const boundApps = Object.entries(bindings ?? {})
    .filter(([, addr]) => addr === entry.walletAddress)
    .map(([appId]) => appId);

  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(entry.label ?? "");
  const [savingLabel, setSavingLabel] = useState(false);
  const [labelError, setLabelError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editingLabel) setLabelDraft(entry.label ?? "");
  }, [entry.label, editingLabel]);

  useEffect(() => {
    if (editingLabel) inputRef.current?.focus();
  }, [editingLabel]);

  const commitLabel = useCallback(async () => {
    if (savingLabel) return;
    const trimmed = labelDraft.trim();
    const initial = entry.label ?? "";
    if (trimmed === initial) {
      setEditingLabel(false);
      setLabelError(null);
      return;
    }
    setSavingLabel(true);
    setLabelError(null);
    try {
      const token = useUserStore.getState().user?.cognitoToken;
      const identityId = useUserStore.getState().user?.identityId;
      if (!token || !identityId) throw new Error("Please sign in again.");
      await patchAdditionalSolAddressLabel(
        entry.walletAddress,
        trimmed === "" ? null : trimmed,
        token,
      );
      await refreshAndSaveUserProfile(identityId);
      setEditingLabel(false);
    } catch (err) {
      const msg =
        err instanceof AdditionalSolanaApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to save label.";
      setLabelError(msg);
    } finally {
      setSavingLabel(false);
    }
  }, [entry.walletAddress, entry.label, labelDraft, savingLabel]);

  const cancelLabel = useCallback(() => {
    setEditingLabel(false);
    setLabelDraft(entry.label ?? "");
    setLabelError(null);
  }, [entry.label]);

  return (
    <li className="rounded-lg border border-uju-border/60 bg-uju-bg/40 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-base text-uju-primary break-all">
              {entry.walletAddress}
            </span>
            {entry.isPrimary && (
              <span className="rounded-full bg-pado-3/15 px-2 py-0.5 text-sm font-medium text-pado-4">
                Primary
              </span>
            )}
          </div>

          {canEditLabel && (
            <div className="mt-1.5 flex items-center gap-2 text-sm">
              {editingLabel ? (
                <>
                  <input
                    ref={inputRef}
                    type="text"
                    value={labelDraft}
                    onChange={(e) => setLabelDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitLabel();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        cancelLabel();
                      }
                    }}
                    maxLength={ADDITIONAL_SOL_ADDRESS_LABEL_MAX}
                    placeholder="Label (e.g. Drift wallet)"
                    disabled={savingLabel}
                    className="flex-1 max-w-xs rounded-md border border-uju-border bg-uju-bg/60 px-2 py-1 text-sm text-uju-primary placeholder:text-uju-secondary/60 focus:outline-none focus:border-pado-3 disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={commitLabel}
                    disabled={savingLabel}
                    className="text-pado-3 hover:text-pado-4 disabled:opacity-40"
                    aria-label="Save label"
                  >
                    {savingLabel ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    onClick={cancelLabel}
                    disabled={savingLabel}
                    className="text-uju-secondary hover:text-uju-primary disabled:opacity-40"
                    aria-label="Cancel"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <span className={entry.label ? "text-uju-primary" : "text-uju-secondary italic"}>
                    {entry.label || "No label"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingLabel(true)}
                    disabled={disabled}
                    className="text-uju-secondary hover:text-pado-3 disabled:opacity-40"
                    aria-label={entry.label ? "Edit label" : "Add label"}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          )}
          {labelError && (
            <p className="mt-1 text-sm text-nasun-coral">{labelError}</p>
          )}

          {boundApps.length > 0 && (
            <p className="mt-1 text-sm text-uju-secondary">
              Used by: {boundApps.join(", ")}
            </p>
          )}
        </div>
        {onRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="shrink-0 text-uju-secondary hover:text-nasun-coral disabled:opacity-40 transition-colors"
            aria-label={`Remove ${entry.walletAddress}`}
          >
            {removing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
          </button>
        )}
      </div>
    </li>
  );
}

export default AdditionalWalletsCard;
