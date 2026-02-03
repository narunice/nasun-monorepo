import { useState } from "react";
import logger from "@/lib/logger";
import { User } from "@/types/user";
import { buildGoogleAuthUrl } from "@/features/auth/utils/googleAuthUrl";
import { refreshAndSaveUserProfile } from "@/features/auth/services/userProfileService";
import {
  authenticateWithMetaMask,
} from "@/services/metamaskApi";
import {
  connectWallet,
  signMessage,
  isMetaMaskInstalled,
  isCorrectNetwork,
  switchNetwork,
} from "@/utils/metamaskUtils";
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
      sessionStorage.setItem(
        "google_link_session",
        JSON.stringify({ primaryIdentityId: user?.identityId, isLinking: true })
      );
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
      logger.error("Failed to link Twitter account:", err);
      setError(err instanceof Error ? err.message : "Failed to link Twitter account");
      setIsLinking(false);
    }
  };

  const handleLinkMetaMask = async () => {
    setIsLinking(true);
    setError(null);
    try {
      if (!isMetaMaskInstalled()) {
        throw new Error("MetaMask is not installed. Please install MetaMask extension.");
      }

      const walletAddress = await connectWallet();
      const expectedChainId = parseInt(import.meta.env.VITE_ETHEREUM_CHAIN_ID || "1", 10);
      const correctNetwork = await isCorrectNetwork(expectedChainId);
      if (!correctNetwork) {
        await switchNetwork(expectedChainId);
      }

      const authResult = await authenticateWithMetaMask(walletAddress, async (message) => {
        return await signMessage(message, walletAddress);
      });

      const linkAccountApi = import.meta.env.VITE_LINK_ACCOUNT_API;
      if (!linkAccountApi) throw new Error("Link Account API is not configured");

      const linkResponse = await fetch(linkAccountApi, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryIdentityId: user?.identityId,
          secondaryIdentityId: authResult.identityId,
          secondaryProvider: "MetaMask",
        }),
      });

      if (!linkResponse.ok) throw new Error("Failed to link MetaMask account");

      await refreshAndSaveUserProfile(user!.identityId);
    } catch (err) {
      logger.error("Failed to link MetaMask account:", err);
      setError(err instanceof Error ? err.message : "Failed to link MetaMask account");
    } finally {
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

      const response = await fetch(`${linkAccountApi}/unlink`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      logger.error(`Failed to unlink ${provider} account:`, err);
      setError(err instanceof Error ? err.message : `Failed to unlink ${provider} account`);
    } finally {
      setIsLinking(false);
    }
  };

  return {
    isLinking,
    error,
    handleLinkGoogle,
    handleLinkTwitter,
    handleLinkMetaMask,
    unlinkAccount,
  };
};
