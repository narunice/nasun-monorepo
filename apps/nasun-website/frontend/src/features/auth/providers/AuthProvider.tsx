import React, { createContext, useEffect, useState, useCallback } from "react";
import { Amplify } from "aws-amplify";
import { fetchAuthSession } from "aws-amplify/auth";
import awsConfig from "@/config/awsConfig";
import logger from "@/lib/logger";
import { useUserStore } from "@/store/userStore";
import type { UserData } from "@/store/userStore";
import { generateCodeVerifier, parseJwt } from "@/utils/authUtils";
import { useBattalionNftStore } from "@/stores/useBattalionNftStore";
import { AuthContextType } from "../types";
import { 
  handleTwitterCallback, 
  linkAccounts, 
  fetchUserProfile, 
  ensureUserProfile 
} from "../utils/authApi";
import { getCognitoIdentityId } from "../utils/cognito";

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
      } else {
        await fetchAuthSession();
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
      logger.debug(`OAuth Redirect Debug: provider=${provider}, linking=${isLinkingFlow}`);
      logger.debug(`Redirect URL: ${window.location.href}`);
      logger.debug(`URL hash: ${url.hash}`);
      logger.debug(`URL search params: ${url.search}`);

      let identityId: string | undefined;
      let userInfo: { name: string; email?: string } | undefined;
      let twitterUserData: {
        identityId: string;
        username: string;
        twitterHandle?: string;
        twitterId?: string;
        profileImageUrl?: string;
      } | null = null;

      if (provider === "Google") {
        const idToken = new URLSearchParams(url.hash.substring(1)).get("id_token");
        logger.debug(
          "Google ID token extracted:",
          idToken ? `${idToken.substring(0, 50)}...` : "null"
        );

        if (!idToken) throw new Error("Google ID token not found in redirect");

        const googlePayload = parseJwt(idToken);
        logger.debug("Parsed Google payload:", googlePayload);

        if (!googlePayload) throw new Error("Failed to parse Google ID token");

        userInfo = { name: googlePayload.name as string, email: googlePayload.email as string };
        identityId = await getCognitoIdentityId("Google", idToken);
      } else if (provider === "Twitter") {
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const sessionId =
          isLinkingFlow && twitterLinkSession
            ? JSON.parse(twitterLinkSession).sessionId
            : localStorage.getItem("twitter_oauth_session");

        if (!code || !state || !sessionId) {
          throw new Error("Missing Twitter OAuth parameters");
        }

        twitterUserData = await handleTwitterCallback(code, state, sessionId);
        userInfo = { name: twitterUserData?.username || "Twitter User" };
        identityId = twitterUserData?.identityId;
      }

      // Handle account linking
      if (isLinkingFlow && identityId) {
        if (provider === "Twitter" && twitterUserData && twitterLinkSession) {
          // Twitter linking
          const linkSession = JSON.parse(twitterLinkSession);
          await linkAccounts(linkSession.primaryIdentityId, identityId, "Twitter");
          sessionStorage.removeItem("twitter_link_session");

          // Reload user profile to get updated linked accounts
          const updatedProfile = await fetchUserProfile(linkSession.primaryIdentityId);
          if (updatedProfile) {
            sessionStorage.setItem("nasun_user_profile", JSON.stringify(updatedProfile));
            setUser(updatedProfile);
          }
        } else if (provider === "Google" && userInfo && googleLinkSession) {
          // Google linking
          const linkSession = JSON.parse(googleLinkSession);
          await linkAccounts(linkSession.primaryIdentityId, identityId, "Google");
          sessionStorage.removeItem("google_link_session");

          // Reload user profile to get updated linked accounts
          const updatedProfile = await fetchUserProfile(linkSession.primaryIdentityId);
          if (updatedProfile) {
            sessionStorage.setItem("nasun_user_profile", JSON.stringify(updatedProfile));
            setUser(updatedProfile);
          }
        } else if (identityId && userInfo) {
          // Linking session exists but doesn't match provider - treat as normal login
          // Normal login flow
          const finalUserData: UserData = {
            identityId,
            provider: provider as "Google" | "Twitter",
            username: userInfo.name,
            ...(userInfo.email && { email: userInfo.email }),
            ...(twitterUserData?.twitterHandle && { twitterHandle: twitterUserData.twitterHandle }),
            ...(twitterUserData?.twitterId && { twitterId: twitterUserData.twitterId }),
            ...(twitterUserData?.profileImageUrl && {
              profileImageUrl: twitterUserData.profileImageUrl,
            }),
          };

          // Ensure user profile exists in DynamoDB
          logger.log("Ensuring user profile exists in DynamoDB...");
          const dbProfile = await ensureUserProfile(finalUserData);
          const userDataToStore = dbProfile || finalUserData;

          sessionStorage.setItem("nasun_user_profile", JSON.stringify(userDataToStore));
          setUser(userDataToStore);
        }
      } else if (identityId && userInfo) {
        // Normal login flow
        const finalUserData: UserData = {
          identityId,
          provider: provider as "Google" | "Twitter",
          username: userInfo.name,
          email: userInfo.email,
        };

        // Add Twitter-specific data if available
        if (provider === "Twitter" && twitterUserData) {
          finalUserData.twitterHandle = twitterUserData.twitterHandle;
          finalUserData.twitterId = twitterUserData.twitterId;
          finalUserData.profileImageUrl = twitterUserData.profileImageUrl;
        }

        // Ensure user profile exists in DynamoDB
        logger.log("Ensuring user profile exists in DynamoDB...");
        const dbProfile = await ensureUserProfile(finalUserData);

        // Use DynamoDB profile if available, otherwise use finalUserData
        const userDataToStore = dbProfile || finalUserData;

        sessionStorage.setItem("nasun_user_profile", JSON.stringify(userDataToStore));
        setUser(userDataToStore);
      } else {
        throw new Error("Could not establish user identity after redirect.");
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

      // Redirect to saved return URL if exists
      const returnUrl = localStorage.getItem("auth_return_url");
      if (returnUrl) {
        localStorage.removeItem("auth_return_url");
        window.location.href = returnUrl;
      }
    }
    return true;
  }, [setIsLoading, setUser, clearUser]);

  useEffect(() => {
    Amplify.configure(awsConfig);

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
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const redirectUri = `${window.location.origin}/callback`;
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.append("client_id", googleClientId);
    authUrl.searchParams.append("redirect_uri", redirectUri);
    authUrl.searchParams.append("response_type", "id_token");
    authUrl.searchParams.append("scope", "openid email profile");
    authUrl.searchParams.append("nonce", generateCodeVerifier(16));
    authUrl.searchParams.append("prompt", "select_account");
    window.location.href = authUrl.toString();
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

  const signInWithMetaMask = async (identityId: string, walletAddress: string) => {
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

      // Battalion NFT state (UI state can stay in localStorage, but tokens go in sessionStorage)
      localStorage.removeItem("battalion-nft-state");
      sessionStorage.removeItem("battalion_nft_twitter_session");
      sessionStorage.removeItem("battalion_nft_x_access_token");

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
