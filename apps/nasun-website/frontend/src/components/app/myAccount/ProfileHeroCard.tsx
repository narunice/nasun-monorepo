/**
 * ProfileHeroCard Component
 *
 * Hero card for user profile display at the top of My Account dashboard.
 * Shows avatar, username, connected accounts with Link/Unlink buttons, and key stats.
 */

import { FC, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../../providers/auth/AuthContext";
import { useUserStore } from "../../../store/userStore";
import { useVotingPower } from "@/features/governance/hooks/useVotingPower";
import { useDelegation } from "@/features/governance/hooks/useDelegation";
import { useVoteHistory } from "@/features/governance/hooks/useVoteHistory";
import { useUserRankHistory } from "../Leaderboard/hooks/useUserRankHistory";
import { CumulativePeriod, DateRangeOption } from "../Leaderboard/types/leaderboard";
import { DashboardCard } from "../../ui/DashboardCard";
import { Button } from "../../ui/button";
import { useMetaMaskConnection } from "../../../hooks/wallet/useMetaMaskConnection";
import logger from "../../../lib/logger";

interface ProfileHeroCardProps {
  className?: string;
}

// Social account icons
const SocialIcons: Record<string, React.ReactNode> = {
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
};

// Social account item with Link/Unlink button
interface SocialAccountItemProps {
  provider: "twitter" | "google" | "metamask";
  isConnected: boolean;
  isPrimary: boolean;
  displayValue?: string;
  onLink: () => void;
  onUnlink: () => void;
  isLinking: boolean;
}

const SocialAccountItem: FC<SocialAccountItemProps> = ({
  provider,
  isConnected,
  isPrimary,
  displayValue,
  onLink,
  onUnlink,
  isLinking,
}) => {
  const labels: Record<string, string> = {
    twitter: "X",
    google: "Google",
    metamask: "MetaMask",
  };

  return (
    <div className="flex items-center gap-2 py-2 px-3 bg-gray-800/80 rounded-lg">
      {/* Icon */}
      {SocialIcons[provider]}
      {/* Label */}
      <span className="text-nasun-white">{labels[provider]}</span>
      {/* Display value */}
      {isConnected && displayValue && (
        <span className="text-nasun-white/60 truncate max-w-[120px]">{displayValue}</span>
      )}
      {/* Checkmark */}
      {isConnected && <span className="text-green-400">✓</span>}
      {/* Spacer */}
      <div className="flex-1" />
      {/* Action button */}
      {isPrimary ? (
        <span className="text-sm text-nasun-c3 bg-nasun-c3/20 px-2 py-0.5 rounded whitespace-nowrap">
          Logged in
        </span>
      ) : isConnected ? (
        <Button variant="filledOutlineScarlet" size="xs" onClick={onUnlink} disabled={isLinking}>
          {isLinking ? "..." : "Unlink"}
        </Button>
      ) : (
        <Button variant="filledOutlineC4" size="xs" onClick={onLink} disabled={isLinking}>
          {isLinking ? "..." : "Link"}
        </Button>
      )}
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
  const [linkError, setLinkError] = useState<string | null>(null);

  // Voting power data
  const { votingPower, nftVerification } = useVotingPower();
  const { delegationState } = useDelegation();
  const { stats } = useVoteHistory(1);

  // Get current rank from API
  const twitterHandle = user?.twitterHandle || user?.linkedAccounts?.twitter?.twitterHandle;
  const { data: rankHistory } = useUserRankHistory({
    username: twitterHandle || "",
    period: CumulativePeriod.CUMULATIVE,
    days: DateRangeOption.DAYS_7,
    enabled: !!twitterHandle,
  });

  // MetaMask connection hook for linking
  const { handleConnect: handleMetaMaskConnect, isConnecting: isMetaMaskConnecting } =
    useMetaMaskConnection({
      mode: "link",
      onSuccess: (address) => {
        logger.info("MetaMask wallet linked successfully:", address);
        alert(t("userInfo.linkMetaMaskSuccess") || "MetaMask wallet linked successfully!");
      },
      onError: (error) => {
        logger.error("Failed to link MetaMask account:", error);
        setLinkError(error.message || "Failed to link MetaMask account");
      },
    });

  const handleImageError = useCallback(() => setImageError(true), []);
  const handleImageLoad = useCallback(() => setImageLoaded(true), []);

  // Get user info
  const displayName = user?.username || user?.twitterHandle || user?.email?.split("@")[0] || "User";
  const profileImageUrl = user?.profileImageUrl;

  // Determine connected accounts
  const isTwitterConnected = user?.provider === "Twitter" || !!user?.linkedAccounts?.twitter;
  const isGoogleConnected = user?.provider === "Google" || !!user?.linkedAccounts?.google;
  const isMetaMaskConnected = user?.provider === "MetaMask" || !!user?.linkedAccounts?.metamask;

  // Primary providers
  const isTwitterPrimary = user?.provider === "Twitter" && !user?.linkedAccounts?.twitter;
  const isGooglePrimary = user?.provider === "Google" && !user?.linkedAccounts?.google;
  const isMetaMaskPrimary = user?.provider === "MetaMask" && !user?.linkedAccounts?.metamask;

  // Calculate stats
  const basePower = votingPower?.leaderboardScore || 1;
  const nftBonus = nftVerification?.nftBonus || 0;
  const delegatedPower = delegationState?.delegatorCount ? delegationState.delegatorCount * 100 : 0;
  const totalVotingPower = basePower + nftBonus + delegatedPower;

  // Get current rank from API data
  const currentRank = rankHistory?.history[0]?.rank ? `#${rankHistory.history[0].rank}` : "-";

  // NFT status
  const hasNft = nftBonus > 0;
  const nftStatus = hasNft ? "Verified" : "-";

  // Participation rate
  const participationRate = `${stats.participationRate.toFixed(0)}%`;

  // Link/Unlink handlers
  const handleLinkGoogle = async () => {
    setIsLinking(true);
    setLinkError(null);
    try {
      const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      const redirectUri = `${window.location.origin}/callback`;
      if (!googleClientId) throw new Error("Google Client ID is not configured");

      sessionStorage.setItem(
        "google_link_session",
        JSON.stringify({
          primaryIdentityId: user?.identityId,
          isLinking: true,
        })
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
      logger.error("Failed to start Google linking:", err);
      setLinkError(err instanceof Error ? err.message : "Failed to link Google account");
      setIsLinking(false);
    }
  };

  const handleLinkTwitter = async () => {
    setIsLinking(true);
    setLinkError(null);
    try {
      const twitterAuthApi = import.meta.env.VITE_TWITTER_AUTH_API;
      if (!twitterAuthApi) throw new Error("Twitter Auth API is not configured");

      const response = await fetch(`${twitterAuthApi}/login?link=true`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) throw new Error("Failed to initialize Twitter OAuth");

      const data = await response.json();
      sessionStorage.setItem(
        "twitter_link_session",
        JSON.stringify({
          sessionId: data.sessionId,
          state: data.state,
          primaryIdentityId: user?.identityId,
        })
      );
      localStorage.setItem("auth_provider_preference", "Twitter");
      window.location.href = data.authUrl;
    } catch (err) {
      logger.error("Failed to start Twitter linking:", err);
      setLinkError(err instanceof Error ? err.message : "Failed to link Twitter account");
      setIsLinking(false);
    }
  };

  const handleLinkMetaMask = async () => {
    setLinkError(null);
    await handleMetaMaskConnect();
  };

  const handleUnlinkGoogle = async () => {
    if (!confirm(t("userInfo.confirmUnlinkGoogle") || "Unlink Google account?")) return;
    setIsLinking(true);
    try {
      const linkAccountApi = import.meta.env.VITE_LINK_ACCOUNT_API;
      const response = await fetch(`${linkAccountApi}/unlink`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryIdentityId: user?.identityId, provider: "google" }),
      });
      if (!response.ok) throw new Error("Failed to unlink Google account");

      const userProfileApi = import.meta.env.VITE_USER_PROFILE_API;
      const profileResponse = await fetch(`${userProfileApi}?identityId=${user?.identityId}`);
      if (profileResponse.ok) {
        const updatedProfile = await profileResponse.json();
        updateUserProfile(updatedProfile);
        localStorage.setItem("nasun_user_profile", JSON.stringify(updatedProfile));
      }
      alert(t("userInfo.unlinkGoogleSuccess") || "Google account unlinked successfully!");
    } catch (err) {
      logger.error("Failed to unlink Google:", err);
      setLinkError(err instanceof Error ? err.message : "Failed to unlink Google account");
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlinkTwitter = async () => {
    if (!confirm(t("userInfo.confirmUnlinkTwitter") || "Unlink Twitter account?")) return;
    setIsLinking(true);
    try {
      const linkAccountApi = import.meta.env.VITE_LINK_ACCOUNT_API;
      const response = await fetch(`${linkAccountApi}/unlink`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryIdentityId: user?.identityId, provider: "twitter" }),
      });
      if (!response.ok) throw new Error("Failed to unlink Twitter account");

      const userProfileApi = import.meta.env.VITE_USER_PROFILE_API;
      const profileResponse = await fetch(`${userProfileApi}?identityId=${user?.identityId}`);
      if (profileResponse.ok) {
        const updatedProfile = await profileResponse.json();
        updateUserProfile(updatedProfile);
        localStorage.setItem("nasun_user_profile", JSON.stringify(updatedProfile));
      }
      alert(t("userInfo.unlinkTwitterSuccess") || "Twitter account unlinked successfully!");
    } catch (err) {
      logger.error("Failed to unlink Twitter:", err);
      setLinkError(err instanceof Error ? err.message : "Failed to unlink Twitter account");
    } finally {
      setIsLinking(false);
    }
  };

  const handleUnlinkMetaMask = async () => {
    if (!confirm(t("userInfo.confirmUnlinkMetaMask") || "Unlink MetaMask wallet?")) return;
    setIsLinking(true);
    try {
      const linkAccountApi = import.meta.env.VITE_LINK_ACCOUNT_API;
      const response = await fetch(`${linkAccountApi}/unlink`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryIdentityId: user?.identityId, provider: "metamask" }),
      });
      if (!response.ok) throw new Error("Failed to unlink MetaMask wallet");

      const userProfileApi = import.meta.env.VITE_USER_PROFILE_API;
      const profileResponse = await fetch(`${userProfileApi}?identityId=${user?.identityId}`);
      if (profileResponse.ok) {
        const updatedProfile = await profileResponse.json();
        updateUserProfile(updatedProfile);
        localStorage.setItem("nasun_user_profile", JSON.stringify(updatedProfile));
      }
      alert(t("userInfo.unlinkMetaMaskSuccess") || "MetaMask wallet unlinked successfully!");
    } catch (err) {
      logger.error("Failed to unlink MetaMask:", err);
      setLinkError(err instanceof Error ? err.message : "Failed to unlink MetaMask wallet");
    } finally {
      setIsLinking(false);
    }
  };

  // Display values
  const twitterDisplayValue = isTwitterPrimary
    ? user?.twitterHandle && `@${user.twitterHandle}`
    : user?.linkedAccounts?.twitter?.twitterHandle &&
      `@${user.linkedAccounts.twitter.twitterHandle}`;
  const googleDisplayValue = isGooglePrimary ? user?.email : user?.linkedAccounts?.google?.email;
  const metamaskDisplayValue = isMetaMaskPrimary
    ? user?.walletAddress && `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}`
    : user?.linkedAccounts?.metamask?.walletAddress &&
      `${user.linkedAccounts.metamask.walletAddress.slice(0, 6)}...${user.linkedAccounts.metamask.walletAddress.slice(-4)}`;

  if (!user) {
    return (
      <DashboardCard variant="hero" className={className}>
        <div className="flex items-center justify-center py-8">
          <p className="text-nasun-white/50">Loading profile...</p>
        </div>
      </DashboardCard>
    );
  }

  return (
    <DashboardCard variant="hero" className={className}>
      <h5 className="uppercase text-nasun-white mb-4">USER PROFILE</h5>

      {/* Error display */}
      {linkError && (
        <div className="mb-4 p-2 bg-red-900/30 text-red-300 text-sm rounded-lg">{linkError}</div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left: Avatar, Name, Social Accounts */}
        <div className="flex-1">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              {profileImageUrl && !imageError ? (
                <>
                  {!imageLoaded && (
                    <div className="absolute inset-0 w-16 h-16 rounded-xl bg-nasun-c5 animate-pulse flex items-center justify-center">
                      <span className="text-nasun-white text-xl font-medium">
                        {displayName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <img
                    src={profileImageUrl}
                    alt={displayName}
                    className={`w-16 h-16 rounded-2xl object-cover ${
                      imageLoaded ? "opacity-100" : "opacity-0"
                    }`}
                    onError={handleImageError}
                    onLoad={handleImageLoad}
                  />
                </>
              ) : (
                <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-nasun-c4 to-nasun-c5 flex items-center justify-center">
                  <span className="text-nasun-white text-2xl font-medium">
                    {displayName.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
            </div>

            {/* Name and Handle */}
            <div className="flex-1">
              <p className="font-semibold text-nasun-white/90">{displayName}</p>
              {twitterHandle && <p className="text-nasun-white/60 text-sm">@{twitterHandle}</p>}
            </div>
          </div>

          {/* Social Accounts with Link/Unlink */}
          <div className="mt-4 space-y-2">
            <SocialAccountItem
              provider="twitter"
              isConnected={isTwitterConnected}
              isPrimary={isTwitterPrimary}
              displayValue={twitterDisplayValue || undefined}
              onLink={handleLinkTwitter}
              onUnlink={handleUnlinkTwitter}
              isLinking={isLinking}
            />
            <SocialAccountItem
              provider="google"
              isConnected={isGoogleConnected}
              isPrimary={isGooglePrimary}
              displayValue={googleDisplayValue || undefined}
              onLink={handleLinkGoogle}
              onUnlink={handleUnlinkGoogle}
              isLinking={isLinking}
            />
            <SocialAccountItem
              provider="metamask"
              isConnected={isMetaMaskConnected}
              isPrimary={isMetaMaskPrimary}
              displayValue={metamaskDisplayValue || undefined}
              onLink={handleLinkMetaMask}
              onUnlink={handleUnlinkMetaMask}
              isLinking={isLinking || isMetaMaskConnecting}
            />
          </div>
        </div>

        {/* Right: Compact Stats */}
        <div className="lg:w-64 flex flex-col justify-center">
          <div className="grid grid-cols-2 gap-3">
            {/* Rank */}
            <div className="bg-gray-800/80 rounded-lg p-3 text-center">
              <p className="text-sm text-nasun-white/60 uppercase tracking-wide">Rank</p>
              <p className="text-lg font-bold text-nasun-white">{currentRank}</p>
            </div>
            {/* Voting Power */}
            <div className="bg-gray-800/80 rounded-lg p-3 text-center">
              <p className="text-sm text-nasun-white/60 uppercase tracking-wide">Power</p>
              <p className="text-lg font-bold text-nasun-white">
                {totalVotingPower.toLocaleString()}
              </p>
            </div>
            {/* NFT Status */}
            <div className="bg-gray-800/80 rounded-lg p-3 text-center">
              <p className="text-sm text-nasun-white/60 uppercase tracking-wide">NFT</p>
              <p
                className={`text-lg font-bold ${hasNft ? "text-nasun-c3" : "text-nasun-white/50"}`}
              >
                {nftStatus}
              </p>
            </div>
            {/* Participation */}
            <div className="bg-gray-800/80 rounded-lg p-3 text-center">
              <p className="text-sm text-nasun-white/60 uppercase tracking-wide">Vote</p>
              <p className="text-lg font-bold text-nasun-white">{participationRate}</p>
            </div>
          </div>
        </div>
      </div>
    </DashboardCard>
  );
};

export default ProfileHeroCard;
