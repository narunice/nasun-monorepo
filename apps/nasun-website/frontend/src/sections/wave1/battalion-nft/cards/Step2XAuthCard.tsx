/**
 * X (Twitter) Auth Card Component
 *
 * @description
 * NFT Event용 X(Twitter) OAuth 연동 카드 컴포넌트
 *
 * @author Claude Code
 * @date 2025-10-25
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { ButtonV3 } from "@/components/ui/button-v3";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { library } from "@fortawesome/fontawesome-svg-core";
import { fab } from "@fortawesome/free-brands-svg-icons";
import { InlineLoading, DividerBox, OuterBox } from "@/components/ui";

// 브랜드 아이콘 추가
library.add(fab);

interface XAuthCardProps {
  onAuthSuccess: (userId: string, username: string, identityId: string, cognitoToken?: string) => void;
}

/**
 * X Auth Card 컴포넌트
 *
 * @features
 * - X(Twitter) OAuth 로그인 버튼
 * - OAuth 콜백 처리
 * - 사용자 정보 표시 (username)
 * - 로딩 상태 표시
 * - 에러 처리
 */
export const XAuthCard: React.FC<XAuthCardProps> = ({ onAuthSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasHandledRef = useRef(false);

  const handleTwitterCallback = useCallback(
    async (code: string, compositeState: string, sessionId: string) => {
      try {
        setIsLoading(true);
        setError(null);

        console.log("[XAuthCard] Handling Twitter callback:", { code, compositeState, sessionId });

        const response = await fetch(`${import.meta.env.VITE_TWITTER_AUTH_API}/callback`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ code, state: compositeState, sessionId, battalionNft: true }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Twitter OAuth callback failed");
        }

        const data = await response.json();
        console.log("[XAuthCard] Twitter callback success:", data);
        console.log("[XAuthCard] Handle fields:", {
          originalTwitterHandle: data.originalTwitterHandle,
          twitterHandle: data.twitterHandle,
          username: data.username,
        });

        // Extract userId, username, and identityId (prefer original casing for display)
        const userId = data.twitterId;
        const username = data.originalTwitterHandle || data.twitterHandle || data.username;
        const identityId = data.identityId;

        if (!userId || !username) {
          throw new Error("Failed to get user information from Twitter");
        }

        if (!identityId) {
          console.error("[XAuthCard] Missing identityId from Twitter callback response");
          throw new Error("Failed to get Cognito identity from Twitter authentication");
        }

        // X access token is now stored server-side (backend proxy pattern)
        // No token handling needed in frontend

        // Clean up all storage used by the OAuth flow
        sessionStorage.removeItem("battalion_nft_twitter_session");
        localStorage.removeItem("battalion_nft_session_id");
        localStorage.removeItem("auth_flow_type");
        window.history.replaceState({}, document.title, window.location.pathname);

        // Notify parent component (pass cognitoToken for link-account API auth)
        onAuthSuccess(userId, username, identityId, data.cognitoToken);
      } catch (err: unknown) {
        const error = err as Error;
        console.error("[XAuthCard] Twitter callback error:", error);
        setError(error.message || "Failed to authenticate with X (Twitter)");
      } finally {
        setIsLoading(false);
      }
    },
    [onAuthSuccess],
  );

  useEffect(() => {
    // Prevent double execution in React StrictMode
    if (hasHandledRef.current) {
      return;
    }

    // Check if we're coming back from Twitter OAuth redirect
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const compositeState = url.searchParams.get("state");

    if (!code || !compositeState) return;

    // Primary: extract sessionId from composite state "{randomState}.{sessionId}"
    // This survives mobile app-switch that clears browser storage
    let sessionId: string | null = null;
    const dotIdx = compositeState.lastIndexOf(".");
    if (dotIdx > 0) {
      sessionId = compositeState.substring(dotIdx + 1);
    }

    // Fallback: browser storage (backward compat)
    if (!sessionId) {
      sessionId = sessionStorage.getItem("battalion_nft_twitter_session")
        || localStorage.getItem("battalion_nft_session_id");
    }

    if (sessionId) {
      hasHandledRef.current = true;
      handleTwitterCallback(code, compositeState, sessionId);
    } else {
      // All sessionId sources exhausted — show retry prompt
      hasHandledRef.current = true;
      setError("Authentication session expired. Please try again.");
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [handleTwitterCallback]);

  const handleXLogin = async () => {
    try {
      setIsLoading(true);
      setError(null);

      console.log("[XAuthCard] Initiating X OAuth via redirect mode...");

      // Non-sensitive routing flags in localStorage (survives mobile app-switch)
      localStorage.setItem("auth_flow_type", "battalion_nft");
      localStorage.setItem("auth_provider_preference", "Twitter");

      // Navigate to backend redirect endpoint. Server-side 302 is less likely to trigger
      // Android App Links / iOS Universal Links, reducing X app interception.
      // sessionId is encoded in the OAuth state parameter (composite state),
      // eliminating browser storage dependency that breaks on mobile app-switch.
      window.location.href = `${import.meta.env.VITE_TWITTER_AUTH_API}/login?mode=redirect`;
    } catch (err: unknown) {
      const error = err as Error;
      console.error("[XAuthCard] X login error:", error);
      setError(error.message || "Failed to connect to X (Twitter)");
      setIsLoading(false);
    }
  };

  return (
    <OuterBox color="nw0" className=" max-w-3xl mx-auto">
      {/* Header with X Icon */}
      <div className="mb-4 text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <h4 className="!font-rubik font-medium">Connect</h4>
          <FontAwesomeIcon icon={["fab", "x-twitter"]} className="w-7 h-7 text-nasun-white" />
        </div>
        <p>Please connect your X account to verify your event participation.</p>
      </div>

      {/* Simplified Info Box */}
      <DividerBox color="nw4" padding="sm" className="mb-6 md:mb-8 lg:mb-10 !bg-black/30">
        <p className="text-nasun-white">We briefly connect to verify your event tasks. Only your handle and ID are read.</p>
      </DividerBox>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-900/20 rounded-lg border border-red-700">
          <p className="text-red-200">❌ {error}</p>
        </div>
      )}

      {/* Connect Button */}
      <ButtonV3
        onClick={handleXLogin}
        disabled={isLoading}
        variant="nw1"
        className="flex  mx-auto"
        size="lg"
      >
        {isLoading ? (
          <InlineLoading message="Connecting..." size="md" className="text-white" />
        ) : (
          <>
            <span>Verify with </span>
            <FontAwesomeIcon icon={["fab", "x-twitter"]} className="w-5 h-5 pl-2" />
          </>
        )}
      </ButtonV3>
    </OuterBox>
  );
};
