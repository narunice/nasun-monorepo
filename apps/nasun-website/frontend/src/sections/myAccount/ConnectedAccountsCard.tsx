/**
 * ConnectedAccountsCard Component
 *
 * Manages social logins and wallet connections.
 * Extracted from ProfileHeroCard to reduce its size and responsibilities.
 */

import { FC, useState } from "react";
import { useAuth } from "@/features/auth";
import { OuterBox } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { WalletConnect } from "@nasun/wallet-ui";

import { AccountItem } from "./components/AccountItem";
import { AddWalletModal } from "./components/AddWalletModal";
import { EvmWalletSection } from "./components/EvmWalletLink";
import {
  ChannelMemberBadge,
  ConnectedBadge,
  LinkedBadge,
  LoggedInBadge,
} from "./components/StatusBadges";
import { useAccountLinking } from "./hooks/useAccountLinking";
import { useTelegramVerify } from "./hooks/useTelegramVerify";
import { useWalletRegistration } from "./hooks/useWalletRegistration";
import { useNasunWalletState } from "./hooks/useNasunWalletState";

interface ConnectedAccountsCardProps {
  className?: string;
  /** Render without OuterBox wrapper (for embedding inside another card). */
  bare?: boolean;
}

export const ConnectedAccountsCard: FC<ConnectedAccountsCardProps> = ({ className = "", bare = false }) => {
  const { user } = useAuth();
  const [disclaimerExpanded, setDisclaimerExpanded] = useState(false);
  const [addWalletModalOpen, setAddWalletModalOpen] = useState(false);
  const [walletFlowActive, setWalletFlowActive] = useState(false);

  // Hooks
  const { isLinking, handleLinkGoogle, handleLinkTwitter, unlinkAccount } = useAccountLinking({ user });
  const telegram = useTelegramVerify({ user });
  const walletReg = useWalletRegistration();
  const walletState = useNasunWalletState(user, walletReg);

  if (!user) {
    if (bare) return <div className={className}>Loading...</div>;
    return (
      <OuterBox color="c5" padding="sm" className={className}>
        Loading...
      </OuterBox>
    );
  }

  // Providers
  const isTwitterPrimary = user.provider === "Twitter";
  const isGooglePrimary = user.provider === "Google";
  const isMetaMaskPrimary = user.provider === "MetaMask";

  // Linked Data
  const twitterData = isTwitterPrimary ? user : user.linkedAccounts?.twitter;
  const googleData = isGooglePrimary ? user : user.linkedAccounts?.google;
  const metamaskData = isMetaMaskPrimary ? user : user.linkedAccounts?.metamask;
  const isMetaMaskLinked = !!metamaskData;
  const evmWalletAddress = metamaskData?.walletAddress?.toLowerCase();

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
    <>
    <div>
      <h5 className="font-medium uppercase text-nasun-white mb-4">
        CONNECTED WALLETS & SOCIAL ACCOUNTS
      </h5>
      <div className="space-y-3">
        {/* 1. Nasun Wallet */}
          <AccountItem
            provider="nasun"
            identifier={
              displayAddress
                ? `${displayAddress.slice(0, 6)}...${displayAddress.slice(-4)}`
                : walletReg.isLoading ? "Loading..." : "No wallet registered"
            }
            statusBadge={
              showAsConnected
                ? <ConnectedBadge />
                : hasLinkedWallet
                  ? <LinkedBadge />
                  : undefined
            }
            actions={
              !user.cognitoToken ? [
                <div key="connect" className="nasun-wallet-connect relative z-50">
                  <WalletConnect
                    variant="filledOutlineC7"
                    size="sm"
                    dropdownPosition="bottom"
                    dropdownAlign="right"
                  />
                </div>,
              ] : isPrimaryRegistered && !isProfileWallet ? [
                <button
                  key="remove-primary"
                  title="Remove"
                  className="group relative w-6 h-6 rounded-full border border-red-500/40 text-red-400/60 hover:border-red-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 flex items-center justify-center disabled:opacity-30"
                  onClick={async () => {
                    await walletReg.removeWalletByAddress(displayAddress!);
                    if (nasunWalletAddress?.toLowerCase() === displayAddress) {
                      autoRegisterAttemptedRef.current = nasunWalletAddress;
                      sessionStorage.setItem('nasun:dismissed-wallet', displayAddress!);
                    }
                  }}
                  disabled={walletReg.isRemoving === displayAddress}
                >
                  {walletReg.isRemoving === displayAddress ? (
                    <span className="text-sm">...</span>
                  ) : (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14" />
                    </svg>
                  )}
                </button>,
              ] : showAsConnected && !walletReg.isCurrentWalletRegistered && !walletReg.isLoading ? [
                walletReg.isRegistering ? (
                  <span key="registering" className="text-sm text-nasun-white/40">Registering...</span>
                ) : (
                  <Button
                    key="register"
                    size="sm"
                    variant="filledOutlineC7"
                    onClick={() => {
                      sessionStorage.removeItem('nasun:dismissed-wallet');
                      autoRegisterAttemptedRef.current = null;
                      walletReg.registerCurrentWallet();
                    }}
                  >
                    Register
                  </Button>
                ),
              ] : []
            }
          >
            {/* Connect Wallet prompt */}
            {user.cognitoToken && (!displayAddress || walletFlowActive) && !walletReg.isLoading && (
              <div className="mb-3" onClick={() => {
                setWalletFlowActive(true);
                sessionStorage.removeItem('nasun:dismissed-wallet');
                autoRegisterAttemptedRef.current = null;
              }}>
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
            {/* Collapsible devnet disclaimer */}
            <div className="text-sm text-nasun-white/50">
              <button
                className="flex items-center gap-1 hover:text-nasun-white/70 transition-colors"
                onClick={() => setDisclaimerExpanded((v) => !v)}
              >
                <svg
                  className={`w-3 h-3 flex-shrink-0 transition-transform ${disclaimerExpanded ? "rotate-90" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Devnet notice
              </button>
              {disclaimerExpanded && (
                <ul className="mt-1.5 space-y-1 pl-1 text-sm text-nasun-white/40 leading-relaxed">
                  <li>· Assets on Devnet have no monetary value.</li>
                  <li>· The network may be reset at any time.</li>
                  <li>· After a reset, your existing seedphrase, private key, or backup file will restore the same address - your permanent identity on Nasun Website.</li>
                  <li>· Back up your Nasun Wallet now. Even after a Devnet reset, your backup will restore the same address. zkLogin users do not need a separate backup.</li>
                </ul>
              )}
            </div>
          </AccountItem>

          {/* Additional Wallets sub-section */}
          {user.cognitoToken && (displayAddress || walletReg.registeredWallets.length > 0) && (
            <div className="pl-2 border-l-2 border-indigo-500/20 space-y-2">
              <div className="text-sm text-nasun-white/40 uppercase">
                Additional Wallets
                {walletReg.isLoading && " (loading...)"}
              </div>
              {additionalWallets.map((w) => {
                const addr = w.walletAddress;
                const short = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
                const isCurrent = nasunWalletAddress?.toLowerCase() === addr;
                return (
                  <div key={addr} className="flex items-center justify-between gap-2 text-base">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-nasun-white/80 font-mono truncate">{short}</span>
                      {isCurrent && <ConnectedBadge />}
                    </div>
                    <button
                      title="Remove"
                      className="group relative w-6 h-6 rounded-full border border-red-500/40 text-red-400/60 hover:border-red-400 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 flex items-center justify-center disabled:opacity-30"
                      onClick={async () => {
                        await walletReg.removeWalletByAddress(addr);
                        if (nasunWalletAddress?.toLowerCase() === addr) {
                          autoRegisterAttemptedRef.current = nasunWalletAddress;
                          sessionStorage.setItem('nasun:dismissed-wallet', addr);
                        }
                      }}
                      disabled={walletReg.isRemoving === addr}
                    >
                      {walletReg.isRemoving === addr ? (
                        <span className="text-sm">...</span>
                      ) : (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14" />
                        </svg>
                      )}
                    </button>
                  </div>
                );
              })}
              {/* Connected but not registered fallback */}
              {isNasunConnected && nasunWalletAddress && !walletReg.isCurrentWalletRegistered && !walletReg.isLoading &&
                nasunWalletAddress.toLowerCase() !== displayAddress &&
                sessionStorage.getItem('nasun:dismissed-wallet') !== nasunWalletAddress.toLowerCase() && (
                <div className="flex items-center justify-between gap-2 text-base">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-nasun-white/80 font-mono truncate">
                      {nasunWalletAddress.slice(0, 6)}...{nasunWalletAddress.slice(-4)}
                    </span>
                    <ConnectedBadge />
                  </div>
                  {walletReg.isRegistering ? (
                    <span className="text-sm text-nasun-white/40">Registering...</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="filledOutlineC7"
                      onClick={() => {
                        sessionStorage.removeItem('nasun:dismissed-wallet');
                        autoRegisterAttemptedRef.current = null;
                        walletReg.registerCurrentWallet();
                      }}
                    >
                      Register
                    </Button>
                  )}
                </div>
              )}
              {walletReg.error && (
                <p className="text-sm text-red-400">{walletReg.error}</p>
              )}
              <Button
                size="sm"
                variant="filledOutlineC7"
                onClick={() => {
                  sessionStorage.removeItem('nasun:dismissed-wallet');
                  autoRegisterAttemptedRef.current = null;
                  setAddWalletModalOpen(true);
                }}
              >
                Add
              </Button>
            </div>
          )}

          {/* 2. X (Twitter) */}
          <AccountItem
            provider="twitter"
            description="Required to join the Leaderboard"
            identifier={
              twitterData?.twitterHandle
                ? `@${twitterData.originalTwitterHandle || user.originalTwitterHandle || twitterData.twitterHandle}`
                : undefined
            }
            statusBadge={
              isTwitterPrimary ? <LoggedInBadge /> : twitterData ? <LinkedBadge /> : undefined
            }
            actions={[
              twitterData && !isTwitterPrimary ? (
                <Button
                  key="sync"
                  size="sm"
                  variant="filledOutlineC7"
                  onClick={() => {
                    if (confirm("Update your profile from X? You'll be briefly redirected to X.")) {
                      handleLinkTwitter();
                    }
                  }}
                  disabled={isLinking}
                >
                  Sync
                </Button>
              ) : null,
              !twitterData ? (
                <Button
                  key="link"
                  size="sm"
                  variant="filledOutlineC7"
                  onClick={handleLinkTwitter}
                  disabled={isLinking}
                >
                  Link
                </Button>
              ) : !isTwitterPrimary ? (
                <Button
                  key="unlink"
                  size="sm"
                  variant="filledOutlineScarlet"
                  onClick={() => unlinkAccount("Twitter")}
                  disabled={isLinking}
                >
                  Unlink
                </Button>
              ) : null,
            ]}
          />

          {/* 3. Google */}
          <AccountItem
            provider="google"
            description="Link to receive newsletters and updates"
            identifier={googleData?.email}
            statusBadge={
              isGooglePrimary ? <LoggedInBadge /> : googleData ? <LinkedBadge /> : undefined
            }
            actions={[
              !googleData ? (
                <Button
                  key="link"
                  size="sm"
                  variant="filledOutlineC7"
                  onClick={handleLinkGoogle}
                  disabled={isLinking}
                >
                  Link
                </Button>
              ) : !isGooglePrimary ? (
                <Button
                  key="unlink"
                  size="sm"
                  variant="filledOutlineScarlet"
                  onClick={() => unlinkAccount("Google")}
                  disabled={isLinking}
                >
                  Unlink
                </Button>
              ) : null,
            ]}
          />

          {/* 4. Telegram */}
          <AccountItem
            provider="telegram"
            description={telegram.isVerified ? "Nasun channel membership verified" : "Join our channel first, then verify"}
            identifier={
              telegram.isLoading
                ? "Loading..."
                : telegram.isVerified
                  ? telegram.telegramUsername
                    ? `@${telegram.telegramUsername}`
                    : "Verified"
                  : "Not connected"
            }
            statusBadge={telegram.isVerified ? <ChannelMemberBadge /> : undefined}
            actions={[
              !telegram.isVerified && !telegram.isLoading ? (
                <Button key="join" size="sm" variant="filledOutlineC7" asChild>
                  <a href="https://t.me/nasun_official" target="_blank" rel="noopener noreferrer">
                    Join
                  </a>
                </Button>
              ) : null,
              !telegram.isVerified && !telegram.isLoading ? (
                <Button
                  key="connect"
                  size="sm"
                  variant="filledOutlineC7"
                  onClick={telegram.connect}
                  disabled={telegram.isVerifying}
                >
                  {telegram.isVerifying ? "Verifying..." : "Verify"}
                </Button>
              ) : null,
              telegram.isVerified ? (
                <Button
                  key="disconnect"
                  size="sm"
                  variant="filledOutlineScarlet"
                  onClick={telegram.disconnect}
                  disabled={telegram.isDisconnecting}
                >
                  {telegram.isDisconnecting ? "Disconnecting..." : "Disconnect"}
                </Button>
              ) : null,
            ]}
          />

          {/* 5. EVM Wallet */}
          <EvmWalletSection
            evmWalletAddress={evmWalletAddress}
            isMetaMaskPrimary={isMetaMaskPrimary}
            isMetaMaskLinked={isMetaMaskLinked}
            unlinkAccount={unlinkAccount}
            isLinking={isLinking}
          />
        </div>
      </div>
      <AddWalletModal
        isOpen={addWalletModalOpen}
        onClose={() => setAddWalletModalOpen(false)}
      />
    </>
  );

  if (bare) return <div className={className}>{content}</div>;

  return (
    <OuterBox color="c5" padding="sm" className={`animate-fade-slide-up ${className}`}>
      {content}
    </OuterBox>
  );
};

export default ConnectedAccountsCard;
