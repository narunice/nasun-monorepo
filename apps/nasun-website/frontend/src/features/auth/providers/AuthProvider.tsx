import React, { createContext, useEffect, useState, useCallback } from "react";
import logger from "@/lib/logger";
import { useUserStore } from "@/store/userStore";
import type { UserData } from "@/store/userStore";
import { useBattalionNftStore } from "@/stores/useBattalionNftStore";
import { AuthContextType } from "../types";
import { linkAccounts, ensureUserProfile } from "../utils/authApi";
import { isValidReturnUrl } from "../utils/urlValidation";
import { buildGoogleAuthUrl } from "../utils/googleAuthUrl";
import { refreshAndSaveUserProfile } from "../services/userProfileService";
import { handleGoogleOAuthRedirect } from "../handlers/googleOAuthHandler";
import { handleTwitterOAuthRedirect } from "../handlers/twitterOAuthHandler";

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading, setUser, clearUser, setIsLoading } = useUserStore();
  const [error, setError] = useState<Error | null>(null);

  const clearError = () => setError(null);

  const checkAuthStatus = useCallback(async () => {
    setIsLoading(true);
    clearError();
    try {
      // Security: Using sessionStorage for sensitive user data to reduce XSS exposure
      const cachedUser = sessionStorage.getItem("nasun_user_profile");
      if (cachedUser) {
        setUser(JSON.parse(cachedUser));
      }
    } catch {
      logger.debug("No active session found on startup.");
      clearUser();
    } finally {
      setIsLoading(false);
    }
  }, [setIsLoading, setUser, clearUser]);

  const handleOAuthRedirect = useCallback(async (): Promise<boolean> => {
    const provider = localStorage.getItem("auth_provider_preference");
    const url = new URL(window.location.href);

    // Check for account linking flow
    const twitterLinkSession = sessionStorage.getItem("twitter_link_session");
    const googleLinkSession = sessionStorage.getItem("google_link_session");
    const isLinkingFlow = !!twitterLinkSession || !!googleLinkSession;

    // Skip Twitter OAuth if this is Battalion NFT flow
    // Note: Step2XAuthCard stores this in sessionStorage (not localStorage)
    const isBattalionNftTwitterSession = sessionStorage.getItem("battalion_nft_twitter_session");
    if (isBattalionNftTwitterSession && url.searchParams.has("code")) {
      logger.debug("Skipping AuthContext Twitter OAuth - Battalion NFT flow detected");
      return false;
    }

    const isGoogleRedirect = provider === "Google" && url.hash.includes("id_token");
    const isTwitterRedirect = provider === "Twitter" && url.searchParams.has("code");

    if (!isGoogleRedirect && !isTwitterRedirect) {
      return false;
    }

    setIsLoading(true);
    clearError();
    window.history.replaceState({}, document.title, window.location.pathname);

    try {
      logger.debug(`OAuth Redirect: provider=${provider}, linking=${isLinkingFlow}`);

      // Dispatch to provider-specific handlers
      let identityId: string;
      let cognitoToken: string | undefined;
      let userInfo: { name: string; email?: string };
      let twitterData: { twitterHandle?: string; twitterId?: string; profileImageUrl?: string } | null = null;

      if (provider === "Google") {
        const result = await handleGoogleOAuthRedirect(url);
        identityId = result.identityId;
        cognitoToken = result.cognitoToken;
        userInfo = result.userInfo;
      } else {
        const sessionId =
          isLinkingFlow && twitterLinkSession
            ? JSON.parse(twitterLinkSession).sessionId
            : localStorage.getItem("twitter_oauth_session") || "";
        const result = await handleTwitterOAuthRedirect(url, sessionId);
        identityId = result.identityId;
        cognitoToken = result.cognitoToken;
        userInfo = result.userInfo;
        twitterData = result;
      }

      // Handle account linking flow
      if (isLinkingFlow) {
        const linkSessionKey = provider === "Twitter" ? "twitter_link_session" : "google_link_session";
        const linkSessionRaw = provider === "Twitter" ? twitterLinkSession : googleLinkSession;

        if (linkSessionRaw) {
          const { primaryIdentityId } = JSON.parse(linkSessionRaw);
          await linkAccounts(primaryIdentityId, identityId, provider as "Google" | "Twitter");
          sessionStorage.removeItem(linkSessionKey);
          await refreshAndSaveUserProfile(primaryIdentityId);
          setUser(useUserStore.getState().user);
        } else {
          // Linking session mismatch - fall through to normal login
          await performNormalLogin();
        }
      } else {
        await performNormalLogin();
      }

      // Extracted normal login to avoid duplication between linking fallback and normal flow
      async function performNormalLogin() {
        const finalUserData: UserData = {
          identityId,
          provider: provider as "Google" | "Twitter",
          username: userInfo.name,
          email: userInfo.email,
          cognitoToken,
          ...(twitterData?.twitterHandle && { twitterHandle: twitterData.twitterHandle }),
          ...(twitterData?.twitterId && { twitterId: twitterData.twitterId }),
          ...(twitterData?.profileImageUrl && { profileImageUrl: twitterData.profileImageUrl }),
        };

        logger.log("Ensuring user profile exists in DynamoDB...");
        const dbProfile = await ensureUserProfile(finalUserData);
        // Preserve cognitoToken from auth flow (not stored in DynamoDB)
        const userDataToStore = dbProfile
          ? { ...dbProfile, cognitoToken }
          : finalUserData;

        sessionStorage.setItem("nasun_user_profile", JSON.stringify(userDataToStore));
        setUser(userDataToStore);
      }
    } catch (e) {
      const err = e as Error;
      logger.error(`Error handling ${provider} redirect:`, err);
      setError(err);
      clearUser();
    } finally {
      localStorage.removeItem("auth_provider_preference");
      localStorage.removeItem("twitter_oauth_session");
      setIsLoading(false);

      // Redirect to saved return URL if exists (validated to prevent open redirect)
      const returnUrl = localStorage.getItem("auth_return_url");
      if (returnUrl) {
        localStorage.removeItem("auth_return_url");
        if (isValidReturnUrl(returnUrl)) {
          window.location.href = returnUrl;
        } else {
          logger.error("Blocked invalid return URL:", returnUrl);
        }
      }
    }
    return true;
  }, [setIsLoading, setUser, clearUser]);

  useEffect(() => {
    const initializeAuth = async () => {
      const redirectHandled = await handleOAuthRedirect();
      if (!redirectHandled) {
        await checkAuthStatus();
      }
    };

    initializeAuth();
  }, [checkAuthStatus, handleOAuthRedirect]);

  const signInWithGoogle = async () => {
    clearError();
    setIsLoading(true);
    localStorage.setItem("auth_provider_preference", "Google");
    localStorage.setItem("auth_return_to", window.location.pathname);
    window.location.href = buildGoogleAuthUrl();
  };

  const signInWithTwitter = async () => {
    clearError();
    setIsLoading(true);
    localStorage.setItem("auth_provider_preference", "Twitter");
    localStorage.setItem("auth_return_to", window.location.pathname);

    try {
      const response = await fetch(`${import.meta.env.VITE_TWITTER_AUTH_API}/login`);
      const { authUrl, sessionId } = await response.json();

      localStorage.setItem("twitter_oauth_session", sessionId);
      window.location.href = authUrl;
    } catch (error) {
      setError(error as Error);
      setIsLoading(false);
    }
  };

  const signInWithMetaMask = async (identityId: string, cognitoToken: string | undefined, walletAddress: string) => {
    clearError();
    setIsLoading(true);
    localStorage.setItem("auth_provider_preference", "MetaMask");

    try {
      logger.debug("MetaMask authentication successful", { identityId, walletAddress });

      // Fetch user profile from backend
      const profileResponse = await fetch(
        `${import.meta.env.VITE_USER_PROFILE_API}?identityId=${identityId}`
      );

      if (!profileResponse.ok) {
        throw new Error("Failed to fetch user profile");
      }

      const profileData = await profileResponse.json();

      const userData: UserData = {
        identityId,
        username:
          profileData.username ||
          `${walletAddress.substring(0, 6)}...${walletAddress.substring(38)}`,
        provider: "MetaMask",
        walletAddress: walletAddress.toLowerCase(),
        cognitoToken,
        profileImageUrl: profileData.profileImageUrl,
        linkedAccounts: profileData.linkedAccounts || {},
      };

      // Save to sessionStorage and state (sessionStorage for security)
      sessionStorage.setItem("nasun_user_profile", JSON.stringify(userData));
      setUser(userData);

      logger.log("MetaMask sign-in successful:", { identityId, walletAddress });
    } catch (error) {
      logger.error("MetaMask sign-in failed", error);
      setError(error as Error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      // Clear sensitive data from sessionStorage
      sessionStorage.removeItem("nasun_user_profile");
      localStorage.removeItem("auth_provider_preference");

      // Reset Battalion NFT Store first
      useBattalionNftStore.getState().reset();

      // Battalion NFT state
      localStorage.removeItem("battalion-nft-state");
      sessionStorage.removeItem("battalion_nft_twitter_session");

      // Clear all remaining sessionStorage items
      sessionStorage.clear();
      clearUser();
      logger.log("User logged out successfully");
    } catch (error) {
      logger.error("Logout failed", error);
    } finally {
      setIsLoading(false);
    }
  };

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    error,
    signInWithGoogle,
    signInWithTwitter,
    signInWithMetaMask,
    logout,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
