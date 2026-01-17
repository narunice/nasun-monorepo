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
import { useUserStore } from "../../../store/userStore";
import { useVotingPower } from "@/features/governance/hooks/useVotingPower";
import { useDelegation } from "@/features/governance/hooks/useDelegation";
import { useVoteHistory } from "@/features/governance/hooks/useVoteHistory";
import { DashboardCard } from "../../ui/DashboardCard";
import { Button } from "../../ui/button";
import { useMetaMaskConnection } from "../../../hooks/wallet/useMetaMaskConnection";
import logger from "../../../lib/logger";
import {
  getConnectedWallet,
  connectWallet,
  onAccountsChanged,
  removeListener,
} from "../../../utils/metamaskUtils";
import { useWallet, useZkLogin } from "@nasun/wallet";
import { WalletConnect } from "@nasun/wallet-ui";

interface ProfileHeroCardProps {
  className?: string;
}

// Account icons
const AccountIcons: Record<string, React.ReactNode> = {
  twitter: <img src="/X_logo_2023.svg.png" alt="X" className="w-4 h-4 dark:invert" />,
  google: (
    <svg className="w-4 h-4" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  ),
  metamask: <img src="/MetaMask_Fox.svg" alt="MetaMask" className="w-4 h-4" />,
  nasun: <img src="/nasun_symbol_white.svg" alt="Nasun Wallet" className="w-4 h-4" />,
};

// Helper to get login method identifier for display
interface LoginIdentifier {
  label: string;
  value: string;
}

function getLoginIdentifier(user: {
  provider?: string;
  email?: string;
  twitterHandle?: string;
  walletAddress?: string;
} | null): LoginIdentifier | null {
  if (!user) return null;

  switch (user.provider) {
    case 'Google':
      return user.email
        ? { label: 'Google', value: user.email }
        : null;
    case 'Twitter':
      return user.twitterHandle
        ? { label: 'X', value: `@${user.twitterHandle}` }
        : null;
    case 'MetaMask':
      return user.walletAddress
        ? { label: 'Wallet', value: `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}` }
        : null;
    default:
      return null;
  }
}

// Unified Account Item Component
interface AccountItemProps {
  provider: "twitter" | "google" | "metamask" | "nasun";
  identifier?: string;
  statusBadge?: React.ReactNode;
  actions: React.ReactNode[];
  children?: React.ReactNode;
}

const AccountItem: FC<AccountItemProps> = ({ provider, identifier, statusBadge, actions, children }) => {
  const labels: Record<string, string> = {
    twitter: "X (Twitter)",
    google: "Google",
    metamask: "MetaMask",
    nasun: "Nasun Wallet",
  };

  return (
    <div className="flex flex-col py-3 px-4 bg-gray-800/60 rounded-xl border border-white/5 hover:border-white/10 transition-colors">
      <div className="flex items-center gap-3">
        {/* Icon */}
        <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-white/5 rounded-full">
          {AccountIcons[provider]}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-nasun-white">{labels[provider]}</span>
            {statusBadge}
          </div>
          <div className="text-xs text-nasun-white/50 truncate">
            {identifier || "Not linked"}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {actions}
        </div>
      </div>
      {children && <div className="mt-2 pl-11">{children}</div>}
    </div>
  );
};

