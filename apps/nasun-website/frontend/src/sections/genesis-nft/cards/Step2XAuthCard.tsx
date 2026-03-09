/**
 * X (Twitter) Auth Card Component
 *
 * @description
 * Genesis NFT Event용 X(Twitter) OAuth 연동 카드 컴포넌트
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { ButtonV3 } from "@/components/ui/button-v3";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { library } from "@fortawesome/fontawesome-svg-core";
import { fab } from "@fortawesome/free-brands-svg-icons";
import { InlineLoading, DividerBox, OuterBox } from "@/components/ui";

library.add(fab);

interface XAuthCardProps {
  onAuthSuccess: (userId: string, username: string, identityId: string, cognitoToken?: string) => void;
}

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
          body: JSON.stringify({ code, state: compositeState, sessionId, genesisNft: true }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || "Twitter OAuth callback failed");
        }

        const data = await response.json();
        console.log("[XAuthCard] Twitter callback success:", data);

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

        // Clean up all storage used by the OAuth flow
        sessionStorage.removeItem("genesis_nft_twitter_session");
        localStorage.removeItem("genesis_nft_session_id");
        localStorage.removeItem("auth_flow_type");
        window.history.replaceState({}, document.title, window.location.pathname);

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
    if (hasHandledRef.current) {
      return;
    }

    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const compositeState = url.searchParams.get("state");

    if (!code || !compositeState) return;

    let sessionId: string | null = null;
    const dotIdx = compositeState.lastIndexOf(".");
    if (dotIdx > 0) {
      sessionId = compositeState.substring(dotIdx + 1);
    }

    if (!sessionId) {
      sessionId = sessionStorage.getItem("genesis_nft_twitter_session")
        || localStorage.getItem("genesis_nft_session_id");
    }

    if (sessionId) {
      hasHandledRef.current = true;
      handleTwitterCallback(code, compositeState, sessionId);
    } else {
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

      localStorage.setItem("auth_flow_type", "genesis_nft");
      localStorage.setItem("auth_provider_preference", "Twitter");

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
        className="flex mx-auto"
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
