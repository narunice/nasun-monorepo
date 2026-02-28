import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageLayout } from "@/components/layout/PageLayout";
import { PageLoading } from "@/components/ui";
import ErrorBoundary from "@/components/layout/ErrorBoundary";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth"; // 내부 경로는 상대 경로 유지
import logger from "@/lib/logger";
import { ZkLoginCallback } from "@nasun/wallet-ui";
import { getZkLoginReturnUrl, clearZkLoginReturnUrl } from "@nasun/wallet";
import { isValidReturnUrl } from "../utils/urlValidation";

export default function Callback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation("common");
  const { isAuthenticated, isLoading, user, error } = useAuth();
  const hasHandledRef = useRef(false);

  // Check if this is a zkLogin callback (Implicit Flow uses URL hash)
  // Both Cognito auth and zkLogin use Google Implicit Flow with id_token in hash,
  // so we also check for the zkLogin session key to distinguish between them.
  const isZkLogin = window.location.hash.includes("id_token=") &&
    !!sessionStorage.getItem("nasun:zklogin:session");

  useEffect(() => {
    // Prevent double execution in React StrictMode
    if (hasHandledRef.current || isZkLogin) {
      return;
    }

    // Battalion NFT OAuth callback — must be checked FIRST before any auth logic
    // The user may already be authenticated (e.g. MetaMask), so we must intercept
    // the battalion NFT flow before the "already authenticated" redirect fires
    // Primary: sessionStorage (secure), Fallback: localStorage flow type flag (non-sensitive)
    const isBattalionNftSession = sessionStorage.getItem('battalion_nft_twitter_session')
      || localStorage.getItem('auth_flow_type') === 'battalion_nft';
    if (isBattalionNftSession) {
      hasHandledRef.current = true;
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const target = code && state
        ? `/wave1/battalion-nft?code=${code}&state=${state}`
        : '/wave1/battalion-nft';
      localStorage.removeItem('auth_flow_type');
      logger.log("Battalion NFT OAuth callback detected, redirecting to", target);
      navigate(target, { replace: true });
      return;
    }

    // Case 1: The OAuth provider itself returned an error in the URL
    if (searchParams.has("error")) {
      const errorType = searchParams.get("error");
      logger.error("Authentication provider returned an error:", errorType);

      // Check if this is an account linking attempt (Twitter or Google)
      const isTwitterLinking = sessionStorage.getItem('twitter_link_session');
      const isGoogleLinking = sessionStorage.getItem('google_link_session');

      if (isTwitterLinking || isGoogleLinking) {
        // User cancelled during account linking - redirect back to My Account
        logger.log("User cancelled account linking, redirecting to My Account");

        // Mark as handled to prevent double execution
        hasHandledRef.current = true;

        // Clean up session storage
        sessionStorage.removeItem('twitter_link_session');
        sessionStorage.removeItem('google_link_session');

        // Redirect to My Account with cancellation message
        const provider = isTwitterLinking ? 'Twitter' : 'Google';
        navigate(`/my-account?message=account_linking_cancelled&provider=${provider}`, { replace: true });
        return;
      }

      // Otherwise, it's a regular login error - redirect to home
      hasHandledRef.current = true;
      navigate("/", { replace: true });
      return;
    }

    // Case 2: Our AuthContext caught a specific error during processing
    if (error) {
      logger.error("AuthContext reported an error:", error);
      hasHandledRef.current = true;
      navigate("/", { replace: true });
      return;
    }

    // Case 3: Processing is finished, and we are successfully authenticated
    if (!isLoading && isAuthenticated && user) {
      hasHandledRef.current = true;
      const savedPath = localStorage.getItem('auth_return_to');
      localStorage.removeItem('auth_return_to');

      if (savedPath && savedPath !== '/' && isValidReturnUrl(savedPath)) {
        navigate(savedPath, { replace: true });
        return;
      }

      // Use role from user store (populated by ensureUserProfile during OAuth flow)
      navigate(user.role === 'ADMIN' ? '/admin' : '/my-account', { replace: true });
    }

    // Case 4: isLoading finished but not authenticated and no error.
    // This can happen if the linking flow failed silently (e.g. refreshAndSaveUserProfile threw
    // but the error was not propagated to AuthContext).
    if (!isLoading && !isAuthenticated && !error) {
      hasHandledRef.current = true;
      navigate("/", { replace: true });
      return;
    }

    // Otherwise, we are still loading, so the component will just keep showing the spinner.

  }, [navigate, searchParams, isAuthenticated, isLoading, user, error, isZkLogin]);

  if (isZkLogin) {
    return (
      <div className="min-h-screen bg-nasun-black flex items-center justify-center">
        <div className="bg-zinc-900 rounded-2xl p-8 max-w-md w-full mx-4 shadow-xl border border-zinc-800">
          <ZkLoginCallback
            onSuccess={() => {
              const returnUrl = getZkLoginReturnUrl();
              clearZkLoginReturnUrl();
              const target = returnUrl && isValidReturnUrl(returnUrl) ? returnUrl : '/';
              navigate(target, { replace: true });
            }}
            onError={(err) => {
              logger.error("zkLogin error:", err);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <PageLayout>
        <div className="flex flex-col items-center justify-center min-h-[50vh]">
          <PageLoading />
          <p className="mt-4">{t("auth.processing_message")}</p>
        </div>
      </PageLayout>
    </ErrorBoundary>
  );
}
