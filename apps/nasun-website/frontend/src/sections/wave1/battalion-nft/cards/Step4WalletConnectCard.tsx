/**
 * Wallet Connect Card Component
 *
 * @description
 * MetaMask 지갑 연결을 위한 카드 컴포넌트
 *
 * @author Claude Code
 * @date 2025-10-25
 */

import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/features/auth";
import { useUserStore } from "../../../../store/userStore";
import { useBattalionNftStore } from "../../../../stores/useBattalionNftStore";
import {
  isMetaMaskInstalled as checkMetaMaskInstalled,
  connectWallet,
  signMessage,
} from "../../../../utils/metamaskUtils";
import { authenticateWithMetaMask } from "../../../../services/metamaskApi";
import { ButtonV3 } from "@/components/ui/button-v3";
import logger from "../../../../lib/logger";
import { InlineLoading, DividerBox, OuterBox } from "@/components/ui";

interface WalletConnectCardProps {
  onWalletConnected: (address: string) => void;
}

/**
 * Wallet Connect Card 컴포넌트
 *
 * @features
 * - MetaMask 설치 확인
 * - 지갑 연결 버튼
 * - 연결된 지갑 주소 표시 (축약 형식)
 * - MetaMask 설치 링크
 * - 연결 상태 표시
 */
