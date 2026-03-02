import { useState } from "react";
import logger from "@/lib/logger";
import { User } from "@/types/user";
import { buildGoogleAuthUrl } from "@/features/auth/utils/googleAuthUrl";
import { refreshAndSaveUserProfile } from "@/features/auth/services/userProfileService";
import { prepareChallenge, connectVerify } from "@/services/metamaskApi";
import { connectWallet, signMessage, isMetaMaskInstalled } from "@/utils/metamaskUtils";
import {
  connectMetaMaskSDK,
  signMessageViaSDK,
  disconnectMetaMaskSDK,
} from "@/lib/wallet/metamaskSdkProvider";
import { isMobileBrowser } from "@/utils/mobileDetect";
import { useBattalionNftStore } from "@/stores/useBattalionNftStore";

interface UseAccountLinkingProps {
  user: User | null;
}

export const useAccountLinking = ({ user }: UseAccountLinkingProps) => {
  const [isLinking, setIsLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mobileInstallHint, setMobileInstallHint] = useState(false);

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
      const linkData = JSON.stringify({
        sessionId: data.sessionId,
        state: data.state,
        primaryIdentityId: user?.identityId,
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

  const handleLinkMetaMask = async () => {
    setIsLinking(true);
    setError(null);
    setMobileInstallHint(false);
    const mobile = isMobileBrowser();

    try {
      // Desktop: check MetaMask extension is installed
      if (!mobile && !isMetaMaskInstalled()) {
        throw new Error("MetaMask is not installed. Please install MetaMask browser extension.");
      }

      // Step 1: Get server challenge (no wallet address needed)
      const { nonce, message } = await prepareChallenge();

      // Step 2: Connect + sign (mobile: SDK deep link, desktop: extension popup)
      let signature: string;
      if (mobile) {
        const address = await connectMetaMaskSDK({
          onAppNotDetected: () => setMobileInstallHint(true),
        });
        signature = await signMessageViaSDK(message, address);
      } else {
        const address = await connectWallet();
        signature = await signMessage(message, address);
      }

      // Step 3: Server verifies signature, recovers address
      const authResult = await connectVerify(signature, nonce);

      // Step 4: Link accounts
      const linkAccountApi = import.meta.env.VITE_LINK_ACCOUNT_API;
      if (!linkAccountApi) throw new Error("Link Account API is not configured");

      const token = user?.cognitoToken ?? useBattalionNftStore.getState().cognitoToken;
      if (!token) {
        throw new Error("Session expired. Please sign in again to link accounts.");
      }

      // Skip self-linking (same identity)
      if (user.identityId !== authResult.identityId) {
        const linkResponse = await fetch(linkAccountApi, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({
            primaryIdentityId: user.identityId,
            secondaryIdentityId: authResult.identityId,
            secondaryProvider: "MetaMask",
          }),
        });

        if (!linkResponse.ok) throw new Error("Failed to link MetaMask account");
      }

      await refreshAndSaveUserProfile(user!.identityId);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to link MetaMask account";
      logger.error("Failed to link MetaMask account:", err);

      let userMessage = errorMsg;
      if (errorMsg.includes("not installed")) {
        userMessage = mobile
          ? "Please install the MetaMask app to continue."
          : "MetaMask is not installed. Please install MetaMask extension.";
      } else if (errorMsg.includes("rejected")) {
        userMessage = "You rejected the request. Please try again.";
      } else if (errorMsg.includes("timed out")) {
        userMessage = "Connection timed out. Please try again.";
        await disconnectMetaMaskSDK();
      }

      setError(userMessage);
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
    mobileInstallHint,
    handleLinkGoogle,
    handleLinkTwitter,
    handleLinkMetaMask,
    unlinkAccount,
  };
};
