/**
 * UjuNasunWalletSection
 *
 * The Nasun wallet sub-section of the unified Connected Wallets card.
 * Owns: primary Nasun wallet row, additional registered Nasun wallets,
 * Register Additional Wallet CTA, devnet disclaimer, "Connect Wallet"
 * dropdown when no wallet is active.
 *
 * Extracted from UjuConnectedAccountsCard on the 2026-05-17 profile-tab
 * split so the wallet/social cards are independent surfaces.
 */

import { FC, useState } from "react";
import { useAuth } from "@/features/auth";
import { WalletConnect } from "@nasun/wallet-ui";

import { UjuAccountItem } from "./UjuAccountItem";
import { UjuAddWalletModal } from "./UjuAddWalletModal";
import { UjuConnectedBadge, UjuLinkedBadge, UjuPrimaryBadge } from "./UjuStatusBadges";
import { useUjuWalletRegistration } from "../../hooks/useUjuWalletRegistration";
import { useUjuNasunWalletState } from "../../hooks/useUjuNasunWalletState";
import { UjuButton } from "../../shared";

export const UjuNasunWalletSection: FC = () => {
  const { user } = useAuth();
  const [addWalletModalOpen, setAddWalletModalOpen] = useState(false);
  const [walletFlowActive, setWalletFlowActive] = useState(false);

  const walletReg = useUjuWalletRegistration();
  const walletState = useUjuNasunWalletState(user, walletReg);

  if (!user) return null;

  const {
    displayAddress,
    isPrimaryRegistered,
    isProfileWallet,
    additionalWallets,
    showAsConnected,
    hasLinkedWallet,
    nasunWalletAddress,
    isNasunConnected,
    autoRegisterAttemptedRef,
  } = walletState;

  return (
    <div className="space-y-3">
      <UjuAccountItem
        provider="nasun"
        identifier={
          displayAddress
            ? `${displayAddress.slice(0, 6)}...${displayAddress.slice(-4)}`
            : walletReg.isLoading
              ? "Loading..."
              : "No wallet registered"
        }
        statusBadge={
          isPrimaryRegistered ? (
            <UjuPrimaryBadge />
          ) : !showAsConnected && hasLinkedWallet ? (
            <UjuLinkedBadge />
          ) : undefined
        }
        actions={
          !user.cognitoToken
            ? [
                <div
                  key="connect"
                  className="nasun-wallet-connect relative z-50"
                >
                  <WalletConnect
                    variant="filledOutlineC7"
                    size="sm"
                    dropdownPosition="bottom"
                    dropdownAlign="right"
                  />
                </div>,
              ]
            : isPrimaryRegistered && !isProfileWallet
              ? [
                  <button
                    key="remove-primary"
                    title="Remove"
                    className="w-9 h-9 rounded-xl border border-red-500/30 text-red-400 hover:border-red-400 hover:bg-red-500/10 transition-all flex items-center justify-center disabled:opacity-30"
                    onClick={async () => {
                      await walletReg.removeWalletByAddress(displayAddress!);
                      if (nasunWalletAddress?.toLowerCase() === displayAddress) {
                        autoRegisterAttemptedRef.current = nasunWalletAddress;
                        sessionStorage.setItem(
                          "nasun:dismissed-wallet",
                          displayAddress!,
                        );
                      }
                    }}
                    disabled={walletReg.isRemoving === displayAddress}
                  >
                    {walletReg.isRemoving === displayAddress ? (
                      <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M18 12H6"
                        />
                      </svg>
                    )}
                  </button>,
                ]
              : showAsConnected &&
                  !walletReg.isCurrentWalletRegistered &&
                  !walletReg.isLoading
                ? [
                    walletReg.isRegistering ? (
                      <span
                        key="registering"
                        className="text-sm font-normal text-pado-2 animate-pulse"
                      >
                        REGISTERING...
                      </span>
                    ) : (
                      <UjuButton
                        key="register"
                        size="xs"
                        variant="primary"
                        onClick={() => {
                          sessionStorage.removeItem("nasun:dismissed-wallet");
                          autoRegisterAttemptedRef.current = null;
                          walletReg.registerCurrentWallet();
                        }}
                      >
                        Register
                      </UjuButton>
                    ),
                  ]
                : []
        }
      >
        {user.cognitoToken &&
          (!displayAddress || walletFlowActive) &&
          !walletReg.isLoading && (
            <div
              className="mb-4"
              onClick={() => {
                setWalletFlowActive(true);
                sessionStorage.removeItem("nasun:dismissed-wallet");
                autoRegisterAttemptedRef.current = null;
              }}
            >
              <div className="nasun-wallet-connect relative z-50">
                <WalletConnect
                  variant="filledOutlineC7"
                  size="sm"
                  triggerText="Connect Wallet"
                  forceShowTriggerText
                  dropdownPosition="bottom"
                  dropdownAlign="right"
                  onDropdownClose={() => setWalletFlowActive(false)}
                />
              </div>
            </div>
          )}

      </UjuAccountItem>

      {/* Additional registered Nasun wallets */}
      {user.cognitoToken &&
        (displayAddress || walletReg.registeredWallets.length > 0) && (
          <div className="ml-2 sm:ml-5 pl-3 sm:pl-5 border-l border-uju-border/20 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-uju-secondary uppercase tracking-[0.2em]">
                Additional Nasun Wallets {walletReg.isLoading && "— Loading..."}
              </div>
              <UjuButton
                size="xs"
                variant="secondary"
                onClick={() => {
                  sessionStorage.removeItem("nasun:dismissed-wallet");
                  autoRegisterAttemptedRef.current = null;
                  setAddWalletModalOpen(true);
                }}
              >
                Add
              </UjuButton>
            </div>
            {additionalWallets.map((w) => {
              const addr = w.walletAddress;
              const short = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
              const isCurrent = nasunWalletAddress?.toLowerCase() === addr;
              return (
                <div
                  key={addr}
                  className="flex items-center justify-between gap-3 p-3 bg-uju-bg/20 rounded-xl border border-uju-border/60"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <span className="text-sm text-uju-primary font-mono font-normal truncate">
                      {short}
                    </span>
                    {isCurrent && <UjuConnectedBadge />}
                  </div>
                  <button
                    title="Remove"
                    className="w-8 h-8 shrink-0 rounded-lg border border-red-500/20 text-red-400 hover:border-red-400/40 hover:bg-red-500/5 transition-all flex items-center justify-center disabled:opacity-30"
                    onClick={async () => {
                      await walletReg.removeWalletByAddress(addr);
                      if (nasunWalletAddress?.toLowerCase() === addr) {
                        autoRegisterAttemptedRef.current = nasunWalletAddress;
                        sessionStorage.setItem("nasun:dismissed-wallet", addr);
                      }
                    }}
                    disabled={walletReg.isRemoving === addr}
                  >
                    {walletReg.isRemoving === addr ? (
                      <div className="w-2.5 h-2.5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2.5}
                          d="M18 12H6"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              );
            })}

            {isNasunConnected &&
              nasunWalletAddress &&
              !walletReg.isCurrentWalletRegistered &&
              !walletReg.isLoading &&
              nasunWalletAddress.toLowerCase() !== displayAddress &&
              sessionStorage.getItem("nasun:dismissed-wallet") !==
                nasunWalletAddress.toLowerCase() && (
                <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-pado-2/5 rounded-xl border border-pado-2/20">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm text-uju-primary font-mono font-normal truncate">
                      {nasunWalletAddress.slice(0, 6)}...
                      {nasunWalletAddress.slice(-4)}
                    </span>
                    <UjuConnectedBadge />
                  </div>
                  {walletReg.isRegistering ? (
                    <span className="text-sm font-normal text-pado-2 animate-pulse uppercase">
                      Registering...
                    </span>
                  ) : (
                    <UjuButton
                      size="xs"
                      variant="primary"
                      onClick={() => {
                        sessionStorage.removeItem("nasun:dismissed-wallet");
                        autoRegisterAttemptedRef.current = null;
                        walletReg.registerCurrentWallet();
                      }}
                    >
                      Register
                    </UjuButton>
                  )}
                </div>
              )}

            {walletReg.error && (
              <p className="text-sm font-normal text-red-400 px-1">
                {walletReg.error}
              </p>
            )}

          </div>
        )}

      <UjuAddWalletModal
        isOpen={addWalletModalOpen}
        onClose={() => setAddWalletModalOpen(false)}
      />
    </div>
  );
};
