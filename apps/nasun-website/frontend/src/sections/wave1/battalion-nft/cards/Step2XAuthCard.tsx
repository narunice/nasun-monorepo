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
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { library } from "@fortawesome/fontawesome-svg-core";
import { fab } from "@fortawesome/free-brands-svg-icons";
import { InlineLoading, DividerBox, OuterBox } from "@/components/ui";

// 브랜드 아이콘 추가
library.add(fab);

interface XAuthCardProps {
  onAuthSuccess: (userId: string, username: string) => void;
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
  const { t } = useTranslation("battalion-nft");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasHandledRef = useRef(false);

  const handleTwitterCallback = useCallback(
    async (code: string, state: string, sessionId: string) => {
      try {
        setIsLoading(true);
        setError(null);

        console.log("[XAuthCard] Handling Twitter callback:", { code, state, sessionId });

        const response = await fetch(`${import.meta.env.VITE_TWITTER_AUTH_API}/callback`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ code, state, sessionId, battalionNft: true }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Twitter OAuth callback failed");
        }

        const data = await response.json();
        console.log("[XAuthCard] Twitter callback success:", data);

        // Extract userId and username
        const userId = data.twitterId;
        const username = data.twitterHandle || data.username;

        if (!userId || !username) {
          throw new Error("Failed to get user information from Twitter");
        }

        // Store Access Token for Battalion NFT verification (Like 조회용)
        // Security: Using sessionStorage instead of localStorage to reduce XSS exposure
        if (data.xAccessToken) {
          console.log("[XAuthCard] Storing X Access Token for verification (sessionStorage)");
          sessionStorage.setItem("battalion_nft_x_access_token", data.xAccessToken);
        } else {
          console.warn("[XAuthCard] No xAccessToken in response - Like verification may fail");
        }

        // Clean up
        sessionStorage.removeItem("battalion_nft_twitter_session");
        window.history.replaceState({}, document.title, window.location.pathname);

        // Notify parent component
        onAuthSuccess(userId, username);
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
    const state = url.searchParams.get("state");
    const sessionId = sessionStorage.getItem("battalion_nft_twitter_session");

    if (code && state && sessionId) {
      hasHandledRef.current = true;
      handleTwitterCallback(code, state, sessionId);
    }
  }, [handleTwitterCallback]);

  const handleXLogin = async () => {
    try {
      setIsLoading(true);
      setError(null);

      console.log("[XAuthCard] Initiating X OAuth...");

      const response = await fetch(`${import.meta.env.VITE_TWITTER_AUTH_API}/login`);

      if (!response.ok) {
        throw new Error("Failed to initiate X OAuth");
      }

      const { authUrl, sessionId } = await response.json();

      console.log("[XAuthCard] X OAuth initiated:", { authUrl, sessionId });

      // Save session ID for callback verification
      // Security: Using sessionStorage instead of localStorage to reduce XSS exposure
      sessionStorage.setItem("battalion_nft_twitter_session", sessionId);

      // Redirect to Twitter OAuth
      window.location.href = authUrl;
    } catch (err: unknown) {
      const error = err as Error;
      console.error("[XAuthCard] X login error:", error);
      setError(error.message || "Failed to connect to X (Twitter)");
      setIsLoading(false);
    }
  };

  return (
    <OuterBox color="c5" className="max-w-3xl mx-auto">
      {/* Header with X Icon */}
      <div className="mb-4 text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <h4 className="!font-rubik font-medium">Connect</h4>
          <FontAwesomeIcon icon={["fab", "x-twitter"]} className="w-7 h-7 text-nasun-white" />
        </div>
        <p>{t("step2.description")}</p>
      </div>

      {/* Simplified Info Box */}
      <DividerBox color="c4" padding="sm" className="mb-6 md:mb-8 lg:mb-10">
        <p className="text-nasun-white mb-3">{t("step2.infoSimplified")}</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>{t("step2.verifyLikes")}</li>
          <li>{t("step2.verifyRetweets")}</li>
          <li>{t("step2.privacyNote")}</li>
          <li>{t("step2.notSignUp")}</li>
        </ul>
      </DividerBox>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-900/20 rounded-lg border border-red-700">
          <p className="text-red-200">❌ {error}</p>
        </div>
      )}

      {/* Connect Button */}
      <Button
        onClick={handleXLogin}
        disabled={isLoading}
        variant="c5"
        className="flex  mx-auto"
        size="lg"
      >
        {isLoading ? (
          <InlineLoading message={t("step2.connecting")} size="md" className="text-white" />
        ) : (
          <>
            <span>Verify with </span>
            <FontAwesomeIcon icon={["fab", "x-twitter"]} className="w-5 h-5 pl-2" />
          </>
        )}
      </Button>
    </OuterBox>
  );
};
