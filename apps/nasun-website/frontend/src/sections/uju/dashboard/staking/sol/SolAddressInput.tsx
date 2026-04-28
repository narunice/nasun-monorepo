// Shared SOL address connect/edit form.
// Used by:
//  - WalletBalanceCard (inline next to SOL row)
//  - SolConnectModal (StakingCard CTA modal)
//
// Both writers funnel through useSolAddressStore.setForIdentity, ensuring
// store + localStorage stay in sync and StakingCard reflects changes immediately.
//
// UX (plan v5 Critical #5):
//   - placeholder: "Press Enter to save · Esc to cancel"
//   - Enter → validate + save
//   - Esc → cancel (input reset to current store value)
//   - blur with valid + changed input → auto-save (silent)
//   - blur with invalid input → inline error "Address not saved"
//   - empty input + non-empty store → no-op (clearing requires explicit Disconnect)

import { useCallback, useEffect, useState } from "react";
import { isValidSolAddress } from "@/lib/solana";
import {
  useSolanaWalletAdapter,
  type SolWalletName,
} from "../../useSolanaWalletAdapter";
import { useSolAddressForIdentity, useSolAddressStore } from "../../../stores/solAddressStore";
import { UjuButton } from "../../../shared";

interface SolAddressInputProps {
  identityId: string;
  /** Optional: called after a successful save (e.g. close modal). */
  onSaved?: () => void;
  /** Compact layout for the StakingCard inline modal (no header). */
  compact?: boolean;
}

export function SolAddressInput({
  identityId,
  onSaved,
  compact = false,
}: SolAddressInputProps) {
  const sol = useSolAddressForIdentity(identityId);
  const setForIdentity = useSolAddressStore((s) => s.setForIdentity);

  // Component-local UI state (per plan v5 3A.2 owner table).
  const [solInput, setSolInput] = useState("");
  const [solError, setSolError] = useState("");
  const [solEditing, setSolEditing] = useState(false);

  // Sync store → input (one-way), only when not editing.
  // Mirrors WalletBalanceCard's identityId-effect behavior but driven by store.
  useEffect(() => {
    if (!solEditing) {
      setSolInput(sol?.solAddress ?? "");
    }
  }, [sol?.solAddress, solEditing]);

  const {
    installed,
    isConnecting,
    error: walletError,
    connect: adapterConnect,
    disconnect: adapterDisconnect,
    clearError,
  } = useSolanaWalletAdapter();

  const handleSave = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) {
        // empty + currently has a saved address: no-op (require explicit Disconnect)
        setSolError("");
        return;
      }
      if (!isValidSolAddress(trimmed)) {
        setSolError("Invalid Solana address");
        return;
      }
      setForIdentity(identityId, trimmed, null); // manual entry: no adapter
      setSolError("");
      setSolEditing(false);
      onSaved?.();
    },
    [identityId, setForIdentity, onSaved],
  );

  const handleAdapterConnect = useCallback(
    async (name: SolWalletName) => {
      const addr = await adapterConnect(name);
      if (!addr) return;
      setForIdentity(identityId, addr, name);
      setSolEditing(false);
      setSolError("");
      onSaved?.();
    },
    [adapterConnect, setForIdentity, identityId, onSaved],
  );

  const handleDisconnect = useCallback(async () => {
    if (sol?.connectedWallet) {
      await adapterDisconnect(sol.connectedWallet);
    }
    setForIdentity(identityId, null, null);
    setSolError("");
    setSolEditing(false);
    clearError();
  }, [sol?.connectedWallet, adapterDisconnect, setForIdentity, identityId, clearError]);

  const handleBlur = () => {
    const trimmed = solInput.trim();
    if (!trimmed) {
      setSolEditing(false);
      setSolError("");
      return;
    }
    if (!isValidSolAddress(trimmed)) {
      // blur with invalid → inline error, do not save
      setSolError("Address not saved — invalid format");
      return;
    }
    if (trimmed !== sol?.solAddress) {
      // valid + changed → auto-save (silent)
      handleSave(trimmed);
    } else {
      setSolEditing(false);
    }
  };

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {!compact && (
        <p className="text-sm text-uju-secondary">
          Connect a Solana wallet or paste an address. Read-only display only —
          we never sign transactions on your behalf.
        </p>
      )}

      {/* Adapter buttons */}
      {installed.length > 0 && (
        <div className="flex flex-col gap-2">
          {installed.includes("phantom") && (
            <UjuButton
              variant="secondary"
              fullWidth
              size="sm"
              disabled={isConnecting}
              onClick={() => handleAdapterConnect("phantom")}
            >
              Connect Phantom
            </UjuButton>
          )}
          {installed.includes("solflare") && (
            <UjuButton
              variant="secondary"
              fullWidth
              size="sm"
              disabled={isConnecting}
              onClick={() => handleAdapterConnect("solflare")}
            >
              Connect Solflare
            </UjuButton>
          )}
        </div>
      )}

      {/* Manual entry */}
      <div>
        <label htmlFor="sol-address-input" className="block text-sm text-uju-secondary mb-1.5">
          Or paste address
        </label>
        <div className="flex items-stretch gap-2">
          <input
            id="sol-address-input"
            type="text"
            spellCheck={false}
            autoComplete="off"
            placeholder="Press Enter to save · Esc to cancel"
            value={solInput}
            onChange={(e) => {
              setSolInput(e.target.value);
              setSolEditing(true);
              if (solError) setSolError("");
            }}
            onFocus={() => setSolEditing(true)}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSave(solInput);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setSolInput(sol?.solAddress ?? "");
                setSolError("");
                setSolEditing(false);
                (e.target as HTMLInputElement).blur();
              }
            }}
            className="flex-1 rounded-xl border border-uju-border bg-uju-bg px-3 py-2 text-base text-white placeholder:text-uju-secondary/70 focus:outline-none focus:border-pado-3"
          />
          {sol?.solAddress && (
            <UjuButton variant="ghost" size="sm" onClick={handleDisconnect}>
              Disconnect
            </UjuButton>
          )}
        </div>
        {(solError || walletError) && (
          <p className="mt-1.5 text-sm text-rose-400">{solError || walletError}</p>
        )}
      </div>
    </div>
  );
}
