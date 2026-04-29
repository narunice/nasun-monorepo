import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { clearPendingZkLoginFlow } from "@nasun/wallet";
import logger from "@/lib/logger";
import { User } from "@/types/user";
import { buildGoogleAuthUrl } from "@/features/auth/utils/googleAuthUrl";
import { refreshAndSaveUserProfile } from "@/features/auth/services/userProfileService";
import { useBattalionNftStore } from "@/stores/useBattalionNftStore";
import { VOTING_POWER_QUERY_KEY } from "@/features/governance/hooks/useVotingPower";

interface UseUjuAccountLinkingProps {
  user: User | null;
}

export const useUjuAccountLinking = ({ user }: UseUjuAccountLinkingProps) => {
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const handleLinkGoogle = async () => {
    clearPendingZkLoginFlow();
    setIsLinking(true);
    setError(null);
    try {
      const googleLinkData = JSON.stringify({
        primaryIdentityId: user?.identityId,
        isLinking: true,
        cognitoToken: user?.cognitoToken,
      });
      sessionStorage.setItem("google_link_session", googleLinkData);
      localStorage.setItem("google_link_session", googleLinkData);
      localStorage.setItem("auth_provider_preference", "Google");
      window.location.href = buildGoogleAuthUrl();
    } catch (err) {
      logger.error("Failed to link Google account:", err);
      setError(err instanceof Error ? err.message : "Failed to link Google account");
      setIsLinking(false);
    }
  };

  const handleLinkTwitter = async () => {
    clearPendingZkLoginFlow();
    setIsLinking(true);
    setError(null);
    try {
      const twitterAuthApi = import.meta.env.VITE_TWITTER_AUTH_API;
      if (!twitterAuthApi) throw new Error("Twitter Auth API is not configured");

      const response = await fetch(`${twitterAuthApi}/login?link=true`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) throw new Error("Failed to initialize Twitter OAuth");

      const data = await response.json();
      const linkData = JSON.stringify({
        sessionId: data.sessionId,
        state: data.state,
        primaryIdentityId: user?.identityId,
        cognitoToken: user?.cognitoToken,
      });

      sessionStorage.setItem("twitter_link_session", linkData);
      localStorage.setItem("twitter_link_session", linkData);
      localStorage.setItem("auth_provider_preference", "Twitter");
      window.location.href = data.authUrl;
    } catch (err) {
      logger.error("Failed to link Twitter account:", err);
      setError(err instanceof Error ? err.message : "Failed to link Twitter account");
      setIsLinking(false);
    }
  };

  const unlinkAccount = async (provider: string, confirmMessage?: string) => {
    if (!confirm(confirmMessage || `Unlink ${provider} account?`)) return;
    setIsLinking(true);
    setError(null);
    try {
      const linkAccountApi = import.meta.env.VITE_LINK_ACCOUNT_API;
      if (!linkAccountApi) throw new Error("Link Account API is not configured");

      const token = user?.cognitoToken ?? useBattalionNftStore.getState().cognitoToken;
      if (!token) {
        throw new Error("Session expired. Please sign in again to unlink accounts.");
      }

      const unlinkHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      };

      const response = await fetch(`${linkAccountApi}/unlink`, {
        method: "POST",
        headers: unlinkHeaders,
        body: JSON.stringify({
          primaryIdentityId: user?.identityId,
          provider: provider.toLowerCase(),
        }),
      });
      if (!response.ok) throw new Error(`Failed to unlink ${provider} account`);

      await refreshAndSaveUserProfile(user!.identityId);
      queryClient.invalidateQueries({ queryKey: [VOTING_POWER_QUERY_KEY] });

      if (provider.toLowerCase() === "metamask") {
        useBattalionNftStore.getState().reset();
        localStorage.removeItem("battalion-nft-state");
      }

      alert(`${provider} account unlinked successfully!`);
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to unlink ${provider} account`;
      logger.error(`Failed to unlink ${provider} account:`, err);
      setError(message);
      alert(message);
    } finally {
      setIsLinking(false);
    }
  };

  return {
    isLinking,
    error,
    handleLinkGoogle,
    handleLinkTwitter,
    unlinkAccount,
  };
};
