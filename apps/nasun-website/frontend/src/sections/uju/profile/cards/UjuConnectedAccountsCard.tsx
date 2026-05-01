/**
 * UjuConnectedAccountsCard Component
 *
 * Manages social logins and wallet connections for UJU Profile.
 * Detached from myAccount dependencies.
 */

import { FC, useState } from "react";
import { useAuth } from "@/features/auth";
import { WalletConnect } from "@nasun/wallet-ui";

import { UjuAccountItem } from "../internal/UjuAccountItem";
import { UjuAddWalletModal } from "../internal/UjuAddWalletModal";
import { ExternalChainSection } from "../internal/ExternalChainSection";
import {
  UjuConnectedBadge,
  UjuLinkedBadge,
  UjuLoggedInBadge,
  UjuChannelMemberBadge,
} from "../internal/UjuStatusBadges";
import { useUjuAccountLinking } from "../../hooks/useUjuAccountLinking";
import { useUjuTelegramVerify } from "../../hooks/useUjuTelegramVerify";
import { useUjuWalletRegistration } from "../../hooks/useUjuWalletRegistration";
import { useUjuNasunWalletState } from "../../hooks/useUjuNasunWalletState";
import { UjuCard, UjuSectionHeader, UjuButton } from "../../shared";

interface UjuConnectedAccountsCardProps {
  className?: string;
  bare?: boolean;
}

