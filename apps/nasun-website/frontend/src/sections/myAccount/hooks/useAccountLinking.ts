import { useState } from "react";
import logger from "@/lib/logger";
import { User } from "@/types/user";
import { buildGoogleAuthUrl } from "@/features/auth/utils/googleAuthUrl";
import { refreshAndSaveUserProfile } from "@/features/auth/services/userProfileService";
import { useBattalionNftStore } from "@/stores/useBattalionNftStore";

interface UseAccountLinkingProps {
  user: User | null;
}

export const useAccountLinking = ({ user }: UseAccountLinkingProps) => {
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLinkGoogle = async () => {
    setIsLinking(true);
    setError(null);
    try {
      const googleLinkData = JSON.stringify({
        primaryIdentityId: user?.identityId,
        isLinking: true,
        cognitoToken: user?.cognitoToken,
      });
      sessionStorage.setItem("google_link_session", googleLinkData);
      // Fallback: localStorage survives mobile app-switch that clears sessionStorage
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

      // Primary: sessionStorage
      sessionStorage.setItem("twitter_link_session", linkData);
      // Fallback: localStorage survives mobile app-switch (Chrome Custom Tabs, iOS Safari)
      localStorage.setItem("twitter_link_session", linkData);
      localStorage.setItem("auth_provider_preference", "Twitter");
      window.location.href = data.authUrl;
    } catch (err) {
      logger.error("Failed to link Twitter account:", err);
      setError(err instanceof Error ? err.message : "Failed to link Twitter account");
      setIsLinking(false);
    }
  };

  // handleLinkWallet is now handled by useWalletAuth(mode: 'link') in the consumer components.
  // This hook only manages Google, Twitter linking and unlinking.

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

      // Clear Battalion NFT state when unlinking MetaMask
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
