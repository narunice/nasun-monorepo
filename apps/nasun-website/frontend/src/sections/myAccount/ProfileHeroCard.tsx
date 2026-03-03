/**
 * ProfileHeroCard Component
 *
 * Hero card for user profile display at the top of My Account dashboard.
 * Shows avatar, username, and a unified "Connected Accounts" section
 * managing both social logins and wallet connections.
 */

import { FC, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "react-toastify";
import { useAuth } from "@/features/auth";
import { OuterBox } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { useWalletAuth } from "@/features/wallet/hooks/useWalletAuth";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { WalletConnect } from "@nasun/wallet-ui";

import { AccountItem } from "./components/AccountItem";
import {
  ChannelMemberBadge,
  ConnectedBadge,
  LinkedBadge,
  LoggedInBadge,
} from "./components/StatusBadges";
import { useAccountLinking } from "./hooks/useAccountLinking";
import { useTelegramVerify } from "./hooks/useTelegramVerify";

interface ProfileHeroCardProps {
  className?: string;
}

// Helper to get login method identifier for display
interface LoginIdentifier {
  label: string;
  value: string;
}

function getLoginIdentifier(
  user: {
    provider?: string;
    email?: string;
    twitterHandle?: string;
    originalTwitterHandle?: string;
    walletAddress?: string;
  } | null,
): LoginIdentifier | null {
  if (!user) return null;

  switch (user.provider) {
    case "Google":
      return user.email ? { label: "Google", value: user.email } : null;
    case "Twitter": {
      // Use original casing if available, fallback to twitterHandle
      const displayHandle = user.originalTwitterHandle || user.twitterHandle;
      return displayHandle ? { label: "X", value: `@${displayHandle}` } : null;
    }
    case "MetaMask":
      // Legacy: existing users stored "MetaMask" as provider
      return user.walletAddress
        ? {
            label: "Wallet",
            value: `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`,
          }
        : null;
    default:
      // New wallet logins store connector.name (e.g., "Coinbase Wallet", "Rainbow")
      return user.walletAddress
        ? {
            label: "Wallet",
            value: `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`,
          }
        : null;
  }
}

export const ProfileHeroCard: FC<ProfileHeroCardProps> = ({ className = "" }) => {
  const { t } = useTranslation(["myAccount", "common"]);
  const { user } = useAuth();
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Custom Hooks
  const { isLinking, handleLinkGoogle, handleLinkTwitter, unlinkAccount } = useAccountLinking({
    user,
  });
  const telegram = useTelegramVerify({ user });

  // Nasun Wallet Hooks
  const { status, account } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const isNasunConnected = (status === "unlocked" && account) || isZkConnected;
  const nasunWalletAddress = account?.address;

  // EVM Wallet Link via wagmi + RainbowKit
  const { connect: handleLinkWallet, isAuthenticating: isWalletLinking, error: walletLinkError } =
    useWalletAuth({
      mode: "link",
      onSuccess: () => {
        toast.success(t("userInfo.linkMetaMaskSuccess") || "Wallet linked successfully!");
      },
      onError: (error) => {
        toast.error(error.message || "Failed to link wallet");
      },
    });

  const handleImageError = useCallback(() => setImageError(true), []);
  const handleImageLoad = useCallback(() => setImageLoaded(true), []);

  // Display Name & Avatar
  const displayName = user?.username || user?.twitterHandle || user?.email?.split("@")[0] || "User";
  const profileImageUrl = user?.profileImageUrl;

  // ------------------------------------------------------------------
  // Data Preparation
  // ------------------------------------------------------------------
  if (!user)
    return (
      <OuterBox color="c1" padding="sm" className={className}>
        Loading...
      </OuterBox>
    );

  // Providers
  const isTwitterPrimary = user.provider === "Twitter";
  const isGooglePrimary = user.provider === "Google";
  const isMetaMaskPrimary = user.provider === "MetaMask";

  // Linked Data
  const twitterData = isTwitterPrimary ? user : user.linkedAccounts?.twitter;
  const googleData = isGooglePrimary ? user : user.linkedAccounts?.google;
  const metamaskData = isMetaMaskPrimary ? user : user.linkedAccounts?.metamask;

  // Wallet Status: 3 states — Not Linked / Linked / Primary
  const isMetaMaskLinked = !!metamaskData;
  const linkedWalletAddress = metamaskData?.walletAddress?.toLowerCase();

  return (
    <OuterBox color="nw1" padding="sm" className={`animate-fade-slide-up ${className}`}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="relative">
            {profileImageUrl && !imageError ? (
              <img
                src={profileImageUrl}
                alt={displayName}
                className={`w-16 h-16 rounded-2xl object-cover bg-gray-800 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
                onError={handleImageError}
                onLoad={handleImageLoad}
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-nasun-c4 to-nasun-c5 flex items-center justify-center text-white text-2xl font-bold">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <h6 className="font-semibold">{displayName}</h6>
            {(() => {
              const loginId = getLoginIdentifier(user);
              return loginId ? (
                <p className="text-nasun-white/60">
                  <span className="text-slate-400 font-medium text-sm lg:text-base">
                    {loginId.value}
                  </span>
                </p>
              ) : null;
            })()}
          </div>
        </div>

        {/* Connected Accounts List */}
        <div>
          <h6 className="text-sm lg:text-base text-nasun-white/40 uppercase mb-1 md:mb-1 lg:mb-2">
            Connected Accounts
          </h6>
          <div className="space-y-3">
            {/* 1. X (Twitter) */}
            <AccountItem
              provider="twitter"
              identifier={
                twitterData?.twitterHandle
                  ? `@${twitterData.originalTwitterHandle || user.originalTwitterHandle || twitterData.twitterHandle}`
                  : undefined
              }
              statusBadge={
                isTwitterPrimary ? <LoggedInBadge /> : twitterData ? <LinkedBadge /> : undefined
              }
              actions={[
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

            {/* 2. Google */}
            <AccountItem
              provider="google"
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

            {/* 3. Wallet (EVM) */}
            <AccountItem
              provider="wallet"
              identifier={
                isMetaMaskLinked
                  ? `${linkedWalletAddress?.slice(0, 6)}...${linkedWalletAddress?.slice(-4)}`
                  : "Not linked"
              }
              statusBadge={
                isMetaMaskPrimary ? (
                  <LoggedInBadge />
                ) : isMetaMaskLinked ? (
                  <LinkedBadge />
                ) : undefined
              }
              actions={[
                !isMetaMaskLinked ? (
                  <Button
                    key="link"
                    size="sm"
                    variant="filledOutlineC7"
                    onClick={handleLinkWallet}
                    disabled={isWalletLinking || isLinking}
                  >
                    {isWalletLinking ? "Linking..." : "Link"}
                  </Button>
                ) : !isMetaMaskPrimary ? (
                  <Button
                    key="unlink"
                    size="sm"
                    variant="filledOutlineScarlet"
                    onClick={() => unlinkAccount("MetaMask")}
                    disabled={isLinking}
                  >
                    Unlink
                  </Button>
                ) : null,
              ]}
            >
              {walletLinkError && (
                <div className="text-sm text-red-400 px-2 py-1">{walletLinkError}</div>
              )}
            </AccountItem>

            {/* 4. Telegram */}
            <AccountItem
              provider="telegram"
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
                  <Button
                    key="connect"
                    size="sm"
                    variant="filledOutlineC7"
                    onClick={telegram.connect}
                    disabled={telegram.isVerifying}
                  >
                    {telegram.isVerifying ? "Verifying..." : "Connect"}
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

            {/* 5. Nasun Wallet */}
            <AccountItem
              provider="nasun"
              identifier={
                isNasunConnected && nasunWalletAddress
                  ? `${nasunWalletAddress.slice(0, 6)}...${nasunWalletAddress.slice(-4)}`
                  : "Not connected"
              }
              statusBadge={isNasunConnected ? <ConnectedBadge /> : undefined}
              actions={[
                <div key="connect" className="nasun-wallet-connect relative z-50">
                  <WalletConnect
                    variant="filledOutlineC7"
                    size="sm"
                    dropdownPosition="bottom"
                    dropdownAlign="right"
                  />
                </div>,
              ]}
            >
              <p className="text-xs text-nasun-white/60 leading-relaxed">
                * This is a prototype on Devnet. Test purpose only.
              </p>
            </AccountItem>
          </div>
        </div>
      </div>
    </OuterBox>
  );
};

export default ProfileHeroCard;