export const ProfileHeroCard: FC<ProfileHeroCardProps> = ({ className = "" }) => {
  const { t } = useTranslation(["myAccount", "common"]);
  const { user } = useAuth();
  const updateUserProfile = useUserStore((state) => state.updateUserProfile);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isLinking, setIsLinking] = useState(false);
  const [activeWalletAddress, setActiveWalletAddress] = useState<string | null>(null);

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
      removeListener('accountsChanged', handleAccountsChanged as (...args: unknown[]) => void);
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
  // Helper: Status Badges
  // ------------------------------------------------------------------
  const ActiveBadge = () => (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 text-[10px] font-medium border border-green-500/20">
      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
      Active
    </span>
  );

  const LoggedInBadge = () => (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-nasun-c4/10 text-nasun-c4 text-[10px] font-medium border border-nasun-c4/20">
      <span className="w-1.5 h-1.5 rounded-full bg-nasun-c4" />
      Logged in
    </span>
  );

  const LinkedBadge = () => (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-700 text-gray-300 text-[10px] font-medium">
      Linked
    </span>
  );

  const ConnectedBadge = () => (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-nasun-c3/10 text-nasun-c3 text-[10px] font-medium border border-nasun-c3/20">
      <span className="w-1.5 h-1.5 rounded-full bg-nasun-c3" />
      Connected
    </span>
  );

  // ------------------------------------------------------------------
  // Link/Unlink Handlers
  // ------------------------------------------------------------------
  const handleLinkGoogle = async () => {
    setIsLinking(true);
    try {
      const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      const redirectUri = `${window.location.origin}/callback`;
      if (!googleClientId) throw new Error("Google Client ID is not configured");

      sessionStorage.setItem(
        "google_link_session",
        JSON.stringify({ primaryIdentityId: user?.identityId, isLinking: true })
      );
      localStorage.setItem("auth_provider_preference", "Google");

      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.append("client_id", googleClientId);
      authUrl.searchParams.append("redirect_uri", redirectUri);
      authUrl.searchParams.append("response_type", "id_token");
      authUrl.searchParams.append("scope", "openid email profile");
      authUrl.searchParams.append("nonce", Math.random().toString(36).substring(2));
      authUrl.searchParams.append("prompt", "select_account");
      window.location.href = authUrl.toString();
    } catch (err) {
      logger.error("Failed to link Google account:", err);
      alert("Failed to link Google account");
      setIsLinking(false);
    }
  };

  const handleLinkTwitter = async () => {
    setIsLinking(true);
    try {
      const twitterAuthApi = import.meta.env.VITE_TWITTER_AUTH_API;
      const response = await fetch(`${twitterAuthApi}/login?link=true`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json();
      sessionStorage.setItem(
        "twitter_link_session",
        JSON.stringify({ sessionId: data.sessionId, state: data.state, primaryIdentityId: user?.identityId })
      );
      localStorage.setItem("auth_provider_preference", "Twitter");
      window.location.href = data.authUrl;
    } catch (err) {
      logger.error("Failed to link Twitter account:", err);
      alert("Failed to link Twitter account");
      setIsLinking(false);
    }
  };

  const unlinkAccount = async (provider: string) => {
    if (!confirm(`Unlink ${provider} account?`)) return;
    setIsLinking(true);
    try {
      const linkAccountApi = import.meta.env.VITE_LINK_ACCOUNT_API;
      const response = await fetch(`${linkAccountApi}/unlink`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryIdentityId: user?.identityId, provider: provider.toLowerCase() }),
      });
      if (!response.ok) throw new Error("Failed to unlink");

      const userProfileApi = import.meta.env.VITE_USER_PROFILE_API;
      const profileResponse = await fetch(`${userProfileApi}?identityId=${user?.identityId}`);
      if (profileResponse.ok) {
        const updatedProfile = await profileResponse.json();
        updateUserProfile(updatedProfile);
        localStorage.setItem("nasun_user_profile", JSON.stringify(updatedProfile));
      }
      alert(`${provider} account unlinked successfully!`);
    } catch (err) {
      logger.error(`Failed to unlink ${provider} account:`, err);
      alert(`Failed to unlink ${provider} account`);
    } finally {
      setIsLinking(false);
    }
  };

  // ------------------------------------------------------------------
  // Data Preparation
  // ------------------------------------------------------------------
  if (!user) return <DashboardCard variant="hero" className={className}>Loading...</DashboardCard>;

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
  const isDifferentWalletActive = isMetaMaskLinked && activeWalletAddress && activeWalletAddress !== linkedWalletAddress;

  return (
    <DashboardCard variant="hero" className={className}>
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
              <h2 className="text-xl font-bold text-white">{displayName}</h2>
              {(() => {
                const loginId = getLoginIdentifier(user);
                return loginId ? (
                  <p className="text-nasun-white/60 text-sm">
                    <span className="text-nasun-c4 font-medium">{loginId.value}</span>
                  </p>
                ) : null;
              })()}
            </div>
          </div>

          {/* Connected Accounts List */}
          <div>
            <h5 className="text-xs font-bold text-nasun-white/40 uppercase tracking-wider mb-3">Connected Accounts</h5>
            <div className="space-y-2">
              
              {/* 1. X (Twitter) */}
              <AccountItem
                provider="twitter"
                identifier={twitterData?.twitterHandle ? `@${twitterData.twitterHandle}` : undefined}
                statusBadge={isTwitterPrimary ? <LoggedInBadge /> : (twitterData ? <LinkedBadge /> : undefined)}
                actions={[
                  !twitterData ? (
                    <Button key="link" size="xs" variant="filledOutlineC4" onClick={handleLinkTwitter} disabled={isLinking}>Link</Button>
                  ) : !isTwitterPrimary ? (
                    <Button key="unlink" size="xs" variant="filledOutlineScarlet" onClick={() => unlinkAccount("Twitter")} disabled={isLinking}>Unlink</Button>
                  ) : null
                ]}
              />

              {/* 2. Google */}
              <AccountItem
                provider="google"
                identifier={googleData?.email}
                statusBadge={isGooglePrimary ? <LoggedInBadge /> : (googleData ? <LinkedBadge /> : undefined)}
                actions={[
                  !googleData ? (
                    <Button key="link" size="xs" variant="filledOutlineC4" onClick={handleLinkGoogle} disabled={isLinking}>Link</Button>
                  ) : !isGooglePrimary ? (
                    <Button key="unlink" size="xs" variant="filledOutlineScarlet" onClick={() => unlinkAccount("Google")} disabled={isLinking}>Unlink</Button>
                  ) : null
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
                  isMetaMaskActive ? <ActiveBadge /> : 
                  isDifferentWalletActive ? <span className="text-[10px] text-yellow-500 font-medium bg-yellow-500/10 px-2 py-0.5 rounded-full border border-yellow-500/20">Different wallet active</span> :
                  isMetaMaskLinked ? <span className="text-[10px] text-gray-400 bg-white/5 px-2 py-0.5 rounded-full">Inactive</span> : undefined
                }
                actions={[
                  // Case 1: Not Linked -> Link Button with detected address hint
                  !isMetaMaskLinked ? (
                    <Button key="link" size="xs" variant="filledOutlineC4" onClick={handleLinkMetaMask} disabled={isMetaMaskLinking || isLinking}>
                      {isMetaMaskLinking 
                        ? "Linking..." 
                        : `Link Wallet${activeWalletAddress ? ` (${activeWalletAddress.slice(0, 6)}...)` : ""}`}
                    </Button>
                  ) : 
                  // Case 2: Linked but Inactive or Different -> Activate/Switch Button
                  (!isMetaMaskActive) ? (
                    <div key="actions" className="flex gap-2">
                      <Button size="xs" variant="filledOutlineC4" onClick={handleActivateMetaMask}>
                        {isDifferentWalletActive ? "Switch" : "Activate"}
                      </Button>
                      {!isMetaMaskPrimary && (
                        <Button size="xs" variant="filledOutlineScarlet" onClick={() => unlinkAccount("MetaMask")} disabled={isLinking}>Unlink</Button>
                      )}
                    </div>
                  ) : 
                  // Case 3: Active -> Unlink only (if not primary)
                  (!isMetaMaskPrimary) ? (
                    <Button key="unlink" size="xs" variant="filledOutlineScarlet" onClick={() => unlinkAccount("MetaMask")} disabled={isLinking}>Unlink</Button>
                  ) : null
                ]}
              />

              {/* 4. Nasun Wallet */}
              <AccountItem
                provider="nasun"
                identifier={isNasunConnected && nasunWalletAddress ? `${nasunWalletAddress.slice(0, 6)}...${nasunWalletAddress.slice(-4)}` : "Not connected"}
                statusBadge={isNasunConnected ? <ConnectedBadge /> : undefined}
                actions={[
                  <WalletConnect key="connect" dropdownPosition="bottom" dropdownAlign="right" />
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
            <p className="text-2xl font-bold text-white">{(votingPower?.leaderboardScore || 0 + (nftVerification?.nftBonus || 0) + (delegationState?.delegatorCount || 0) * 100).toLocaleString()}</p>
          </div>
          <div className="bg-gray-800/60 rounded-xl p-4 border border-white/5">
            <p className="text-xs text-nasun-white/60 uppercase tracking-wide mb-1">Participation</p>
            <p className="text-2xl font-bold text-white">{stats.participationRate.toFixed(0)}%</p>
          </div>
          <div className="bg-gray-800/60 rounded-xl p-4 border border-white/5">
            <p className="text-xs text-nasun-white/60 uppercase tracking-wide mb-1">NFT Status</p>
            <p className={`text-xl font-bold ${nftVerification?.nftBonus ? "text-nasun-c3" : "text-nasun-white/40"}`}>
              {nftVerification?.nftBonus ? "Verified" : "Not Verified"}
            </p>
          </div>
        </div>
      </div>
    </DashboardCard>
  );
};

export default ProfileHeroCard;
