import React, { createContext, useEffect, useState, useCallback, useRef } from "react";
import logger from "@/lib/logger";
import { formatErrorMessage } from "@/lib/errorParser";
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
  const oauthProcessingRef = useRef(false);

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
    // Prevent double-execution from StrictMode double-fire or re-renders.
    // Without this guard, replaceState() below wipes URL params on the first call,
    // causing the second call to see a clean URL and fall through to checkAuthStatus().
    if (oauthProcessingRef.current) return false;

    const storedProvider = localStorage.getItem("auth_provider_preference");
    const url = new URL(window.location.href);

    // Check for account linking flow
    // Fallback: localStorage survives mobile app-switch that clears sessionStorage
    const twitterLinkSession = sessionStorage.getItem("twitter_link_session")
      || localStorage.getItem("twitter_link_session");
    const googleLinkSession = sessionStorage.getItem("google_link_session")
      || localStorage.getItem("google_link_session");
    const isLinkingFlow = !!twitterLinkSession || !!googleLinkSession;

    // Skip Twitter OAuth if this is Battalion NFT flow
    // Primary: sessionStorage (secure), Fallback: localStorage flow type flag (non-sensitive)
    const isBattalionNftTwitterSession = sessionStorage.getItem("battalion_nft_twitter_session")
      || localStorage.getItem("auth_flow_type") === "battalion_nft";
    if (isBattalionNftTwitterSession && url.searchParams.has("code")) {
      logger.debug("Skipping AuthContext Twitter OAuth - Battalion NFT flow detected");
      return false;
    }

    const hasIdToken = url.hash.includes("id_token");
    const hasCodeAndState = url.searchParams.has("code") && url.searchParams.has("state");
    const isZkLoginSession = !!sessionStorage.getItem("nasun:zklogin:session");

    // Primary: localStorage gatekeeper (preserves existing security)
    let isGoogleRedirect = storedProvider === "Google" && hasIdToken;
    let isTwitterRedirect = storedProvider === "Twitter" && hasCodeAndState;

    // Fallback: URL-based detection when localStorage is lost (mobile browser storage eviction)
    if (!isGoogleRedirect && !isTwitterRedirect) {
      if (hasIdToken && !isZkLoginSession) {
        isGoogleRedirect = true;
        logger.warn("OAuth fallback: detected Google redirect without localStorage gatekeeper");
      } else if (hasCodeAndState) {
        isTwitterRedirect = true;
        logger.warn("OAuth fallback: detected Twitter redirect without localStorage gatekeeper");
      }
    }

    const provider = isGoogleRedirect ? "Google" : isTwitterRedirect ? "Twitter" : null;
    if (!provider) {
      return false;
    }

    oauthProcessingRef.current = true;
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
        // Primary: parse sessionId from composite state "{randomState}.{sessionId}"
        // This survives mobile app-switch that clears sessionStorage/localStorage
        let sessionId = "";
        const compositeState = url.searchParams.get("state") || "";
        const dotIdx = compositeState.lastIndexOf(".");
        if (dotIdx > 0) {
          sessionId = compositeState.substring(dotIdx + 1);
        }

        // Fallback: browser storage (backward compat + account linking)
        if (!sessionId) {
          sessionId = isLinkingFlow && twitterLinkSession
            ? JSON.parse(twitterLinkSession).sessionId
            : localStorage.getItem("twitter_oauth_session") || "";
        }
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
          const parsed = JSON.parse(linkSessionRaw);
          const { primaryIdentityId } = parsed;
          // Primary: sessionStorage (secure, but may be cleared on Android Chrome redirect)
          const cachedProfile = sessionStorage.getItem("nasun_user_profile");
          // Fallback: cognitoToken stored in link session (survives mobile redirect via localStorage)
          const primaryCognitoToken = cachedProfile
            ? JSON.parse(cachedProfile).cognitoToken
            : parsed.cognitoToken;
          await linkAccounts(primaryIdentityId, identityId, provider as "Google" | "Twitter", primaryCognitoToken);
          sessionStorage.removeItem(linkSessionKey);
          await refreshAndSaveUserProfile(primaryIdentityId, primaryCognitoToken);
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
          ...(twitterData?.originalTwitterHandle && { originalTwitterHandle: twitterData.originalTwitterHandle }),
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
      const formattedError = new Error(formatErrorMessage(err));
      setError(formattedError);
      clearUser();
    } finally {
      localStorage.removeItem("auth_provider_preference");
      localStorage.removeItem("twitter_oauth_session");
      localStorage.removeItem("auth_flow_type");
      localStorage.removeItem("battalion_nft_session_id");
      localStorage.removeItem("twitter_link_session");
      localStorage.removeItem("google_link_session");
      setIsLoading(false);
      oauthProcessingRef.current = false;

      // Fallback redirect for non-/callback pages.
      // When on /callback, Callback.tsx handles post-auth navigation via React Router.
      if (window.location.pathname !== '/callback') {
        const savedPath = localStorage.getItem("auth_return_to");
        if (savedPath) {
          localStorage.removeItem("auth_return_to");
          const returnTo = (!savedPath || savedPath === '/') ? '/my-account' : savedPath;
          if (isValidReturnUrl(returnTo)) {
            window.location.href = returnTo;
          }
        }
      }
    }
    return true;
  }, [setIsLoading, setUser, clearUser]);

  useEffect(() => {
    const initializeAuth = async () => {
      const redirectHandled = await handleOAuthRedirect();
      // Skip checkAuthStatus if another mount is already processing OAuth
      // (prevents StrictMode double-mount race condition)
      if (!redirectHandled && !oauthProcessingRef.current) {
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
    // Clear any stale zkLogin session so /callback won't misdetect this as zkLogin
    sessionStorage.removeItem("nasun:zklogin:session");
    window.location.href = buildGoogleAuthUrl();
  };

  const signInWithTwitter = async () => {
    clearError();
    setIsLoading(true);
    localStorage.setItem("auth_provider_preference", "Twitter");
    localStorage.setItem("auth_return_to", window.location.pathname);

    // Navigate to backend redirect endpoint. Server-side 302 redirect is less likely
    // to trigger Android App Links / iOS Universal Links, reducing X app interception.
    // sessionId is encoded in the OAuth state parameter (composite state), eliminating
    // browser storage dependency that breaks on mobile app-switch.
    window.location.href = `${import.meta.env.VITE_TWITTER_AUTH_API}/login?mode=redirect`;
  };

  const signInWithWallet = async (identityId: string, cognitoToken: string | undefined, walletAddress: string, connectorName?: string) => {
    clearError();
    setIsLoading(true);
    const provider = connectorName || "Wallet";
    localStorage.setItem("auth_provider_preference", provider);

    try {
      logger.debug("Wallet authentication successful", { identityId, walletAddress, provider });

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
        provider,
        walletAddress: walletAddress.toLowerCase(),
        cognitoToken,
        profileImageUrl: profileData.profileImageUrl,
        linkedAccounts: profileData.linkedAccounts || {},
      };

      // Save to sessionStorage and state (sessionStorage for security)
      sessionStorage.setItem("nasun_user_profile", JSON.stringify(userData));
      setUser(userData);

      logger.log("Wallet sign-in successful:", { identityId, walletAddress, provider });
    } catch (error) {
      logger.error("Wallet sign-in failed", error);
      const formattedError = new Error(formatErrorMessage(error));
      setError(formattedError);
      throw formattedError;
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
      localStorage.removeItem("auth_flow_type");
      localStorage.removeItem("battalion_nft_session_id");
      localStorage.removeItem("twitter_link_session");
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
    signInWithWallet,
    logout,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