export const UjuConnectedAccountsCard: FC<UjuConnectedAccountsCardProps> = ({
  className = "",
  bare = false,
}) => {
  const { user } = useAuth();
  const [disclaimerExpanded, setDisclaimerExpanded] = useState(false);
  const [addWalletModalOpen, setAddWalletModalOpen] = useState(false);
  const [walletFlowActive, setWalletFlowActive] = useState(false);

  // Hooks
  const { isLinking, handleLinkGoogle, handleLinkTwitter, unlinkAccount } =
    useUjuAccountLinking({ user });
  const telegram = useUjuTelegramVerify({ user });
  const walletReg = useUjuWalletRegistration();
  const walletState = useUjuNasunWalletState(user, walletReg);

  if (!user) {
    if (bare) return <div className={className}>Loading...</div>;
    return (
      <UjuCard className={className}>
        <div className="flex items-center justify-center py-12">
          <div className="w-6 h-6 border-2 border-pado-2 border-t-transparent rounded-full animate-spin" />
        </div>
      </UjuCard>
    );
  }

  // Providers
  const isTwitterPrimary = user.provider === "Twitter";
  const isGooglePrimary = user.provider === "Google";

  // Linked Data
  const twitterData = isTwitterPrimary ? user : user.linkedAccounts?.twitter;
  const googleData = isGooglePrimary ? user : user.linkedAccounts?.google;

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

  const content = (
    <div className="space-y-6" data-uju-scroll-target="connected-accounts">
      <UjuSectionHeader
        accent
        title="Connected Wallets and Social Accounts"
        subtitle="Wallets and social accounts linked to your identity"
      />

      <div className="grid gap-4">
        {/* 1. Nasun Wallet */}
        <UjuAccountItem
          provider="nasun"
          identifier={
            displayAddress
              ? `${displayAddress.slice(0, 6)}...${displayAddress.slice(-4)}`
              : walletReg.isLoading
                ? "Loading..."
                : "No wallet registered"
          }
          // Logging into nasun.io implies the Nasun wallet is connected, so
          // a redundant "Connected" badge would only add noise. Keep the
          // "Linked" badge for the case where the wallet is registered to the
          // identity but not the currently-active session wallet.
          statusBadge={
            !showAsConnected && hasLinkedWallet ? (
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
                      className="w-8 h-8 rounded-xl border border-red-500/30 text-red-400 hover:border-red-400 hover:bg-red-500/10 transition-all flex items-center justify-center disabled:opacity-30"
                      onClick={async () => {
                        await walletReg.removeWalletByAddress(displayAddress!);
                        if (
                          nasunWalletAddress?.toLowerCase() === displayAddress
                        ) {
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

          <div className="text-sm">
            <button
              className="flex items-center gap-1.5 text-uju-secondary hover:text-pado-2 transition-colors font-normal uppercase tracking-widest"
              onClick={() => setDisclaimerExpanded((v) => !v)}
            >
              <svg
                className={`w-3.5 h-3.5 transition-transform ${disclaimerExpanded ? "rotate-90" : ""}`}
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
            {disclaimerExpanded && (
              <ul className="mt-3 space-y-2 pl-1 text-uju-secondary/80 leading-relaxed font-light">
                <li className="flex gap-2">
                  <span className="text-pado-2">•</span> Assets on Devnet have
                  no monetary value.
                </li>
                <li className="flex gap-2">
                  <span className="text-pado-2">•</span> The network may be
                  reset at any time.
                </li>
                <li className="flex gap-2">
                  <span className="text-pado-2">•</span> Your address is your
                  permanent identity on Nasun.
                </li>
                <li className="flex gap-2">
                  <span className="text-pado-2">•</span> Back up your Nasun
                  Wallet now to ensure recovery.
                </li>
              </ul>
            )}
          </div>
        </UjuAccountItem>

        {/* Additional Wallets */}
        {user.cognitoToken &&
          (displayAddress || walletReg.registeredWallets.length > 0) && (
            <div className="ml-5 pl-5 border-l border-uju-border/20 space-y-3">
              <div className="text-sm font-semibold text-uju-secondary/80 uppercase tracking-[0.2em]">
                Additional Wallets {walletReg.isLoading && "— Loading..."}
              </div>
              {additionalWallets.map((w) => {
                const addr = w.walletAddress;
                const short = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
                const isCurrent = nasunWalletAddress?.toLowerCase() === addr;
                return (
                  <div
                    key={addr}
                    className="flex items-center justify-between gap-4 p-3 bg-uju-bg/20 rounded-xl border border-uju-border/60"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm text-uju-primary font-mono font-normal truncate">
                        {short}
                      </span>
                      {isCurrent && <UjuConnectedBadge />}
                    </div>
                    <button
                      title="Remove"
                      className="w-7 h-7 rounded-lg border border-red-500/20 text-red-400 hover:border-red-400/40 hover:bg-red-500/5 transition-all flex items-center justify-center disabled:opacity-30"
                      onClick={async () => {
                        await walletReg.removeWalletByAddress(addr);
                        if (nasunWalletAddress?.toLowerCase() === addr) {
                          autoRegisterAttemptedRef.current = nasunWalletAddress;
                          sessionStorage.setItem(
                            "nasun:dismissed-wallet",
                            addr,
                          );
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

              {/* Connected but not registered */}
              {isNasunConnected &&
                nasunWalletAddress &&
                !walletReg.isCurrentWalletRegistered &&
                !walletReg.isLoading &&
                nasunWalletAddress.toLowerCase() !== displayAddress &&
                sessionStorage.getItem("nasun:dismissed-wallet") !==
                  nasunWalletAddress.toLowerCase() && (
                  <div className="flex items-center justify-between gap-4 p-3 bg-pado-2/5 rounded-xl border border-pado-2/20">
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

              <div className="flex justify-center pt-1">
                <UjuButton
                  size="xs"
                  variant="secondary"
                  onClick={() => {
                    sessionStorage.removeItem("nasun:dismissed-wallet");
                    autoRegisterAttemptedRef.current = null;
                    setAddWalletModalOpen(true);
                  }}
                >
                  Register Additional Nasun Wallet
                </UjuButton>
              </div>
            </div>
          )}

        {/* 2. X (Twitter) */}
        <UjuAccountItem
          provider="twitter"
          description="Required to join the Leaderboard"
          identifier={
            twitterData?.twitterHandle
              ? `@${twitterData.originalTwitterHandle || user.originalTwitterHandle || twitterData.twitterHandle}`
              : undefined
          }
          statusBadge={
            isTwitterPrimary ? (
              <UjuLoggedInBadge />
            ) : twitterData ? (
              <UjuLinkedBadge />
            ) : undefined
          }
          actions={[
            twitterData && !isTwitterPrimary ? (
              <UjuButton
                key="sync"
                size="xs"
                variant="secondary"
                onClick={() => {
                  if (
                    confirm(
                      "Update your profile from X? You'll be briefly redirected to X.",
                    )
                  ) {
                    handleLinkTwitter();
                  }
                }}
                disabled={isLinking}
              >
                Sync
              </UjuButton>
            ) : null,
            !twitterData ? (
              <UjuButton
                key="link"
                size="xs"
                variant="primary"
                onClick={handleLinkTwitter}
                disabled={isLinking}
              >
                Link
              </UjuButton>
            ) : !isTwitterPrimary ? (
              <UjuButton
                key="unlink"
                size="xs"
                variant="secondary"
                className="text-red-400 border-red-500/20 hover:border-red-500/40 !shadow-none hover:!shadow-none"
                onClick={() => unlinkAccount("Twitter")}
                disabled={isLinking}
              >
                Unlink
              </UjuButton>
            ) : null,
          ]}
        />

        {/* 3. Google */}
        <UjuAccountItem
          provider="google"
          description="Link to receive newsletters and updates"
          identifier={googleData?.email}
          statusBadge={
            isGooglePrimary ? (
              <UjuLoggedInBadge />
            ) : googleData ? (
              <UjuLinkedBadge />
            ) : undefined
          }
          actions={[
            !googleData ? (
              <UjuButton
                key="link"
                size="xs"
                variant="primary"
                onClick={handleLinkGoogle}
                disabled={isLinking}
              >
                Link
              </UjuButton>
            ) : !isGooglePrimary ? (
              <UjuButton
                key="unlink"
                size="xs"
                variant="secondary"
                className="text-red-400 border-red-500/20 hover:border-red-500/40 !shadow-none hover:!shadow-none"
                onClick={() => unlinkAccount("Google")}
                disabled={isLinking}
              >
                Unlink
              </UjuButton>
            ) : null,
          ]}
        />

        {/* 4. Telegram */}
        <UjuAccountItem
          provider="telegram"
          description={
            telegram.isVerified
              ? "Nasun channel membership verified"
              : "Join our channel first, then verify"
          }
          identifier={
            telegram.isLoading
              ? "Loading..."
              : telegram.isVerified
                ? telegram.telegramUsername
                  ? `@${telegram.telegramUsername}`
                  : "Verified"
                : "Not connected"
          }
          statusBadge={
            telegram.isVerified ? <UjuChannelMemberBadge /> : undefined
          }
          actions={[
            !telegram.isVerified && !telegram.isLoading ? (
              <UjuButton
                key="join"
                size="xs"
                variant="secondary"
                as="a"
                href="https://t.me/nasun_official"
                target="_blank"
                rel="noopener noreferrer"
              >
                Join
              </UjuButton>
            ) : null,
            !telegram.isVerified && !telegram.isLoading ? (
              <UjuButton
                key="connect"
                size="xs"
                variant="primary"
                onClick={telegram.connect}
                disabled={telegram.isVerifying}
              >
                {telegram.isVerifying ? "Verifying..." : "Verify"}
              </UjuButton>
            ) : null,
            telegram.isVerified ? (
              <UjuButton
                key="disconnect"
                size="xs"
                variant="secondary"
                className="text-red-400 border-red-500/20 hover:border-red-500/40 !shadow-none hover:!shadow-none"
                onClick={telegram.disconnect}
                disabled={telegram.isDisconnecting}
              >
                {telegram.isDisconnecting ? "Disconnecting..." : "Disconnect"}
              </UjuButton>
            ) : null,
          ]}
        />
      </div>

      {/* Paste-based external chain wallets (display-only). */}
      {user.cognitoToken && <ExternalChainSection />}

      <UjuAddWalletModal
        isOpen={addWalletModalOpen}
        onClose={() => setAddWalletModalOpen(false)}
      />
    </div>
  );

  if (bare) return <div className={className}>{content}</div>;

  return (
    <UjuCard className={`animate-fade-slide-up ${className}`}>
      {content}
    </UjuCard>
  );
};

export default UjuConnectedAccountsCard;
