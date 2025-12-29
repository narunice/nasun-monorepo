/**
 * ProfileHeroCard Component
 *
 * Hero card for user profile display at the top of My Account dashboard.
 * Shows avatar, username, connected accounts, and key stats.
 */

import { FC, useState, useCallback } from "react";
import { useAuth } from "../../../providers/auth/AuthContext";
import { useUserStore } from "../../../store/userStore";
import { useVotingPower } from "@/features/governance/hooks/useVotingPower";
import { useDelegation } from "@/features/governance/hooks/useDelegation";
import { useVoteHistory } from "@/features/governance/hooks/useVoteHistory";
import { DashboardCard } from "../../ui/DashboardCard";
import { StatCard } from "../../ui/StatCard";

interface ProfileHeroCardProps {
  className?: string;
}

// Social account badge component
const SocialBadge: FC<{
  provider: string;
  isConnected: boolean;
  label?: string;
}> = ({ provider, isConnected, label }) => {
  const icons: Record<string, JSX.Element> = {
    twitter: (
      <img
        src="/X_logo_2023.svg.png"
        alt="X"
        className="w-4 h-4 dark:invert"
      />
    ),
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
    metamask: (
      <svg className="w-4 h-4" viewBox="0 0 318.6 318.6">
        <path fill="#E2761B" stroke="#E2761B" d="M274.1,35.5l-99.5,73.9L193,65.8z" />
        <path
          fill="#E4761B"
          stroke="#E4761B"
          d="M44.4,35.5l98.7,74.6l-17.5-44.3L44.4,35.5z M238.3,206.8l-26.5,40.6l56.7,15.6l16.3-55.3L238.3,206.8z"
        />
      </svg>
    ),
  };

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs ${
        isConnected
          ? "bg-nasun-c4/20 text-nasun-c3"
          : "bg-nasun-c5/20 text-nasun-white/40"
      }`}
    >
      {icons[provider]}
      <span>{label || provider}</span>
      {isConnected && <span className="text-green-400">✓</span>}
    </div>
  );
};

export const ProfileHeroCard: FC<ProfileHeroCardProps> = ({ className = "" }) => {
  const { user } = useAuth();
  const { user: storeUser } = useUserStore();
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Voting power data
  const { votingPower, nftVerification } = useVotingPower();
  const { delegationState } = useDelegation();
  const { stats } = useVoteHistory(1);

  const handleImageError = useCallback(() => setImageError(true), []);
  const handleImageLoad = useCallback(() => setImageLoaded(true), []);

  // Get user info
  const displayName = user?.username || user?.twitterHandle || user?.email?.split("@")[0] || "User";
  const twitterHandle = user?.twitterHandle || user?.linkedAccounts?.twitter?.twitterHandle;
  const profileImageUrl = user?.profileImageUrl;

  // Determine connected accounts
  const isTwitterConnected =
    user?.provider === "Twitter" || !!user?.linkedAccounts?.twitter;
  const isGoogleConnected =
    user?.provider === "Google" || !!user?.linkedAccounts?.google;
  const isMetaMaskConnected =
    user?.provider === "MetaMask" || !!user?.linkedAccounts?.metamask;

  // Calculate stats
  const basePower = votingPower?.leaderboardScore || 1;
  const nftBonus = nftVerification?.nftBonus || 0;
  const delegatedPower = delegationState?.delegatorCount
    ? delegationState.delegatorCount * 100
    : 0;
  const totalVotingPower = basePower + nftBonus + delegatedPower;

  // Get current rank from leaderboard (placeholder - would need actual data)
  const currentRank = storeUser?.leaderboardRank || "-";

  // NFT status
  const hasNft = nftBonus > 0;
  const nftStatus = hasNft ? "Verified" : "None";

  // Participation rate
  const participationRate = `${stats.participationRate.toFixed(0)}%`;

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
      <div className="flex flex-col md:flex-row md:items-center gap-6">
        {/* Avatar and Name Section */}
        <div className="flex items-center gap-4">
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
                  className={`w-16 h-16 rounded-xl object-cover ${
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
          <div>
            <h2 className="text-xl font-semibold text-nasun-white">
              {displayName}
            </h2>
            {twitterHandle && (
              <p className="text-nasun-white/60 text-sm">@{twitterHandle}</p>
            )}

            {/* Connected Accounts */}
            <div className="flex flex-wrap gap-2 mt-2">
              <SocialBadge
                provider="twitter"
                isConnected={isTwitterConnected}
                label="X"
              />
              <SocialBadge
                provider="google"
                isConnected={isGoogleConnected}
                label="Google"
              />
              <SocialBadge
                provider="metamask"
                isConnected={isMetaMaskConnected}
                label="MetaMask"
              />
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Rank"
            value={currentRank}
            className="!bg-nasun-c6/50 !border-nasun-c5/30"
          />
          <StatCard
            label="Voting Power"
            value={totalVotingPower.toLocaleString()}
            className="!bg-nasun-c6/50 !border-nasun-c5/30"
          />
          <StatCard
            label="NFT Status"
            value={nftStatus}
            className="!bg-nasun-c6/50 !border-nasun-c5/30"
          />
          <StatCard
            label="Participation"
            value={participationRate}
            className="!bg-nasun-c6/50 !border-nasun-c5/30"
          />
        </div>
      </div>
    </DashboardCard>
  );
};

export default ProfileHeroCard;
