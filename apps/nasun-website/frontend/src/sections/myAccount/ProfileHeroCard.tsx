/**
 * ProfileHeroCard Component
 *
 * Hero card for user profile display at the top of My Account dashboard.
 * Shows avatar, username, and a unified "Connected Accounts" section
 * managing both social logins and wallet connections.
 */

import { FC, useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/features/auth";
import { useVotingPower } from "@/features/governance/hooks/useVotingPower";
import { useDelegation } from "@/features/governance/hooks/useDelegation";
import { useVoteHistory } from "@/features/governance/hooks/useVoteHistory";
import { OuterBox } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { useMetaMaskConnection } from "../../hooks/wallet/useMetaMaskConnection";
import logger from "../../lib/logger";
import {
  getConnectedWallet,
  connectWallet,
  onAccountsChanged,
  removeListener,
} from "../../utils/metamaskUtils";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { WalletConnect } from "@nasun/wallet-ui";

import { AccountItem } from "./components/AccountItem";
import {
  ActiveBadge,
  ConnectedBadge,
  DifferentWalletBadge,
  InactiveBadge,
  LinkedBadge,
  LoggedInBadge,
} from "./components/StatusBadges";
import { useAccountLinking } from "./hooks/useAccountLinking";

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
    walletAddress?: string;
  } | null,
): LoginIdentifier | null {
  if (!user) return null;

  switch (user.provider) {
    case "Google":
      return user.email ? { label: "Google", value: user.email } : null;
    case "Twitter":
      return user.twitterHandle ? { label: "X", value: `@${user.twitterHandle}` } : null;
    case "MetaMask":
      return user.walletAddress
        ? {
            label: "Wallet",
            value: `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`,
          }
        : null;
    default:
      return null;
  }
}