export const WalletConnectCard: React.FC<WalletConnectCardProps> = ({ onWalletConnected }) => {
  const { t } = useTranslation("battalion-nft");
  const { user } = useAuth();
  const { updateUserProfile } = useUserStore();
  const { cognitoIdentityId, cognitoToken: storeCognitoToken } = useBattalionNftStore();
  const [isMetaMaskInstalled, setIsMetaMaskInstalled] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsMetaMaskInstalled(checkMetaMaskInstalled());

    // ✅ linkedWallet 확인 (이미 연결된 경우)
    const linkedWallet = user?.linkedAccounts?.metamask?.walletAddress;

    if (linkedWallet && window.ethereum) {
      // 이미 link된 경우 - eth_accounts로 확인
      window.ethereum
        .request({ method: "eth_accounts" })
        .then((accounts: string[]) => {
          if (accounts.length > 0) {
            const address = accounts[0];

            if (linkedWallet.toLowerCase() === address.toLowerCase()) {
              // 연결된 지갑과 일치 - 정상
              console.log("[WalletConnectCard] Wallet already linked:", address);
              setConnectedAddress(address);
            } else {
              // 다른 지갑으로 변경됨
              console.warn("[WalletConnectCard] Wallet address mismatch - clearing");
              setConnectedAddress(null);
            }
          } else {
            // MetaMask에 계정이 없음
            console.warn("[WalletConnectCard] No accounts in MetaMask");
            setConnectedAddress(null);
          }
        })
        .catch((err: Error) => {
          console.error("Failed to check accounts:", err);
          setConnectedAddress(null);
        });
    } else {
      // linkedWallet이 없으면 connect button 표시
      console.log("[WalletConnectCard] No linked wallet - showing connect button");
      setConnectedAddress(null);
    }
  }, [user]);

  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      setError(null);

      // 1. Check if already linked
      const linkedWallet = user?.linkedAccounts?.metamask?.walletAddress;

      // 2. Connect wallet
      const walletAddress = await connectWallet();
      logger.log("[WalletConnectCard] Connected wallet:", walletAddress);

      // 3. Determine the primary identity ID (from store or auth context)
      const primaryIdentityId = cognitoIdentityId || user?.identityId;

      // 4. If not linked, authenticate and link account
      if (!linkedWallet) {
        logger.log("[WalletConnectCard] Wallet not linked - authenticating...");

        if (!primaryIdentityId) {
          throw new Error("Missing Cognito identity ID. Please restart the event from Step 1.");
        }

        // 4a. Authenticate with MetaMask (Challenge/Response)
        const authResult = await authenticateWithMetaMask(walletAddress, async (message) => {
          return await signMessage(message, walletAddress);
        });

        logger.log("[WalletConnectCard] MetaMask auth successful:", authResult);

        // 4b. Link accounts
        const linkAccountApi = import.meta.env.VITE_LINK_ACCOUNT_API;
        if (!linkAccountApi) {
          throw new Error("Link Account API is not configured");
        }

        const linkHeaders: Record<string, string> = {
          "Content-Type": "application/json",
        };
        // Use Battalion NFT store token (from Step 2 Twitter auth) or logged-in user's token
        const cognitoToken = storeCognitoToken || user?.cognitoToken;
        if (cognitoToken) {
          linkHeaders["Authorization"] = `Bearer ${cognitoToken}`;
        }

        const linkResponse = await fetch(linkAccountApi, {
          method: "POST",
          headers: linkHeaders,
          body: JSON.stringify({
            primaryIdentityId,
            secondaryIdentityId: authResult.identityId,
            secondaryProvider: "MetaMask",
          }),
        });

        if (!linkResponse.ok) {
          const errorBody = await linkResponse.text();
          console.error("[WalletConnectCard] Link API error:", linkResponse.status, errorBody);
          throw new Error(`Failed to link MetaMask account: ${linkResponse.status} ${errorBody}`);
        }

        logger.log("[WalletConnectCard] Account linked successfully");

        // 4c. Fetch updated profile
        const userProfileApi = import.meta.env.VITE_USER_PROFILE_API;
        const profileResponse = await fetch(`${userProfileApi}?identityId=${primaryIdentityId}`);

        if (profileResponse.ok) {
          const updatedProfile = await profileResponse.json();
          updateUserProfile(updatedProfile);
          sessionStorage.setItem("nasun_user_profile", JSON.stringify(updatedProfile));
          logger.log("[WalletConnectCard] User profile updated");
        } else {
          throw new Error("Failed to fetch updated profile");
        }
      } else {
        logger.log("[WalletConnectCard] Wallet already linked - skipping link step");
      }

      // 5. Set connected address and proceed to next step
      setConnectedAddress(walletAddress);
      onWalletConnected(walletAddress);
    } catch (err: unknown) {
      console.error("[WalletConnectCard] Connection error:", err);
      const errorMessage = err instanceof Error ? err.message : t("step4.errors.connectionFailed");
      setError(errorMessage);
    } finally {
      setIsConnecting(false);
    }
  };

  const shortenAddress = (address: string): string => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  if (!isMetaMaskInstalled) {
    return (
      <OuterBox color="nw0" className=" max-w-3xl mx-auto">
        <div className="text-center">
          {/* MetaMask Logo */}
          <div className="mb-6 flex justify-center">
            <div className="w-20 h-20 bg-orange-900/20 rounded-full flex items-center justify-center">
              <img src="/MetaMask_Fox.svg" alt="MetaMask" className="w-12 h-12" />
            </div>
          </div>

          <h3 className="!font-rubik font-medium mb-3">{t("step4.title")}</h3>

          <p className="mb-6">{t("step4.errors.noMetaMask")}</p>

          <ButtonV3 variant="nw4" size="lg" asChild>
            <a href="https://metamask.io/download/" target="_blank" rel="noopener noreferrer">
              {t("step4.installLink")}
              <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </a>
          </ButtonV3>

          <p className="mt-4">{t("step4.installing")}</p>
        </div>
      </OuterBox>
    );
  }

  return (
    <OuterBox color="nw0" className=" max-w-3xl mx-auto">
      {/* Header */}
      <div className="text-center">
        <h4 className="!font-rubik font-medium mb-4 max-w-xl mx-auto">{t("step4.title")}</h4>
        <p className="mb-6">{t("step4.description")}</p>
      </div>

      {/* Connected Wallet Display */}
      {connectedAddress ? (
        <>
          <DividerBox color="green" padding="sm" icon="✅" className="mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="mb-1">{t("step4.success")}</p>
                <p>{shortenAddress(connectedAddress)}</p>
              </div>
              <div className="w-10 h-10 bg-green-950 rounded-full flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-green-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
            </div>
          </DividerBox>

          {/* Next Step Button */}
          <ButtonV3
            onClick={() => onWalletConnected(connectedAddress)}
            variant="green"
            size="lg"
            className="flex mx-auto"
          >
            <span>{t("step4.nextButton")}</span>
            <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
          </ButtonV3>
        </>
      ) : (
        <>
          {/* MetaMask Info */}
          <DividerBox
            color="nw3"
            padding="sm"
            icon="ℹ️"
            title={t("step4.infoTitle")}
            className="mb-6 !bg-black/60"
            titleClassName="!text-nasun-nw4"
            hideDivider={true}
          >
            <p className="pt-2">{t("step4.infoDescription")}</p>
            <p className="mt-2 text-yellow-200"> {t("step4.signatureNote")}</p>
          </DividerBox>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-900/20 rounded-lg border border-red-700">
              <p className="text-red-200">❌ {error}</p>
            </div>
          )}

          {/* Connect Button */}
          <ButtonV3
            onClick={handleConnect}
            disabled={isConnecting}
            variant="nw1"
            size="lg"
            className="flex mx-auto"
          >
            {isConnecting ? (
              <InlineLoading message={t("step4.connecting")} size="md" className="text-white" />
            ) : (
              <>
                <img src="/MetaMask_Fox.svg" alt="MetaMask" className="w-6 h-6 mr-2" />
                <span>{t("step4.button")}</span>
              </>
            )}
          </ButtonV3>
        </>
      )}
    </OuterBox>
  );
};
