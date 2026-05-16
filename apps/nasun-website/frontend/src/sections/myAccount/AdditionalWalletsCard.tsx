/**
 * AdditionalWalletsCard
 *
 * Lists the user's signature-verified EVM addresses (primary + extras)
 * and lets the user add or remove additional wallets. The primary
 * wallet is read-only here — it is managed by the existing Connected
 * Accounts flows (UjuConnectedAccountsCard / ConnectedAccountsCard).
 *
 * Removing an extra wallet also clears any per-app bindings that
 * pointed at it (handled server-side in DELETE /additional-address).
 *
 * Visible when the user has a verified primary metamask link. Card uses
 * uju design tokens so it slots into the /my-account ProfileTab cleanly;
 * the legacy /archive/my-account page reuses the same component.
 */

import { FC, useCallback, useEffect, useRef, useState } from "react";
import { Trash2, Plus, Loader2, Pencil, Check, X as XIcon } from "lucide-react";
import { useUserStore } from "@/store/userStore";
import {
  useVerifiedEvmAddresses,
  type VerifiedEvmAddressEntry,
} from "@/sections/uju/dashboard/positions/useValidEvmAddressForApp";
import { useAddVerifiedAddress } from "@/sections/uju/dashboard/positions/useAddVerifiedAddress";
import {
  AdditionalEvmApiError,
  ADDITIONAL_ADDRESS_LABEL_MAX,
  patchAdditionalAddressLabel,
  removeAdditionalAddress,
} from "@/services/additionalEvmApi";
import { refreshAndSaveUserProfile } from "@/features/auth/services/userProfileService";
import { UjuCard, UjuSectionHeader, UjuButton } from "@/sections/uju/shared";

interface AdditionalWalletsCardProps {
  className?: string;
}

export const AdditionalWalletsCard: FC<AdditionalWalletsCardProps> = ({ className = "" }) => {
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

  // Hide entirely when there's no verified primary — additional wallets
  // are not meaningful without one. The primary metamask flow lives in
  // UjuConnectedAccountsCard (or its myAccount counterpart) and is the
  // entry point that turns this card on.
  if (verified.length === 0) return null;

  const extras = verified.filter((e) => !e.isPrimary);
  const cap = 5;
  const canAdd = extras.length < cap;
  const busy =
    addState.phase === "connecting" ||
    addState.phase === "signing" ||
    addState.phase === "verifying";

  return (
    <UjuCard className={className}>
      <UjuSectionHeader
        accent
        title="Additional Wallets"
        subtitle="Verify extra EVM wallets so each dApp (Uniswap, Hyperliquid, …) can pull data from a different address than your primary metamask link."
      />

      <div className="mt-2 flex items-baseline justify-end gap-3 text-sm text-uju-secondary">
        <span>{extras.length} / {cap}</span>
      </div>

      <ul className="mt-3 space-y-2">
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

      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <UjuButton
          variant="accent"
          size="sm"
          onClick={onAdd}
          disabled={!canAdd || busy}
          leadingIcon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        >
          {busy
            ? addState.phase === "signing"
              ? "Sign in wallet…"
              : addState.phase === "verifying"
                ? "Verifying…"
                : "Connecting…"
            : "Add wallet"}
        </UjuButton>
        {!canAdd && (
          <span className="text-sm text-uju-secondary">
            Maximum reached. Remove one to add another.
          </span>
        )}
      </div>

      {(error || addState.errorMessage) && (
        <p className="mt-3 text-sm text-nasun-coral">{error || addState.errorMessage}</p>
      )}
    </UjuCard>
  );
};

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

export default AdditionalWalletsCard;