export const ProfileHeroCard: FC<ProfileHeroCardProps> = ({ className = "" }) => {
  const { t } = useTranslation(["myAccount", "common"]);
  const { user } = useAuth();
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [activeWalletAddress, setActiveWalletAddress] = useState<string | null>(null);

  // Custom Hooks
  const { isLinking, handleLinkGoogle, handleLinkTwitter, unlinkAccount } = useAccountLinking({
    user,
  });

  // Nasun Wallet Hooks
  const { status, account } = useWallet();
  const { isConnected: isZkConnected } = useZkLogin();
  const isNasunConnected = (status === "unlocked" && account) || isZkConnected;
  const nasunWalletAddress = account?.address;

  // Voting power & Stats
  const { votingPower, nftVerification } = useVotingPower();
  const { delegationState } = useDelegation();
  const { stats } = useVoteHistory(1);

  // MetaMask Connection Logic
  const { handleConnect: handleLinkMetaMask, isConnecting: isMetaMaskLinking } =
    useMetaMaskConnection({
      mode: "link",
      onSuccess: async (address) => {
        logger.info("MetaMask wallet linked:", address);
        alert(t("userInfo.linkMetaMaskSuccess") || "MetaMask wallet linked and activated!");
        // Update active wallet state immediately
        setActiveWalletAddress(address.toLowerCase());
      },
      onError: (error) => {
        logger.error("Failed to link MetaMask account:", error);
        alert(error.message || "Failed to link MetaMask account");
      },
    });

  // Monitor MetaMask State
  useEffect(() => {
    const checkWallet = async () => {
      const address = await getConnectedWallet();
      if (address) {
        setActiveWalletAddress(address.toLowerCase());
      }
    };

    checkWallet();

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length > 0) {
        setActiveWalletAddress(accounts[0].toLowerCase());
      } else {
        setActiveWalletAddress(null);
      }
    };

    onAccountsChanged(handleAccountsChanged);

    return () => {
      removeListener("accountsChanged", handleAccountsChanged as (...args: unknown[]) => void);
    };
  }, []);

  const handleActivateMetaMask = async () => {
    try {
      const address = await connectWallet();
      setActiveWalletAddress(address.toLowerCase());
    } catch (error) {
      console.error("Failed to activate MetaMask:", error);
    }
  };

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

  // MetaMask Status Logic
  const isMetaMaskLinked = !!metamaskData;
  const linkedWalletAddress = metamaskData?.walletAddress?.toLowerCase();
  const isMetaMaskActive = isMetaMaskLinked && activeWalletAddress === linkedWalletAddress;
  const isDifferentWalletActive =
    isMetaMaskLinked && activeWalletAddress && activeWalletAddress !== linkedWalletAddress;

  return (
    <OuterBox color="c5" padding="sm" className={className}>
      <div className="flex flex-col lg:flex-row gap-8">
        {/* Left: User Info & Accounts */}
        <div className="flex-1 space-y-6">
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
            <h6 className="text-nasun-white/40 uppercase mb-3">Connected Accounts</h6>
            <div className="space-y-2">
              {/* 1. X (Twitter) */}
              <AccountItem
                provider="twitter"
                identifier={
                  twitterData?.twitterHandle ? `@${twitterData.twitterHandle}` : undefined
                }
                statusBadge={
                  isTwitterPrimary ? <LoggedInBadge /> : twitterData ? <LinkedBadge /> : undefined
                }
                actions={[
                  !twitterData ? (
                    <Button
                      key="link"
                      size="xs"
                      variant="filledOutlineC4"
                      onClick={handleLinkTwitter}
                      disabled={isLinking}
                    >
                      Link
                    </Button>
                  ) : !isTwitterPrimary ? (
                    <Button
                      key="unlink"
                      size="xs"
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
                      size="xs"
                      variant="filledOutlineC4"
                      onClick={handleLinkGoogle}
                      disabled={isLinking}
                    >
                      Link
                    </Button>
                  ) : !isGooglePrimary ? (
                    <Button
                      key="unlink"
                      size="xs"
                      variant="filledOutlineScarlet"
                      onClick={() => unlinkAccount("Google")}
                      disabled={isLinking}
                    >
                      Unlink
                    </Button>
                  ) : null,
                ]}
              />

              {/* 3. MetaMask */}
              <AccountItem
                provider="metamask"
                identifier={
                  isMetaMaskLinked
                    ? `${linkedWalletAddress?.slice(0, 6)}...${linkedWalletAddress?.slice(-4)}`
                    : "Not linked"
                }
                statusBadge={
                  isMetaMaskActive ? (
                    <ActiveBadge />
                  ) : isDifferentWalletActive ? (
                    <DifferentWalletBadge />
                  ) : isMetaMaskLinked ? (
                    <InactiveBadge />
                  ) : undefined
                }
                actions={[
                  // Case 1: Not Linked -> Link Button with detected address hint
                  !isMetaMaskLinked ? (
                    <Button
                      key="link"
                      size="xs"
                      variant="filledOutlineC4"
                      onClick={handleLinkMetaMask}
                      disabled={isMetaMaskLinking || isLinking}
                    >
                      {isMetaMaskLinking
                        ? "Linking..."
                        : `Link Wallet${activeWalletAddress ? ` (${activeWalletAddress.slice(0, 6)}...)` : ""}`}
                    </Button>
                  ) : // Case 2: Linked but Inactive or Different -> Activate/Switch Button
                  !isMetaMaskActive ? (
                    <div key="actions" className="flex gap-2">
                      <Button size="xs" variant="filledOutlineC4" onClick={handleActivateMetaMask}>
                        {isDifferentWalletActive ? "Switch" : "Activate"}
                      </Button>
                      {!isMetaMaskPrimary && (
                        <Button
                          size="xs"
                          variant="filledOutlineScarlet"
                          onClick={() => unlinkAccount("MetaMask")}
                          disabled={isLinking}
                        >
                          Unlink
                        </Button>
                      )}
                    </div>
                  ) : // Case 3: Active -> Unlink only (if not primary)
                  !isMetaMaskPrimary ? (
                    <Button
                      key="unlink"
                      size="xs"
                      variant="filledOutlineScarlet"
                      onClick={() => unlinkAccount("MetaMask")}
                      disabled={isLinking}
                    >
                      Unlink
                    </Button>
                  ) : null,
                ]}
              />

              {/* 4. Nasun Wallet */}
              <AccountItem
                provider="nasun"
                identifier={
                  isNasunConnected && nasunWalletAddress
                    ? `${nasunWalletAddress.slice(0, 6)}...${nasunWalletAddress.slice(-4)}`
                    : "Not connected"
                }
                statusBadge={isNasunConnected ? <ConnectedBadge /> : undefined}
                actions={[
                  <WalletConnect key="connect" dropdownPosition="bottom" dropdownAlign="right" />,
                ]}
              >
                <p className="text-[10px] text-nasun-c4/80 leading-relaxed">
                  * This is a prototype on Devnet. The network may be reset at any time.
                </p>
              </AccountItem>
            </div>
          </div>
        </div>

        {/* Right: Stats (Same as before) */}
        <div className="lg:w-64 flex flex-col gap-3 pt-2">
          <div className="bg-gray-800/60 rounded-xl p-4 border border-white/5">
            <p className="text-xs text-nasun-white/60 uppercase tracking-wide mb-1">Voting Power</p>
            <p className="text-2xl font-bold text-white">
              {(
                votingPower?.leaderboardScore ||
                0 + (nftVerification?.nftBonus || 0) + (delegationState?.delegatorCount || 0) * 100
              ).toLocaleString()}
            </p>
          </div>
          <div className="bg-gray-800/60 rounded-xl p-4 border border-white/5">
            <p className="text-xs text-nasun-white/60 uppercase tracking-wide mb-1">
              Participation
            </p>
            <p className="text-2xl font-bold text-white">{stats.participationRate.toFixed(0)}%</p>
          </div>
          <div className="bg-gray-800/60 rounded-xl p-4 border border-white/5">
            <p className="text-xs text-nasun-white/60 uppercase tracking-wide mb-1">NFT Status</p>
            <p
              className={`text-xl font-bold ${nftVerification?.nftBonus ? "text-nasun-c3" : "text-nasun-white/40"}`}
            >
              {nftVerification?.nftBonus ? "Verified" : "Not Verified"}
            </p>
          </div>
        </div>
      </div>
    </OuterBox>
  );
};

export default ProfileHeroCard;
