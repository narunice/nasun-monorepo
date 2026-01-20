import { useState } from "react";
import { useUserStore } from "../../../store/userStore";
import logger from "../../../lib/logger";
import { User } from "../../../types/user";

interface UseAccountLinkingProps {
  user: User | null;
}

export const useAccountLinking = ({ user }: UseAccountLinkingProps) => {
  const [isLinking, setIsLinking] = useState(false);
  const updateUserProfile = useUserStore((state) => state.updateUserProfile);

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

  return {
    isLinking,
    handleLinkGoogle,
    handleLinkTwitter,
    unlinkAccount,
  };
};
