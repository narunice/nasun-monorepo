// AppWalletBindingSection
//
// Inline binding picker rendered inside `UjuAppDetailsModal` for EVM
// apps. Lets the user pick which verified EVM wallet a specific dApp
// data card pulls from. The previous chip-on-card surface has been
// retired in favour of this single, app-details-anchored entry point
// (less header noise, one mental model: "this app is configured here").
//
// Gating:
//   - Component is mounted only by the modal, and only when
//     `app.chain` is an EVM chain (ethereum, hyperliquid, ...).
//   - If the user has no verified primary metamask link, the section
//     points them at /my-account → Connected Accounts.
//   - If the user has a primary but no extras, the section points them
//     at /my-account → Additional Wallets and explains the value.
//   - With ≥1 additional verified wallet, the radio picker becomes
//     active. "Use primary" resets the binding.

import { FC, useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useUserStore } from "@/store/userStore";
import { useVerifiedEvmAddresses } from "@/sections/uju/dashboard/positions/useValidEvmAddressForApp";
import {
  AdditionalEvmApiError,
  patchAppBinding,
} from "@/services/additionalEvmApi";
import { refreshAndSaveUserProfile } from "@/features/auth/services/userProfileService";
import { UjuButton } from "../shared";
import type { AppChain } from "./appRegistry";

interface AppWalletBindingSectionProps {
  appId: string;
  appName: string;
  chain: AppChain;
}

// Set of chains that flow through the per-app EVM binding mechanism. If
// you add a new EVM L2 (Base, Arbitrum, …) to AppEntry.chain, list it
// here so the picker appears in app details.
const EVM_CHAINS: ReadonlySet<AppChain> = new Set(["ethereum", "hyperliquid"]);

export function isEvmBindableChain(chain: AppChain): boolean {
  return EVM_CHAINS.has(chain);
}

export const AppWalletBindingSection: FC<AppWalletBindingSectionProps> = ({
  appId,
  appName,
  chain,
}) => {
  const verified = useVerifiedEvmAddresses();
  const meta = useUserStore((s) => s.user?.linkedAccounts?.metamask);
  const primaryAddress = verified.find((e) => e.isPrimary)?.walletAddress ?? null;
  const extras = verified.filter((e) => !e.isPrimary);
  const currentBinding = meta?.appBindings?.[appId];

  // Resolve the effective active address — mirrors useValidEvmAddressForApp
  // logic so the displayed "Currently using" matches what the dashboard
  // card actually uses for fetches.
  const verifiedSet = new Set(verified.map((e) => e.walletAddress.toLowerCase()));
  const activeAddress =
    currentBinding && verifiedSet.has(currentBinding.toLowerCase())
      ? currentBinding
      : primaryAddress;

  const [selected, setSelected] = useState<string | null>(activeAddress);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSave = useCallback(async (target: string | null) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const token = useUserStore.getState().user?.cognitoToken;
      const identityId = useUserStore.getState().user?.identityId;
      if (!token || !identityId) throw new Error("Please sign in again.");
      // target=null → clear the binding (falls back to primary client-side).
      await patchAppBinding(appId, target, token);
      await refreshAndSaveUserProfile(identityId);
    } catch (err) {
      const msg = err instanceof AdditionalEvmApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Failed to save binding.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }, [appId, saving]);

  // Display helpers
  const heading = (
    <h3 className="text-sm font-semibold text-uju-primary uppercase tracking-[0.2em] mb-2">
      Wallet for {appName}
    </h3>
  );
  const wrapper = "border-t border-uju-border/30 pt-4 mt-4";

  if (!isEvmBindableChain(chain)) return null;

  // Case 1: no verified metamask link at all.
  if (verified.length === 0) {
    return (
      <section className={wrapper}>
        {heading}
        <p className="text-sm text-uju-secondary">
          Link MetaMask in{" "}
          <Link to="/my-account" className="text-pado-3 hover:text-pado-4 underline-offset-4 hover:underline">
            My Account → Connected Accounts
          </Link>{" "}
          to enable per-app wallet binding.
        </p>
      </section>
    );
  }

  // Case 2: primary only, no extras — explain and link out.
  if (extras.length === 0) {
    return (
      <section className={wrapper}>
        {heading}
        <p className="text-sm text-uju-secondary">
          Using your primary wallet:{" "}
          <span className="font-mono text-uju-primary break-all">{primaryAddress}</span>
        </p>
        <p className="mt-2 text-sm text-uju-secondary">
          Want this app to read from a different wallet? Add one in{" "}
          <Link to="/my-account" className="text-pado-3 hover:text-pado-4 underline-offset-4 hover:underline">
            My Account → Additional Wallets
          </Link>
          .
        </p>
      </section>
    );
  }

  // Case 3: has extras — full picker.
  const activeIsPrimary = activeAddress && activeAddress.toLowerCase() === primaryAddress?.toLowerCase();
  const dirty = selected !== activeAddress;

  return (
    <section className={wrapper}>
      {heading}
      <p className="text-sm text-uju-secondary mb-2">
        Choose which verified wallet this app reads from. Switching does
        not move funds — it only changes which address {appName} pulls
        balances and positions for.
      </p>

      <ul className="space-y-1.5 mb-3">
        {verified.map((entry) => {
          const isSelected = selected?.toLowerCase() === entry.walletAddress.toLowerCase();
          const isActive = activeAddress?.toLowerCase() === entry.walletAddress.toLowerCase();
          return (
            <li key={entry.walletAddress}>
              <label
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
                  isSelected
                    ? "border-pado-3 bg-pado-3/10"
                    : "border-uju-border/60 hover:border-pado-3/40 hover:bg-uju-bg/40"
                }`}
              >
                <input
                  type="radio"
                  name={`wallet-binding-${appId}`}
                  checked={isSelected}
                  onChange={() => setSelected(entry.walletAddress)}
                  className="accent-pado-3"
                />
                <span className="font-mono text-sm text-uju-primary break-all flex-1 min-w-0">
                  {entry.walletAddress}
                </span>
                <span className="ml-auto text-sm text-uju-secondary shrink-0 flex items-center gap-1.5">
                  {entry.isPrimary && (
                    <span className="rounded-full bg-pado-3/15 px-2 py-0.5 text-sm font-medium text-pado-4">
                      Primary
                    </span>
                  )}
                  {entry.label && !entry.isPrimary && <span>{entry.label}</span>}
                  {isActive && <span className="text-pado-4">• Active</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <UjuButton
          variant="primary"
          size="sm"
          onClick={() => onSave(selected)}
          disabled={!dirty || saving || !selected}
          leadingIcon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
        >
          {saving ? "Saving…" : "Save"}
        </UjuButton>
        {!activeIsPrimary && (
          <UjuButton
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelected(primaryAddress);
              onSave(null);
            }}
            disabled={saving}
          >
            Use primary
          </UjuButton>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-nasun-coral">{error}</p>}
    </section>
  );
};
