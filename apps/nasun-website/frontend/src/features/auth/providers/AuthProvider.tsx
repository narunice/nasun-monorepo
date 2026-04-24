import React, { createContext, useEffect, useState, useCallback, useRef } from "react";
import logger from "@/lib/logger";
import { formatErrorMessage } from "@/lib/errorParser";
import { useUserStore } from "@/store/userStore";
import type { UserData } from "@/store/userStore";
import { useBattalionNftStore } from "@/stores/useBattalionNftStore";
import { AuthContextType } from "../types";
import { linkAccounts, LinkNeedsConfirmError } from "../utils/authApi";
import { isValidReturnUrl } from "../utils/urlValidation";
import { isTokenExpired } from "../utils/tokenUtils";
import { refreshAndSaveUserProfile } from "../services/userProfileService";
import { getMyRank } from "@/features/leaderboard-v3/services/leaderboardV3Api";
import { registerWallet } from "@/services/suiWalletApi";
import { handleGoogleOAuthRedirect } from "../handlers/googleOAuthHandler";
import { handleTwitterOAuthRedirect } from "../handlers/twitterOAuthHandler";
import { WALLET_IDENTITY_CHANGED_EVENT } from "@nasun/wallet";

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_COOKIE_NAME = "nasun_browser_session";

function hasSessionCookie(): boolean {
  return document.cookie.split("; ").some((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
}

function setSessionCookie(): void {
  // Persistent cookie (24h) survives mobile browser background kills
  // while still auto-expiring for shared device safety.
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${SESSION_COOKIE_NAME}=1; path=/; SameSite=Lax; max-age=86400${secure}`;
}

function deleteSessionCookie(): void {
  document.cookie = `${SESSION_COOKIE_NAME}=1; path=/; max-age=0`;
}

// Shared cleanup for all auth state (localStorage, sessionStorage, cookie, NFT store).
// Used by both checkAuthStatus (session/token expiry) and logout (user-initiated).
function clearAllAuthState(): void {
  localStorage.removeItem("nasun_user_profile");
  localStorage.removeItem("auth_provider_preference");
  deleteSessionCookie();
  useBattalionNftStore.getState().reset();
  localStorage.removeItem("battalion-nft-state");
  localStorage.removeItem("auth_flow_type");
  localStorage.removeItem("battalion_nft_session_id");
  localStorage.removeItem("twitter_link_session");
  sessionStorage.removeItem("battalion_nft_twitter_session");
  localStorage.removeItem("nasun_wallet_session");
  localStorage.removeItem("nasun:zklogin");
  localStorage.removeItem("nasun:zklogin:state");
  sessionStorage.clear();
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading, setUser, clearUser, setIsLoading } = useUserStore();
  const [error, setError] = useState<Error | null>(null);
  const oauthProcessingRef = useRef(false);

  const clearError = () => setError(null);

  const checkAuthStatus = useCallback(async () => {
    setIsLoading(true);
    clearError();
    try {
      const cachedUser = localStorage.getItem("nasun_user_profile");

      if (cachedUser && !hasSessionCookie()) {
        // Cookie missing but localStorage has session data.
        // Use JWT validity as ground truth: if the token is still valid,
        // the cookie was lost to browser settings/extension, so restore it.
        // If the token is expired or absent, the session has genuinely expired.
        const tempParsed = JSON.parse(cachedUser);
        if (tempParsed.cognitoToken && !isTokenExpired(tempParsed.cognitoToken)) {
          logger.debug("Session cookie missing but token valid, restoring cookie");
          setSessionCookie();
        } else {
          logger.debug("Session expired (cookie missing, token expired or absent)");
          clearAllAuthState();
          clearUser();
          return;
        }
      }

      if (cachedUser) {
        const parsed = JSON.parse(cachedUser);

        // JWT expiry guard: strip expired token but keep session alive.
        // Server validates via JWKS independently; authenticated API calls
        // will fail with 401 and individual features handle re-auth as needed.
        if (parsed.cognitoToken && isTokenExpired(parsed.cognitoToken)) {
          logger.debug("Cognito token expired, stripping from session");
          delete parsed.cognitoToken;
          localStorage.setItem("nasun_user_profile", JSON.stringify(parsed));
        }

        setUser(parsed);

        // Refresh from server in background to catch changes from other devices/tabs
        if (parsed.identityId) {
          const expectedId = parsed.identityId;
          refreshAndSaveUserProfile(expectedId, parsed.cognitoToken)
            .then(() => {
              // Guard: only update if the same user is still logged in (prevents sign-out race)
              const fresh = useUserStore.getState().user;
              if (fresh?.identityId === expectedId) setUser(fresh);
            })
            .catch(() => logger.debug("Background profile refresh failed (non-blocking)"));
        }
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
      let userInfo: { name: string; email?: string };
      let twitterData: { twitterHandle?: string; originalTwitterHandle?: string; twitterId?: string; profileImageUrl?: string } | null = null;

      if (provider === "Google") {
        const result = await handleGoogleOAuthRedirect(url);
        identityId = result.identityId;
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
          // Primary: localStorage (persists across tabs and sessions)
          const cachedProfile = localStorage.getItem("nasun_user_profile");
          // Fallback: cognitoToken stored in link session (survives mobile redirect via localStorage)
          const primaryCognitoToken = cachedProfile
            ? JSON.parse(cachedProfile).cognitoToken
            : parsed.cognitoToken;

          await linkAccounts(
            primaryIdentityId,
            identityId,
            provider as "Google" | "Twitter",
            primaryCognitoToken,
            {
              username: userInfo.name,
              email: userInfo.email,
              ...(twitterData?.twitterHandle && { twitterHandle: twitterData.twitterHandle }),
              ...(twitterData?.originalTwitterHandle && { originalTwitterHandle: twitterData.originalTwitterHandle }),
              ...(twitterData?.twitterId && { twitterId: twitterData.twitterId }),
              ...(twitterData?.profileImageUrl && { profileImageUrl: twitterData.profileImageUrl }),
            }
          );
          sessionStorage.removeItem(linkSessionKey);
          await refreshAndSaveUserProfile(primaryIdentityId, primaryCognitoToken);
          setUser(useUserStore.getState().user);

          // Propagate fresh X profile to leaderboard tables (fire-and-forget).
          // getMyRank triggers syncProfileFromUserProfiles() on the backend,
          // updating both accounts + season-accounts tables.
          const freshUser = useUserStore.getState().user;
          const syncHandle = freshUser?.twitterHandle
            || freshUser?.linkedAccounts?.twitter?.twitterHandle;
          if (syncHandle) {
            getMyRank({ username: syncHandle }).catch(() => {});
          }
        } else {
          // Linking session expired or lost (e.g. mobile app-switch)
          logger.warn(`Linking session not found for ${provider}, redirecting to my-account`);
          window.location.href = "/my-account?error=linking_session_expired";
          return true;
        }
      } else {
        // Legacy OAuth login is disabled. Only account linking is supported.
        logger.warn(`Blocked legacy ${provider} OAuth login attempt (non-linking flow)`);
        window.location.href = "/";
        return true;
      }
    } catch (e) {
      const err = e as Error;
      logger.error(`Error handling ${provider} redirect:`, err);

      if (isLinkingFlow) {
        // Linking a secondary provider must never destroy the primary session.
        // Historical bug: any throw here (expired primary cognitoToken, backend
        // conflict when the OAuth identity is already linked elsewhere, transient
        // network error) called clearUser() and logged the user out. Google is
        // the most visible case because it is the only linkable provider that
        // creates a Cognito Federated Identity, which produces stable 4xx
        // conflicts on repeated attempts (e.g. the email already owns a
        // zkLogin wallet — backend returns 409 with an actionable message).
        logger.warn(`${provider} linking failed, preserving primary session`);

        // Rehydrate the primary user from localStorage so <Callback> does not
        // briefly fall into Case 4 (navigate to "/") before the hard redirect
        // below completes.
        const cachedProfileRaw = localStorage.getItem("nasun_user_profile");
        try {
          if (cachedProfileRaw) {
            const parsed = JSON.parse(cachedProfileRaw);
            if (parsed?.identityId) setUser(parsed);
          }
        } catch {
          /* ignore parse error */
        }

        // Special-case the "already linked elsewhere" 409: stash the conflict
        // payload + the secondary identity so MyAccount can prompt the user
        // to confirm transferring the OAuth identity to this wallet, then
        // re-call linkAccounts with confirmTransfer: true.
        if (err instanceof LinkNeedsConfirmError && (provider === "Google" || provider === "Twitter")) {
          try {
            const cachedProfile = cachedProfileRaw ? JSON.parse(cachedProfileRaw) : null;
            const targetPrimaryId = cachedProfile?.identityId;
            sessionStorage.setItem(
              "account_link_confirm_pending",
              JSON.stringify({
                provider,
                primaryIdentityId: targetPrimaryId,
                secondaryIdentityId: identityId!,
                secondaryInfo: {
                  username: userInfo!.name,
                  email: userInfo!.email,
                  ...(twitterData?.twitterHandle && { twitterHandle: twitterData.twitterHandle }),
                  ...(twitterData?.originalTwitterHandle && { originalTwitterHandle: twitterData.originalTwitterHandle }),
                  ...(twitterData?.twitterId && { twitterId: twitterData.twitterId }),
                  ...(twitterData?.profileImageUrl && { profileImageUrl: twitterData.profileImageUrl }),
                },
                existingPrimary: err.detail.existingPrimary,
                at: Date.now(),
              }),
            );
          } catch {
            /* sessionStorage may be blocked; user will see generic linking_failed instead */
            window.location.href = `/my-account?error=linking_failed&provider=${encodeURIComponent(provider)}`;
            return true;
          }
          window.location.href = `/my-account?confirm=link_transfer&provider=${encodeURIComponent(provider)}`;
          return true;
        }

        // Carry the backend-supplied message across the hard redirect so the
        // user sees what actually went wrong instead of a generic
        // "linking failed" notification.
        try {
          sessionStorage.setItem(
            "account_linking_error",
            JSON.stringify({ provider, message: err.message, at: Date.now() }),
          );
        } catch {
          /* sessionStorage may be blocked; generic message will show instead */
        }
        window.location.href = `/my-account?error=linking_failed&provider=${encodeURIComponent(provider)}`;
        return true;
      }

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

  const signInWithWallet = useCallback(async (identityId: string, cognitoToken: string | undefined, walletAddress: string, connectorName?: string, walletProof?: string, proofIssuedAt?: string) => {
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
          `${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)}`,
        provider,
        walletAddress: walletAddress.toLowerCase(),
        cognitoToken,
        customDisplayName: profileData.customDisplayName,
        profileImageUrl: profileData.profileImageUrl,
        linkedAccounts: profileData.linkedAccounts || {},
      };

      // Save to localStorage and state; session cookie gates browser-restart expiry
      localStorage.setItem("nasun_user_profile", JSON.stringify(userData));
      setSessionCookie();
      setUser(userData);

      // Auto-register first wallet (fire-and-forget; 409 = already registered = OK)
      if (walletProof && proofIssuedAt && cognitoToken) {
        registerWallet(walletAddress.toLowerCase(), walletProof, proofIssuedAt, cognitoToken)
          .catch((e) => logger.warn("Auto-register wallet failed (non-blocking):", e));
      }

      logger.log("Wallet sign-in successful:", { identityId, walletAddress, provider });
    } catch (error) {
      logger.error("Wallet sign-in failed", error);
      const formattedError = new Error(formatErrorMessage(error));
      setError(formattedError);
      throw formattedError;
    } finally {
      setIsLoading(false);
    }
  }, [setIsLoading, setUser]);

  // Clear stale auth session when wallet identity changes (create/import).
  // The old Cognito token is tied to the previous wallet address and must not
  // leak into the new wallet's session.
  // When reason is "add" (registering additional wallet), preserve the session.
  useEffect(() => {
    const handler = (e: Event) => {
      const reason = (e as CustomEvent)?.detail?.reason ?? "switch";
      if (reason === "add") {
        logger.debug("Wallet added for registration, keeping auth session");
        return;
      }
      logger.debug("Wallet identity changed, clearing auth session");
      clearAllAuthState();
      clearUser();
    };
    window.addEventListener(WALLET_IDENTITY_CHANGED_EVENT, handler);
    return () => window.removeEventListener(WALLET_IDENTITY_CHANGED_EVENT, handler);
  }, [clearUser]);

  const logout = async () => {
    setIsLoading(true);
    try {
      clearAllAuthState();
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
    signInWithWallet,
    logout,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
